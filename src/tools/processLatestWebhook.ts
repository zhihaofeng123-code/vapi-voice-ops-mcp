import { z } from "zod";
import { normalizeCallOutcome } from "../normalize.js";
import { getCallRecord, listWebhookRecords, saveCallRecord } from "../storage/files.js";
import type { StoredCallRecord } from "../types.js";

const schema = z.object({
  callId: z.string().optional()
});

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function getNestedValue(payload: unknown, paths: string[][]): unknown {
  for (const path of paths) {
    let current: unknown = payload;

    for (const segment of path) {
      const record = asRecord(current);
      if (!record || !(segment in record)) {
        current = undefined;
        break;
      }
      current = record[segment];
    }

    if (current !== undefined) {
      return current;
    }
  }

  return undefined;
}

function getString(payload: unknown, paths: string[][]): string | undefined {
  const value = getNestedValue(payload, paths);
  return typeof value === "string" ? value : undefined;
}

function getTranscript(payload: unknown): string | undefined {
  const direct = getString(payload, [
    ["transcript"],
    ["call", "transcript"],
    ["message", "transcript"],
    ["message", "call", "transcript"]
  ]);

  if (direct) {
    return direct;
  }

  const messages = getNestedValue(payload, [
    ["messages"],
    ["call", "messages"],
    ["message", "messages"],
    ["message", "call", "messages"]
  ]);

  if (!Array.isArray(messages)) {
    return undefined;
  }

  const lines = messages.flatMap((entry) => {
    const record = asRecord(entry);
    if (!record) {
      return [];
    }

    const role = typeof record.role === "string" ? record.role : "unknown";
    const text = typeof record.message === "string"
      ? record.message
      : typeof record.content === "string"
        ? record.content
        : typeof record.transcript === "string"
          ? record.transcript
          : null;

    return text ? [`${role}: ${text}`] : [];
  });

  return lines.length > 0 ? lines.join("\n") : undefined;
}

export async function processLatestWebhook(args: unknown): Promise<StoredCallRecord> {
  const { callId } = schema.parse(args ?? {});
  const webhooks = await listWebhookRecords(50);
  const target = callId
    ? webhooks.find((webhook) => webhook.callId === callId)
    : webhooks[0];

  if (!target) {
    throw new Error("No matching webhook found");
  }

  const resolvedCallId = target.callId ?? getString(target.payload, [
    ["callId"],
    ["call", "id"],
    ["message", "call", "id"]
  ]);
  if (!resolvedCallId) {
    throw new Error("Webhook record does not include a callId");
  }

  const existing = await getCallRecord(resolvedCallId);
  const summary = getString(target.payload, [
    ["summary"],
    ["analysis", "summary"],
    ["call", "summary"],
    ["call", "analysis", "summary"],
    ["message", "summary"],
    ["message", "call", "summary"],
    ["message", "call", "analysis", "summary"]
  ]) ?? existing?.summary;
  const transcript = getTranscript(target.payload) ?? existing?.transcript;
  const status = getString(target.payload, [
    ["status"],
    ["call", "status"],
    ["message", "status"],
    ["message", "call", "status"]
  ]) ?? existing?.status ?? "unknown";
  const endedReason = getString(target.payload, [
    ["endedReason"],
    ["call", "endedReason"],
    ["message", "endedReason"],
    ["message", "call", "endedReason"]
  ]) ?? existing?.endedReason;
  const now = new Date().toISOString();

  const updated: StoredCallRecord = {
    callId: resolvedCallId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    status: status as StoredCallRecord["status"],
    endedReason,
    summary,
    transcript,
    request: existing?.request ?? {
      restaurantPhone: "",
      customerName: "",
      partySize: 1,
      date: "",
      time: ""
    },
    rawCall: existing?.rawCall,
    lastWebhook: target.payload,
    normalizedResult: normalizeCallOutcome(summary, transcript)
  };

  await saveCallRecord(updated);
  return updated;
}
