import type { Express, Request, Response } from "express";
import crypto from "node:crypto";
import { appConfig } from "../config.js";
import { saveWebhookRecord } from "../storage/files.js";

function verifyWebhookSecret(request: Request): boolean {
  if (!appConfig.webhookSecret) {
    return true;
  }

  const header = request.header("x-webhook-secret");
  return header === appConfig.webhookSecret;
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

export function registerWebhookRoutes(app: Express): void {
  app.get("/health", (_request: Request, response: Response) => {
    response.json({ ok: true });
  });

  app.post("/webhooks/vapi", async (request: Request, response: Response) => {
    if (!verifyWebhookSecret(request)) {
      response.status(401).json({ error: "Unauthorized webhook" });
      return;
    }

    const payload = request.body as Record<string, unknown>;
    await saveWebhookRecord({
      id: crypto.randomUUID(),
      receivedAt: new Date().toISOString(),
      eventType: deriveEventType(payload),
      callId: deriveCallId(payload),
      payload
    });

    response.json({ ok: true });
  });
}
