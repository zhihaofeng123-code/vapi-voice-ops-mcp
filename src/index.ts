import express, { type Request, type Response } from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { appConfig } from "./config.js";
import { ensureStorage } from "./storage/files.js";
import { registerWebhookRoutes } from "./webhook/server.js";
import { createReservationCall } from "./tools/createReservationCall.js";
import { getCallStatus } from "./tools/getCallStatus.js";
import { listRecentCalls } from "./tools/listRecentCalls.js";
import { processLatestWebhook } from "./tools/processLatestWebhook.js";

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
    content: [
      {
        type: "text",
        text: JSON.stringify(await createReservationCall(args), null, 2)
      }
    ]
  }));

  server.registerTool("get_call_status", {
    description: "Fetch the latest status, transcript, and summary for a Vapi call.",
    inputSchema: {
      callId: z.string().min(1)
    }
  }, async (args) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(await getCallStatus(args), null, 2)
      }
    ]
  }));

  server.registerTool("process_latest_webhook", {
    description: "Normalize the latest stored Vapi webhook into a structured call result.",
    inputSchema: {
      callId: z.string().optional()
    }
  }, async (args) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(await processLatestWebhook(args), null, 2)
      }
    ]
  }));

  server.registerTool("list_recent_calls", {
    description: "List recent locally stored call records.",
    inputSchema: {
      limit: z.number().int().positive().max(100).optional()
    }
  }, async (args) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify(await listRecentCalls(args), null, 2)
      }
    ]
  }));

  return server;
}

async function main(): Promise<void> {
  await ensureStorage();

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  registerWebhookRoutes(app);

  app.post("/mcp", async (request: Request, response: Response) => {
    const server = buildMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);

      if (!response.headersSent) {
        response.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error"
          },
          id: null
        });
      }
    } finally {
      response.on("close", () => {
        void transport.close();
        void server.close();
      });
    }
  });

  const methodNotAllowed = (_request: Request, response: Response) => {
    response.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed."
      },
      id: null
    });
  };

  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  app.listen(appConfig.port, () => {
    console.error(`HTTP server listening on port ${appConfig.port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
