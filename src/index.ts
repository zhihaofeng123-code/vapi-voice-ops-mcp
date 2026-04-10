import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { appConfig } from "./config.js";
import { ensureStorage } from "./storage/files.js";
import { createReservationCall } from "./tools/createReservationCall.js";
import { getCallStatus } from "./tools/getCallStatus.js";
import { listRecentCalls } from "./tools/listRecentCalls.js";
import { processLatestWebhook } from "./tools/processLatestWebhook.js";
import { handleWebhookRequest } from "./webhook/server.js";

function buildMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "vapi-voice-ops-mcp",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.registerTool("create_reservation_call", {
    description: "Create a Vapi outbound voice call to request a restaurant reservation.",
    inputSchema: {
      restaurantPhone: z.string().min(3).describe("Target restaurant phone number."),
      customerName: z.string().min(1).describe("Reservation name."),
      partySize: z.number().int().positive().describe("Number of diners."),
      date: z.string().min(1).describe("Requested reservation date."),
      time: z.string().min(1).describe("Requested reservation time."),
      notes: z.string().optional().describe("Optional request notes."),
      assistantId: z.string().optional().describe("Optional Vapi assistant override.")
    }
  }, async (args) => ({
    content: [{ type: "text", text: JSON.stringify(await createReservationCall(args), null, 2) }]
  }));

  server.registerTool("get_call_status", {
    description: "Fetch the latest status, transcript, and summary for a Vapi call.",
    inputSchema: {
      callId: z.string().min(1)
    }
  }, async (args) => ({
    content: [{ type: "text", text: JSON.stringify(await getCallStatus(args), null, 2) }]
  }));

  server.registerTool("process_latest_webhook", {
    description: "Normalize the latest stored Vapi webhook into a structured call result.",
    inputSchema: {
      callId: z.string().optional()
    }
  }, async (args) => ({
    content: [{ type: "text", text: JSON.stringify(await processLatestWebhook(args), null, 2) }]
  }));

  server.registerTool("list_recent_calls", {
    description: "List recent locally stored call records.",
    inputSchema: {
      limit: z.number().int().positive().max(100).optional()
    }
  }, async (args) => ({
    content: [{ type: "text", text: JSON.stringify(await listRecentCalls(args), null, 2) }]
  }));

  return server;
}

async function handleMcpRequest(request: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });
  const server = buildMcpServer();

  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } finally {
    await transport.close();
    await server.close();
  }
}

export async function fetch(request: Request): Promise<Response> {
  await ensureStorage();

  const url = new URL(request.url);

  if (url.pathname === "/health" && request.method === "GET") {
    return Response.json({ ok: true });
  }

  if (url.pathname === "/webhooks/vapi" && request.method === "POST") {
    return handleWebhookRequest(request);
  }

  if (url.pathname === "/mcp") {
    return handleMcpRequest(request);
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}

export default { fetch };

async function toWebRequest(request: IncomingMessage): Promise<Request> {
  const origin = `http://${request.headers.host ?? `127.0.0.1:${appConfig.port}`}`;
  const url = new URL(request.url ?? "/", origin);
  const method = request.method ?? "GET";
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  if (method === "GET" || method === "HEAD") {
    return new Request(url, { method, headers });
  }

  return new Request(url, {
    method,
    headers,
    body: Readable.toWeb(request) as ReadableStream,
    duplex: "half"
  } as RequestInit);
}

async function writeNodeResponse(response: Response, serverResponse: ServerResponse): Promise<void> {
  serverResponse.statusCode = response.status;
  response.headers.forEach((value, key) => {
    serverResponse.setHeader(key, value);
  });

  if (!response.body) {
    serverResponse.end();
    return;
  }

  const body = Readable.fromWeb(response.body as any);
  body.pipe(serverResponse);
}

async function startLocalServer(): Promise<void> {
  await ensureStorage();

  const server = createServer(async (request, response) => {
    try {
      const webRequest = await toWebRequest(request);
      const webResponse = await fetch(webRequest);
      await writeNodeResponse(webResponse, response);
    } catch (error) {
      console.error("Local server error:", error);
      response.statusCode = 500;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ error: "Internal server error" }));
    }
  });

  server.listen(appConfig.port, () => {
    console.error(`HTTP server listening on port ${appConfig.port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startLocalServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
