import { z } from "zod";
import { listCallRecords } from "../storage/files.js";

const schema = z.object({
  limit: z.number().int().positive().max(100).optional()
});

export async function listRecentCalls(args: unknown): Promise<unknown> {
  const { limit = 10 } = schema.parse(args ?? {});
  const calls = await listCallRecords(limit);

  return calls.map((call) => ({
    callId: call.callId,
    status: call.status,
    updatedAt: call.updatedAt,
    restaurantPhone: call.request.restaurantPhone,
    customerName: call.request.customerName,
    summary: call.summary ?? null
  }));
}
