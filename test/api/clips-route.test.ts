import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useTempDb } from "../helpers/db";
import { upsertRecording, insertSegments } from "@/lib/db";
import { GET, POST } from "@/app/api/recordings/[id]/clips/route";

let cleanup: () => void;
beforeEach(() => {
  cleanup = useTempDb();
  upsertRecording({
    id: "rec-1",
    title: "Demo",
    videoUrl: "https://v/1",
    duration: 600,
    space: "Zoom Meetings",
    source: "zoom",
    createdAt: "2026-02-11T17:00:00Z",
  });
  insertSegments("rec-1", [
    { id: "s1", startTime: 10, endTime: 30, speaker: "Alice", text: "talking about onboarding flow" },
  ]);
});
afterEach(() => cleanup());

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function postReq(body: unknown) {
  return new Request("http://test/api/recordings/rec-1/clips", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/recordings/[id]/clips", () => {
  it("404s for an unknown recording", async () => {
    const res = await POST(postReq({ startTime: 1, endTime: 2 }), ctx("missing"));
    expect(res.status).toBe(404);
  });

  it("400s when startTime/endTime are not numbers", async () => {
    const res = await POST(postReq({ startTime: "1", endTime: 2 }), ctx("rec-1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required numbers/i);
  });

  it("400s on an inverted/zero-length range", async () => {
    const res = await POST(postReq({ startTime: 30, endTime: 20 }), ctx("rec-1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid time range/i);
  });

  it("400s when endTime exceeds the recording duration", async () => {
    const res = await POST(postReq({ startTime: 0, endTime: 9999 }), ctx("rec-1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/exceeds/i);
  });

  it("creates a clip and auto-titles it from the transcript (201)", async () => {
    const res = await POST(postReq({ startTime: 12, endTime: 28 }), ctx("rec-1"));
    expect(res.status).toBe(201);
    const clip = await res.json();
    expect(clip.recordingId).toBe("rec-1");
    expect(clip.title).toContain("onboarding flow");
    expect(clip.id).toBeTruthy();
  });

  it("honors an explicit title", async () => {
    const res = await POST(postReq({ startTime: 0, endTime: 60, title: "Intro" }), ctx("rec-1"));
    expect((await res.json()).title).toBe("Intro");
  });
});

describe("GET /api/recordings/[id]/clips", () => {
  it("404s for an unknown recording", async () => {
    const res = await GET(new Request("http://test"), ctx("missing"));
    expect(res.status).toBe(404);
  });

  it("returns created clips", async () => {
    await POST(postReq({ startTime: 0, endTime: 60, title: "A" }), ctx("rec-1"));
    const res = await GET(new Request("http://test"), ctx("rec-1"));
    expect(res.status).toBe(200);
    const clips = await res.json();
    expect(clips).toHaveLength(1);
    expect(clips[0].title).toBe("A");
  });
});
