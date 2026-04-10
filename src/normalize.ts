import type { NormalizedCallResult } from "./types.js";

function textIncludes(source: string, pattern: RegExp): boolean {
  return pattern.test(source.toLowerCase());
}

export function normalizeCallOutcome(summary?: string, transcript?: string): NormalizedCallResult {
  const combined = [summary ?? "", transcript ?? ""].join("\n").trim().toLowerCase();

  const confirmed = textIncludes(combined, /\bconfirmed\b|\breservation is booked\b|\bsee you\b/);
  const rejected = textIncludes(combined, /\bunable\b|\bnot available\b|\bno reservation\b|\bfully booked\b/);
  const retry = textIncludes(combined, /\bcall back\b|\btry again\b|\blater\b/);

  return {
    reservationConfirmed: confirmed ? true : rejected ? false : null,
    nextAction: confirmed ? "confirm_with_user" : retry ? "retry" : rejected ? "manual_follow_up" : "unknown",
    notes: [
      summary ? `Summary: ${summary}` : "No summary available.",
      transcript ? "Transcript captured." : "No transcript available."
    ]
  };
}
