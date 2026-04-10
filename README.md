# vapi-voice-ops-mcp

An MCP server that gives AI agents a reusable voice operations interface on top of Vapi, including outbound reservation calls, webhook handling, transcript capture, and structured post-call results.

## Why this exists

This project is designed for the Dedalus-style pattern where an agent needs a durable, deployable voice capability exposed through MCP rather than a one-off voice bot UI.

- `Vapi` handles telephony, voice interaction, transcripts, and summaries.
- `MCP` makes those capabilities callable by agents as tools.
- A persistent runtime can host the webhook endpoint, background state, and call artifacts.

## Architecture

```text
Agent
  -> MCP tool call
  -> vapi-voice-ops-mcp
      -> Vapi API
      -> local/persistent storage
      <- webhook events
  -> normalized call result
```

## Included tools

- `create_reservation_call`
- `get_call_status`
- `process_latest_webhook`
- `list_recent_calls`

## Project structure

```text
vapi-voice-ops-mcp/
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── normalize.ts
│   ├── storage/
│   ├── tools/
│   ├── vapi/
│   └── webhook/
├── data/
├── .env.example
├── package.json
└── tsconfig.json
```

## Quick start

1. Install dependencies.
2. Copy `.env.example` to `.env`.
3. Set `VAPI_API_KEY` and either `VAPI_ASSISTANT_ID` or pass `assistantId` per tool call.
4. Start the server:

```bash
npm install
npm run dev
```

The process starts:

- an HTTP MCP endpoint on `http://localhost:8787/mcp`
- an HTTP webhook listener on `http://localhost:8787/webhooks/vapi`

## MCP client configuration

Example local MCP config:

```json
{
  "mcpServers": {
    "vapi-voice-ops": {
      "command": "npm",
      "args": ["run", "dev"],
      "cwd": "/absolute/path/to/vapi-voice-ops-mcp"
    }
  }
}
```

## Environment variables

```bash
VAPI_API_KEY=your_vapi_api_key
VAPI_BASE_URL=https://api.vapi.ai
VAPI_ASSISTANT_ID=your_default_assistant_id
PORT=8787
WEBHOOK_SECRET=optional_shared_secret
DATA_DIR=./data
```

## Example MCP usage

### Create a reservation call

```json
{
  "restaurantPhone": "+13105551212",
  "customerName": "Alex Chen",
  "partySize": 2,
  "date": "2026-04-12",
  "time": "7:30 PM",
  "notes": "Window seat if available"
}
```

### Check status

```json
{
  "callId": "call_123"
}
```

## Example files

- Sample tool input: [`examples/create-reservation-call.json`](./examples/create-reservation-call.json)
- Example MCP config: [`examples/mcp-server-config.json`](./examples/mcp-server-config.json)

## Webhook flow

1. Agent invokes `create_reservation_call`.
2. The MCP server triggers a Vapi outbound call.
3. Vapi posts events to `/webhooks/vapi`.
4. Webhook payloads are stored in `data/webhooks/`.
5. Processed call records are stored in `data/calls/`.
6. Agent uses `get_call_status` or `process_latest_webhook` to retrieve normalized results.

## GitHub positioning

This repo is intentionally structured as a reusable infrastructure component:

- not a chatbot demo
- not a single reservation script
- a voice operations MCP surface that can be deployed behind agents

## Current scope

This first version is intentionally small:

- file-based storage instead of a database
- one primary outbound reservation workflow
- generic webhook persistence plus simple normalization

That keeps the repo easy to understand and easy to extend for Dedalus or other remote MCP runtimes.

## Next steps

- Add additional tools like `retry_failed_call` or `create_business_hours_check_call`.
- Swap file storage for Postgres or object storage.
- Add webhook signature verification if your Vapi setup supports it.
- Deploy the webhook service and MCP server to a persistent runtime such as a Dedalus Machine.
