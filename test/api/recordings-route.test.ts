import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useTempDb } from "../helpers/db";
import { upsertRecording, getRecordingById } from "@/lib/db";
import { PATCH } from "@/app/api/recordings/[id]/route";

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
});
afterEach(() => cleanup());

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
function patchReq(body: unknown) {
  return new Request("http://test/api/recordings/rec-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/recordings/[id]", () => {
  it("sets a custom title", async () => {
    const res = await PATCH(patchReq({ customTitle: "My Title" }), ctx("rec-1"));
    expect(res.status).toBe(200);
    expect((await res.json()).customTitle).toBe("My Title");
    expect(getRecordingById("rec-1")?.custom_title).toBe("My Title");
  });

  it("clears the custom title with null", async () => {
    await PATCH(patchReq({ customTitle: "X" }), ctx("rec-1"));
    const res = await PATCH(patchReq({ customTitle: null }), ctx("rec-1"));
    expect(res.status).toBe(200);
    expect(getRecordingById("rec-1")?.custom_title).toBeNull();
  });

  it("400s when customTitle is the wrong type", async () => {
    const res = await PATCH(patchReq({ customTitle: 42 }), ctx("rec-1"));
    expect(res.status).toBe(400);
  });

  it("404s for an unknown recording", async () => {
    const res = await PATCH(patchReq({ customTitle: "X" }), ctx("missing"));
    expect(res.status).toBe(404);
  });
});
