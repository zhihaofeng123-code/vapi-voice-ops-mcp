export type CallStatus =
  | "queued"
  | "ringing"
  | "in_progress"
  | "completed"
  | "failed"
  | "unknown";

export interface ReservationRequest {
  restaurantPhone: string;
  customerName: string;
  partySize: number;
  date: string;
  time: string;
  notes?: string;
  assistantId?: string;
}

export interface NormalizedCallResult {
  reservationConfirmed: boolean | null;
  requestedSlot?: string;
  alternativeSlotOffered?: string;
  nextAction: "confirm_with_user" | "retry" | "manual_follow_up" | "unknown";
  notes: string[];
}

export interface StoredCallRecord {
  callId: string;
  createdAt: string;
  updatedAt: string;
  status: CallStatus;
  request: ReservationRequest;
  endedReason?: string;
  transcript?: string;
  summary?: string;
  rawCall?: unknown;
  lastWebhook?: unknown;
  normalizedResult?: NormalizedCallResult;
}

export interface StoredWebhookRecord {
  id: string;
  receivedAt: string;
  eventType: string;
  callId?: string;
  payload: unknown;
}
