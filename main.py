import asyncio
import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dedalus_mcp import MCPServer, tool
from dedalus_mcp.server import TransportSecuritySettings


DATA_DIR = Path(os.getenv("DATA_DIR", "./data"))
CALLS_DIR = DATA_DIR / "calls"
WEBHOOKS_DIR = DATA_DIR / "webhooks"
VAPI_BASE_URL = os.getenv("VAPI_BASE_URL", "https://api.vapi.ai")
VAPI_API_KEY = os.getenv("VAPI_API_KEY", "")
DEFAULT_ASSISTANT_ID = os.getenv("VAPI_ASSISTANT_ID", "")


def ensure_storage() -> None:
    CALLS_DIR.mkdir(parents=True, exist_ok=True)
    WEBHOOKS_DIR.mkdir(parents=True, exist_ok=True)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2), encoding="utf-8")


def get_call_path(call_id: str) -> Path:
    return CALLS_DIR / f"{call_id}.json"


def save_call_record(record: dict[str, Any]) -> None:
    write_json(get_call_path(record["callId"]), record)


def get_call_record(call_id: str) -> dict[str, Any] | None:
    return read_json(get_call_path(call_id))


def list_call_records(limit: int = 10) -> list[dict[str, Any]]:
    ensure_storage()
    records: list[dict[str, Any]] = []
    for path in CALLS_DIR.glob("*.json"):
        record = read_json(path)
        if record:
            records.append(record)
    records.sort(key=lambda item: item.get("updatedAt", ""), reverse=True)
    return records[:limit]


def list_webhook_records(limit: int = 50) -> list[dict[str, Any]]:
    ensure_storage()
    records: list[dict[str, Any]] = []
    for path in WEBHOOKS_DIR.glob("*.json"):
        record = read_json(path)
        if record:
            records.append(record)
    records.sort(key=lambda item: item.get("receivedAt", ""), reverse=True)
    return records[:limit]


def normalize_call_outcome(summary: str | None, transcript: str | None) -> dict[str, Any]:
    combined = f"{summary or ''}\n{transcript or ''}".lower()
    confirmed = any(token in combined for token in ["confirmed", "reservation is booked", "see you"])
    rejected = any(token in combined for token in ["unable", "not available", "no reservation", "fully booked"])
    retry = any(token in combined for token in ["call back", "try again", "later"])

    if confirmed:
        next_action = "confirm_with_user"
        reservation_confirmed = True
    elif retry:
        next_action = "retry"
        reservation_confirmed = False if rejected else None
    elif rejected:
        next_action = "manual_follow_up"
        reservation_confirmed = False
    else:
        next_action = "unknown"
        reservation_confirmed = None

    return {
        "reservationConfirmed": reservation_confirmed,
        "nextAction": next_action,
        "notes": [
            f"Summary: {summary}" if summary else "No summary available.",
            "Transcript captured." if transcript else "No transcript available.",
        ],
    }


def get_nested_value(payload: Any, paths: list[list[str]]) -> Any:
    for path in paths:
        current = payload
        for segment in path:
            if not isinstance(current, dict) or segment not in current:
                current = None
                break
            current = current[segment]
        if current is not None:
            return current
    return None


def get_nested_string(payload: Any, paths: list[list[str]]) -> str | None:
    value = get_nested_value(payload, paths)
    return value if isinstance(value, str) else None


def get_transcript(payload: Any) -> str | None:
    direct = get_nested_string(payload, [
        ["transcript"],
        ["call", "transcript"],
        ["message", "transcript"],
        ["message", "call", "transcript"],
    ])
    if direct:
        return direct

    messages = get_nested_value(payload, [
        ["messages"],
        ["call", "messages"],
        ["message", "messages"],
        ["message", "call", "messages"],
    ])
    if not isinstance(messages, list):
        return None

    lines: list[str] = []
    for entry in messages:
        if not isinstance(entry, dict):
            continue
        role = entry.get("role", "unknown")
        text = entry.get("message") or entry.get("content") or entry.get("transcript")
        if isinstance(role, str) and isinstance(text, str):
            lines.append(f"{role}: {text}")

    return "\n".join(lines) if lines else None


def vapi_request(path: str, method: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    if not VAPI_API_KEY:
        raise ValueError("Missing VAPI_API_KEY environment variable")

    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        f"{VAPI_BASE_URL}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {VAPI_API_KEY}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise ValueError(f"Vapi request failed ({error.code}): {detail}") from error


def build_reservation_prompt(
    customer_name: str,
    party_size: int,
    date: str,
    time: str,
    notes: str | None,
) -> str:
    parts = [
        "You are calling a restaurant to request a reservation.",
        f"Reservation name: {customer_name}.",
        f"Party size: {party_size}.",
        f"Requested date: {date}.",
        f"Requested time: {time}.",
        f"Extra notes: {notes}." if notes else "",
        "Be concise and polite.",
        "If the exact slot is unavailable, ask for the nearest alternative time.",
        "At the end, summarize whether the booking was confirmed and any follow-up needed.",
    ]
    return " ".join(part for part in parts if part)


@tool(description="Create a Vapi outbound voice call to request a restaurant reservation.")
def create_reservation_call(
    restaurantPhone: str,
    customerName: str,
    partySize: int,
    date: str,
    time: str,
    notes: str = "",
    assistantId: str = "",
) -> dict[str, Any]:
    ensure_storage()

    resolved_assistant_id = assistantId or DEFAULT_ASSISTANT_ID
    if not resolved_assistant_id:
        raise ValueError("Missing assistantId and VAPI_ASSISTANT_ID")

    response = vapi_request(
        "/call/phone",
        "POST",
        {
            "assistantId": resolved_assistant_id,
            "customer": {"number": restaurantPhone},
            "assistantOverrides": {
                "variableValues": {
                    "customerName": customerName,
                    "partySize": partySize,
                    "date": date,
                    "time": time,
                    "notes": notes,
                },
                "firstMessageMode": "assistant-speaks-first",
                "model": {
                    "messages": [
                        {
                            "role": "system",
                            "content": build_reservation_prompt(customerName, partySize, date, time, notes),
                        }
                    ]
                },
            },
        },
    )

    timestamp = now_iso()
    record = {
        "callId": response["id"],
        "createdAt": timestamp,
        "updatedAt": timestamp,
        "status": response.get("status", "queued"),
        "endedReason": response.get("endedReason"),
        "summary": response.get("summary"),
        "transcript": response.get("transcript"),
        "request": {
            "restaurantPhone": restaurantPhone,
            "customerName": customerName,
            "partySize": partySize,
            "date": date,
            "time": time,
            "notes": notes,
            "assistantId": resolved_assistant_id,
        },
        "rawCall": response,
    }
    save_call_record(record)
    return record


@tool(description="Fetch the latest status, transcript, and summary for a Vapi call.")
def get_call_status(callId: str) -> dict[str, Any]:
    ensure_storage()
    existing = get_call_record(callId) or {}
    response = vapi_request(f"/call/{callId}", "GET")
    summary = response.get("summary") or existing.get("summary")
    transcript = response.get("transcript") or existing.get("transcript")

    updated = {
        "callId": callId,
        "createdAt": existing.get("createdAt", now_iso()),
        "updatedAt": now_iso(),
        "status": response.get("status", existing.get("status", "unknown")),
        "endedReason": response.get("endedReason", existing.get("endedReason")),
        "summary": summary,
        "transcript": transcript,
        "request": existing.get("request", {}),
        "rawCall": response,
        "lastWebhook": existing.get("lastWebhook"),
        "normalizedResult": normalize_call_outcome(summary, transcript),
    }
    save_call_record(updated)
    return updated


@tool(description="Normalize the latest stored Vapi webhook into a structured call result.")
def process_latest_webhook(callId: str = "") -> dict[str, Any]:
    ensure_storage()
    webhooks = list_webhook_records()
    target = next((item for item in webhooks if item.get("callId") == callId), None) if callId else (webhooks[0] if webhooks else None)
    if not target:
        raise ValueError("No matching webhook found")

    payload = target.get("payload", {})
    resolved_call_id = target.get("callId") or get_nested_string(payload, [
        ["callId"],
        ["call", "id"],
        ["message", "call", "id"],
    ])
    if not resolved_call_id:
        raise ValueError("Webhook record does not include a callId")

    existing = get_call_record(resolved_call_id) or {}
    summary = get_nested_string(payload, [
        ["summary"],
        ["analysis", "summary"],
        ["call", "summary"],
        ["call", "analysis", "summary"],
        ["message", "summary"],
        ["message", "call", "summary"],
        ["message", "call", "analysis", "summary"],
    ]) or existing.get("summary")
    transcript = get_transcript(payload) or existing.get("transcript")
    status = get_nested_string(payload, [
        ["status"],
        ["call", "status"],
        ["message", "status"],
        ["message", "call", "status"],
    ]) or existing.get("status", "unknown")
    ended_reason = get_nested_string(payload, [
        ["endedReason"],
        ["call", "endedReason"],
        ["message", "endedReason"],
        ["message", "call", "endedReason"],
    ]) or existing.get("endedReason")

    updated = {
        "callId": resolved_call_id,
        "createdAt": existing.get("createdAt", now_iso()),
        "updatedAt": now_iso(),
        "status": status,
        "endedReason": ended_reason,
        "summary": summary,
        "transcript": transcript,
        "request": existing.get("request", {}),
        "rawCall": existing.get("rawCall"),
        "lastWebhook": payload,
        "normalizedResult": normalize_call_outcome(summary, transcript),
    }
    save_call_record(updated)
    return updated


@tool(description="List recent locally stored call records.")
def list_recent_calls(limit: int = 10) -> list[dict[str, Any]]:
    ensure_storage()
    results: list[dict[str, Any]] = []
    for call in list_call_records(limit):
        request = call.get("request", {})
        results.append(
            {
                "callId": call.get("callId"),
                "status": call.get("status"),
                "updatedAt": call.get("updatedAt"),
                "restaurantPhone": request.get("restaurantPhone"),
                "customerName": request.get("customerName"),
                "summary": call.get("summary"),
            }
        )
    return results


def create_server() -> MCPServer:
    server = MCPServer(
        name="vapi-voice-ops-mcp",
        http_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
        streamable_http_stateless=True,
        authorization_server=os.getenv("DEDALUS_AS_URL", "https://as.dedaluslabs.ai"),
    )
    server.collect(
        create_reservation_call,
        get_call_status,
        process_latest_webhook,
        list_recent_calls,
    )
    return server


async def main() -> None:
    ensure_storage()
    server = create_server()
    await server.serve(port=8080, verbose=True, log_level=os.getenv("LOG_LEVEL", "debug"))


if __name__ == "__main__":
    asyncio.run(main())
