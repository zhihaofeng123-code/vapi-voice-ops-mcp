# vapi-voice-ops-mcp

A Dedalus-compatible MCP server that gives AI agents a reusable voice operations interface on top of Vapi, including outbound reservation calls, transcript capture, and structured post-call results.

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
├── main.py
├── pyproject.toml
├── data/
├── .env.example
└── src/                # TypeScript reference implementation kept for local iteration
```

## Quick start

1. Install Python dependencies.
2. Copy `.env.example` to `.env`.
3. Set `VAPI_API_KEY` and either `VAPI_ASSISTANT_ID` or pass `assistantId` per tool call.
4. Start the server:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
python main.py
```

The process starts:

- an HTTP MCP endpoint on `http://127.0.0.1:8000/mcp`

## Environment variables

```bash
VAPI_API_KEY=your_vapi_api_key
VAPI_BASE_URL=https://api.vapi.ai
VAPI_ASSISTANT_ID=your_default_assistant_id
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

## Quick HTTP tests

### 1. Health check

```bash
curl http://127.0.0.1:8000/mcp
```

This server exposes MCP over HTTP at `/mcp`. A minimal tool call request looks like this:

```bash
curl -X POST http://127.0.0.1:8000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "list-calls-1",
    "method": "tools/call",
    "params": {
      "name": "list_recent_calls",
      "arguments": {
        "limit": 5
      }
    }
  }'
```

For a full MCP client flow, prefer using an MCP client or inspector that handles initialization automatically.

## Webhook flow

1. Agent invokes `create_reservation_call`.
2. The MCP server triggers a Vapi outbound call.
3. Vapi call metadata is stored in `data/calls/`.
4. Agent uses `get_call_status` or `process_latest_webhook` to retrieve normalized results.

## GitHub positioning

This repo is intentionally structured as a reusable infrastructure component:

- not a chatbot demo
- not a single reservation script
- a voice operations MCP surface that can be deployed behind agents

## Current scope

This first version is intentionally small:

- file-based storage instead of a database
- one primary outbound reservation workflow
- lightweight payload normalization for common nested Vapi event shapes

That keeps the repo easy to understand and easy to extend for Dedalus or other remote MCP runtimes.

## Next steps

- Add additional tools like `retry_failed_call` or `create_business_hours_check_call`.
- Swap file storage for Postgres or object storage.
- Add webhook signature verification if your Vapi setup supports it.
- Deploy the webhook service and MCP server to a persistent runtime such as a Dedalus Machine.
