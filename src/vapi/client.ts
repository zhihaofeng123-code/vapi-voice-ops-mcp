import { appConfig } from "../config.js";
import type { ReservationRequest } from "../types.js";
import { buildReservationSystemPrompt } from "./prompts.js";

interface CreateCallResponse {
  id: string;
  status?: string;
  endedReason?: string;
  summary?: string;
  transcript?: string;
  [key: string]: unknown;
}

async function vapiRequest<T>(pathname: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${appConfig.vapiBaseUrl}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${appConfig.vapiApiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Vapi request failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<T>;
}

export async function createOutboundReservationCall(request: ReservationRequest): Promise<CreateCallResponse> {
  const assistantId = request.assistantId || appConfig.defaultAssistantId;

  if (!assistantId) {
    throw new Error("Missing assistantId in input and VAPI_ASSISTANT_ID in environment");
  }

  return vapiRequest<CreateCallResponse>("/call/phone", {
    method: "POST",
    body: JSON.stringify({
      assistantId,
      customer: {
        number: request.restaurantPhone
      },
      assistantOverrides: {
        variableValues: {
          customerName: request.customerName,
          partySize: request.partySize,
          date: request.date,
          time: request.time,
          notes: request.notes ?? ""
        },
        firstMessageMode: "assistant-speaks-first",
        model: {
          messages: [
            {
              role: "system",
              content: buildReservationSystemPrompt(request)
            }
          ]
        }
      }
    })
  });
}

export async function getCall(callId: string): Promise<CreateCallResponse> {
  return vapiRequest<CreateCallResponse>(`/call/${callId}`, {
    method: "GET"
  });
}
