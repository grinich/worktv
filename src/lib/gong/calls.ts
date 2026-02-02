// Gong API Client

import type {
  GongCallsListResponse,
  GongTranscriptResponse,
} from "@/types/gong";
import { getGongAuthHeader } from "./auth";

function getGongApiBase(): string {
  return process.env.GONG_BASE_URL || "https://api.gong.io";
}

export class GongRateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Gong rate limit exceeded. Retry after ${retryAfterSeconds} seconds`);
    this.name = "GongRateLimitError";
  }
}

async function gongFetch<T>(
  endpoint: string,
  options?: { method?: string; body?: unknown }
): Promise<T> {
  const authHeader = getGongAuthHeader();

  const response = await fetch(`${getGongApiBase()}${endpoint}`, {
    method: options?.method ?? "GET",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  // Handle rate limiting (HTTP 429)
  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    const seconds = retryAfter ? parseInt(retryAfter, 10) : 60;
    throw new GongRateLimitError(seconds);
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gong API error: ${response.status} - ${error}`);
  }

  return response.json() as Promise<T>;
}

// Helper to wait before retrying after rate limit
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// List calls with pagination (includes media URLs)
export async function listCalls(options?: {
  fromDateTime?: string; // ISO format
  toDateTime?: string;
  cursor?: string;
  includeMedia?: boolean;
}): Promise<GongCallsListResponse> {
  const body: Record<string, unknown> = {};

  if (options?.fromDateTime || options?.toDateTime) {
    body.filter = {};
    if (options.fromDateTime) {
      (body.filter as Record<string, unknown>).fromDateTime =
        options.fromDateTime;
    }
    if (options.toDateTime) {
      (body.filter as Record<string, unknown>).toDateTime = options.toDateTime;
    }
  }

  if (options?.cursor) {
    body.cursor = options.cursor;
  }

  // Include media URLs and parties in response
  if (options?.includeMedia) {
    body.contentSelector = {
      exposedFields: {
        media: true,
        parties: true,
      },
    };
  }

  return gongFetch<GongCallsListResponse>("/v2/calls/extensive", {
    method: "POST",
    body,
  });
}

// List all calls with automatic pagination
export async function listAllCalls(options?: {
  fromDateTime?: string;
  toDateTime?: string;
  includeMedia?: boolean;
}): Promise<GongCallsListResponse["calls"]> {
  const allCalls: GongCallsListResponse["calls"] = [];
  let cursor: string | undefined;

  do {
    const response = await listCalls({
      fromDateTime: options?.fromDateTime,
      toDateTime: options?.toDateTime,
      includeMedia: options?.includeMedia,
      cursor,
    });

    allCalls.push(...response.calls);
    cursor = response.records.cursor;
  } while (cursor);

  return allCalls;
}

// Get transcripts for specific call IDs (batch endpoint)
export async function getTranscripts(
  callIds: string[]
): Promise<GongTranscriptResponse> {
  if (callIds.length === 0) {
    return { requestId: "", callTranscripts: [] };
  }

  return gongFetch<GongTranscriptResponse>("/v2/calls/transcript", {
    method: "POST",
    body: { filter: { callIds } },
  });
}

// Get a single call's details with media URLs
export async function getCall(
  callId: string,
  includeMedia = true
): Promise<GongCallsListResponse["calls"][number] | undefined> {
  const body: Record<string, unknown> = {
    filter: { callIds: [callId] },
  };

  if (includeMedia) {
    body.contentSelector = {
      exposedFields: {
        media: true,
        parties: true,
      },
    };
  }

  const response = await gongFetch<GongCallsListResponse>("/v2/calls/extensive", {
    method: "POST",
    body,
  });

  return response.calls[0];
}
