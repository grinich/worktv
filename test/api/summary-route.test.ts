import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useTempDb } from "../helpers/db";
import { upsertRecording, insertSegments, upsertSummary, getSummaryByRecordingId } from "@/lib/db";

// Mock the AI layer so POST doesn't hit the network.
const generateMock = vi.fn();
vi.mock("@/lib/ai/summarize", () => ({
  generateTranscriptSummary: (...args: unknown[]) => generateMock(...args),
  SUMMARY_MODEL: "claude-haiku-4-5-20251001",
}));

import { GET, POST } from "@/app/api/recordings/[id]/summary/route";

let cleanup: () => void;
beforeEach(() => {
  cleanup = useTempDb();
  generateMock.mockReset();
  upsertRecording({
    id: "rec-1",
    title: "Demo",
    videoUrl: "https://v/1",
    duration: 600,
    space: "Zoom Meetings",
    source: "zoom",
    createdAt: "2026-02-11T17:00:00Z",
  });
});
afterEach(() => cleanup());

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = new Request("http://test/api/recordings/rec-1/summary");

describe("GET summary", () => {
  it("404s when no summary is cached", async () => {
    const res = await GET(req, ctx("rec-1"));
    expect(res.status).toBe(404);
  });

  it("returns the cached summary parsed from JSON", async () => {
    const summary = { brief: "b", keyPoints: ["k"], nextSteps: ["n"] };
    upsertSummary({ recordingId: "rec-1", content: JSON.stringify(summary), model: "m" });
    const res = await GET(req, ctx("rec-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toEqual(summary);
    expect(body.model).toBe("m");
  });
});

describe("POST summary (regenerate)", () => {
  it("400s when the recording has no transcript", async () => {
    const res = await POST(req, ctx("rec-1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no transcript/i);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("generates, persists, and returns a summary when a transcript exists", async () => {
    insertSegments("rec-1", [
      { id: "s1", startTime: 0, endTime: 2, speaker: "Alice", text: "ship it" },
    ]);
    const summary = { brief: "A short sync.", keyPoints: ["ship"], nextSteps: [] };
    generateMock.mockResolvedValue(summary);

    const res = await POST(req, ctx("rec-1"));
    expect(res.status).toBe(200);
    expect((await res.json()).summary).toEqual(summary);

    // It was generated from the stored segments...
    expect(generateMock).toHaveBeenCalledOnce();
    expect(generateMock.mock.calls[0][0][0]).toMatchObject({ speaker: "Alice", text: "ship it" });
    // ...and cached for next time.
    const cached = getSummaryByRecordingId("rec-1");
    expect(cached && JSON.parse(cached.content)).toEqual(summary);
  });

  it("500s when generation throws", async () => {
    insertSegments("rec-1", [
      { id: "s1", startTime: 0, endTime: 2, speaker: "Alice", text: "x" },
    ]);
    generateMock.mockRejectedValue(new Error("boom"));
    const res = await POST(req, ctx("rec-1"));
    expect(res.status).toBe(500);
  });
});
