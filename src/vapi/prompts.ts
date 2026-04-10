import type { ReservationRequest } from "../types.js";

export function buildReservationSystemPrompt(request: ReservationRequest): string {
  return [
    "You are calling a restaurant to request a reservation.",
    `Reservation name: ${request.customerName}.`,
    `Party size: ${request.partySize}.`,
    `Requested date: ${request.date}.`,
    `Requested time: ${request.time}.`,
    request.notes ? `Extra notes: ${request.notes}.` : "",
    "Be concise and polite.",
    "If the exact slot is unavailable, ask for the nearest alternative time.",
    "At the end, summarize whether the booking was confirmed and any follow-up needed."
  ]
    .filter(Boolean)
    .join(" ");
}
