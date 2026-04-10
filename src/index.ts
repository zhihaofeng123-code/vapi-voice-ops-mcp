import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool
} from "@modelcontextprotocol/sdk/types.js";
import { ensureStorage } from "./storage/files.js";
import { startWebhookServer } from "./webhook/server.js";
import { createReservationCall, createReservationCallSchema } from "./tools/createReservationCall.js";
import { getCallStatus } from "./tools/getCallStatus.js";
import { listRecentCalls } from "./tools/listRecentCalls.js";
import { processLatestWebhook } from "./tools/processLatestWebhook.js";

const tools: Tool[] = [
  {
    name: "create_reservation_call",
    description: "Create a Vapi outbound voice call to request a restaurant reservation.",
    inputSchema: {
      type: "object",
      properties: {
        restaurantPhone: { type: "string", description: "Target restaurant phone number." },
        customerName: { type: "string", description: "Reservation name." },
        partySize: { type: "number", description: "Number of diners." },
        date: { type: "string", description: "Requested reservation date." },
        time: { type: "string", description: "Requested reservation time." },
        notes: { type: "string", description: "Optional request notes." },
        assistantId: { type: "string", description: "Optional Vapi assistant override." }
      },
      required: ["restaurantPhone", "customerName", "partySize", "date", "time"]
    }
  },
  {
    name: "get_call_status",
    description: "Fetch the latest status, transcript, and summary for a Vapi call.",
    inputSchema: {
      type: "object",
      properties: {
        callId: { type: "string" }
      },
      required: ["callId"]
    }
  },
  {
    name: "process_latest_webhook",
    description: "Normalize the latest stored Vapi webhook into a structured call result.",
    inputSchema: {
      type: "object",
      properties: {
        callId: { type: "string" }
      }
    }
  },
  {
    name: "list_recent_calls",
    description: "List recent locally stored call records.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number" }
      }
    }
  }
];

async function main(): Promise<void> {
  await ensureStorage();
  startWebhookServer();

  const server = new Server(
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

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = request.params.arguments ?? {};

    switch (request.params.name) {
      case "create_reservation_call": {
        const result = await createReservationCall(createReservationCallSchema.parse(args));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }
      case "get_call_status": {
        const result = await getCallStatus(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }
      case "process_latest_webhook": {
        const result = await processLatestWebhook(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }
      case "list_recent_calls": {
        const result = await listRecentCalls(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }
      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
