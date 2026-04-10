import { z } from "zod";
import { createOutboundReservationCall } from "../vapi/client.js";
import { saveCallRecord } from "../storage/files.js";
import type { ReservationRequest, StoredCallRecord } from "../types.js";

export const createReservationCallSchema = z.object({
  restaurantPhone: z.string().min(3),
  customerName: z.string().min(1),
  partySize: z.number().int().positive(),
  date: z.string().min(1),
  time: z.string().min(1),
  notes: z.string().optional(),
  assistantId: z.string().optional()
});

export async function createReservationCall(args: unknown): Promise<StoredCallRecord> {
  const request = createReservationCallSchema.parse(args) as ReservationRequest;
  const response = await createOutboundReservationCall(request);
  const now = new Date().toISOString();

  const record: StoredCallRecord = {
    callId: response.id,
    createdAt: now,
    updatedAt: now,
    status: (response.status as StoredCallRecord["status"]) ?? "queued",
    endedReason: typeof response.endedReason === "string" ? response.endedReason : undefined,
    summary: typeof response.summary === "string" ? response.summary : undefined,
    transcript: typeof response.transcript === "string" ? response.transcript : undefined,
    request,
    rawCall: response
  };

  await saveCallRecord(record);
  return record;
}
