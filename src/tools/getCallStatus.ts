import { z } from "zod";
import { getCall } from "../vapi/client.js";
import { getCallRecord, saveCallRecord } from "../storage/files.js";
import { normalizeCallOutcome } from "../normalize.js";
import type { StoredCallRecord } from "../types.js";

const schema = z.object({
  callId: z.string().min(1)
});

export async function getCallStatus(args: unknown): Promise<StoredCallRecord> {
  const { callId } = schema.parse(args);
  const existing = await getCallRecord(callId);
  const response = await getCall(callId);
  const now = new Date().toISOString();

  const updated: StoredCallRecord = {
    callId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    status: (response.status as StoredCallRecord["status"]) ?? existing?.status ?? "unknown",
    endedReason: typeof response.endedReason === "string" ? response.endedReason : existing?.endedReason,
    summary: typeof response.summary === "string" ? response.summary : existing?.summary,
    transcript: typeof response.transcript === "string" ? response.transcript : existing?.transcript,
    request: existing?.request ?? {
      restaurantPhone: "",
      customerName: "",
      partySize: 1,
      date: "",
      time: ""
    },
    rawCall: response,
    lastWebhook: existing?.lastWebhook,
    normalizedResult: normalizeCallOutcome(
      typeof response.summary === "string" ? response.summary : existing?.summary,
      typeof response.transcript === "string" ? response.transcript : existing?.transcript
    )
  };

  await saveCallRecord(updated);
  return updated;
}
