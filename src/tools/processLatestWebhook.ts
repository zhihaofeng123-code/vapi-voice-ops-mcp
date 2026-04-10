import { z } from "zod";
import { normalizeCallOutcome } from "../normalize.js";
import { getCallRecord, listWebhookRecords, saveCallRecord } from "../storage/files.js";
import type { StoredCallRecord } from "../types.js";

const schema = z.object({
  callId: z.string().optional()
});

function getPayloadField(payload: unknown, key: string): unknown {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  return (payload as Record<string, unknown>)[key];
}

function getString(payload: unknown, key: string): string | undefined {
  const value = getPayloadField(payload, key);
  return typeof value === "string" ? value : undefined;
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

  const resolvedCallId = target.callId ?? getString(target.payload, "callId");
  if (!resolvedCallId) {
    throw new Error("Webhook record does not include a callId");
  }

  const existing = await getCallRecord(resolvedCallId);
  const summary = getString(target.payload, "summary") ?? existing?.summary;
  const transcript = getString(target.payload, "transcript") ?? existing?.transcript;
  const status = getString(target.payload, "status") ?? existing?.status ?? "unknown";
  const endedReason = getString(target.payload, "endedReason") ?? existing?.endedReason;
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
