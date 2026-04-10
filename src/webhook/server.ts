import crypto from "node:crypto";
import { appConfig } from "../config.js";
import { saveWebhookRecord } from "../storage/files.js";

function getHeader(headers: Headers, name: string): string | null {
  return headers.get(name);
}

function verifyWebhookSecret(headers: Headers): boolean {
  if (!appConfig.webhookSecret) {
    return true;
  }

  return getHeader(headers, "x-webhook-secret") === appConfig.webhookSecret;
}

function deriveCallId(body: unknown): string | undefined {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const message = record?.message && typeof record.message === "object"
    ? (record.message as Record<string, unknown>)
    : null;
  const call = record?.call && typeof record.call === "object"
    ? (record.call as Record<string, unknown>)
    : null;
  const messageCall = message?.call && typeof message.call === "object"
    ? (message.call as Record<string, unknown>)
    : null;

  if (typeof record?.callId === "string") {
    return record.callId;
  }

  if (typeof call?.id === "string") {
    return call.id;
  }

  if (typeof messageCall?.id === "string") {
    return messageCall.id;
  }

  return undefined;
}

function deriveEventType(body: Record<string, unknown>): string {
  const message = body.message && typeof body.message === "object"
    ? (body.message as Record<string, unknown>)
    : null;

  if (typeof message?.type === "string") {
    return message.type;
  }

  if (typeof body.type === "string") {
    return body.type;
  }

  if (typeof body.event === "string") {
    return body.event;
  }

  return "unknown";
}

export async function handleWebhookRequest(request: Request): Promise<Response> {
  if (!verifyWebhookSecret(request.headers)) {
    return Response.json({ error: "Unauthorized webhook" }, { status: 401 });
  }

  const payload = await request.json() as Record<string, unknown>;

  await saveWebhookRecord({
    id: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    eventType: deriveEventType(payload),
    callId: deriveCallId(payload),
    payload
  });

  return Response.json({ ok: true });
}
