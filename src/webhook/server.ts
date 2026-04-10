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
  if (!body || typeof body !== "object") {
    return undefined;
  }

  const record = body as Record<string, unknown>;
  if (typeof record.callId === "string") {
    return record.callId;
  }

  if (record.call && typeof record.call === "object" && typeof (record.call as Record<string, unknown>).id === "string") {
    return (record.call as Record<string, string>).id;
  }

  return undefined;
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
    const message =
      payload.message && typeof payload.message === "object"
        ? (payload.message as Record<string, unknown>)
        : null;
    const eventType = typeof message?.type === "string"
      ? message.type
      : typeof payload.type === "string"
        ? payload.type
        : "unknown";

    await saveWebhookRecord({
      id: crypto.randomUUID(),
      receivedAt: new Date().toISOString(),
      eventType,
      callId: deriveCallId(payload),
      payload
    });

    response.json({ ok: true });
  });
}
