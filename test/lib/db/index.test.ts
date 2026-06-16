import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useTempDb } from "../../helpers/db";
import {
  upsertRecording,
  updateRecordingCustomTitle,
  getRecordingById,
  getAllRecordings,
  getRecordingsBySource,
  getTotalRecordingsCount,
  getRecordingsPaginated,
  searchRecordings,
  searchRecordingsWithContext,
  searchRecordingsWithSpeaker,
  getRelatedRecordings,
  insertSegments,
  insertSpeakers,
  getAllUniqueSpeakers,
  isMediaUrlExpired,
  insertClip,
  getClipById,
  getClipsByRecordingId,
  deleteClip,
  updateMediaUrl,
} from "@/lib/db";

let cleanup: () => void;
beforeEach(() => {
  cleanup = useTempDb();
});
afterEach(() => cleanup());

function addRecording(overrides: Partial<Parameters<typeof upsertRecording>[0]> = {}) {
  const rec = {
    id: "rec-1",
    title: "Weekly Sync",
    videoUrl: "https://v/1",
    duration: 600,
    space: "Zoom Meetings",
    source: "zoom",
    createdAt: "2026-02-11T17:00:00Z",
    ...overrides,
  };
  upsertRecording(rec);
  return rec;
}

describe("recordings: duration filter + ordering", () => {
  it("excludes recordings shorter than 60s", () => {
    addRecording({ id: "long", duration: 120 });
    addRecording({ id: "short", duration: 30, createdAt: "2026-02-12T00:00:00Z" });
    expect(getAllRecordings().map((r) => r.id)).toEqual(["long"]);
    expect(getTotalRecordingsCount()).toBe(1);
  });

  it("orders by created_at DESC", () => {
    addRecording({ id: "older", createdAt: "2026-02-10T00:00:00Z" });
    addRecording({ id: "newer", createdAt: "2026-02-12T00:00:00Z" });
    expect(getAllRecordings().map((r) => r.id)).toEqual(["newer", "older"]);
  });
});

describe("recordings: source filtering", () => {
  beforeEach(() => {
    addRecording({ id: "z", source: "zoom" });
    addRecording({ id: "g", source: "gong" });
  });

  it("filters by source", () => {
    expect(getRecordingsBySource("zoom").map((r) => r.id)).toEqual(["z"]);
    expect(getRecordingsBySource("gong").map((r) => r.id)).toEqual(["g"]);
  });

  it("'all' returns every source", () => {
    expect(getRecordingsBySource("all")).toHaveLength(2);
    expect(getTotalRecordingsCount("gong")).toBe(1);
  });
});

describe("getRecordingsPaginated — compound cursor", () => {
  it("pages through records with identical created_at without dupes or gaps", () => {
    const ts = "2026-02-11T17:00:00Z";
    for (let i = 0; i < 5; i++) {
      addRecording({ id: `rec-${i}`, createdAt: ts });
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    let guard = 0;
    while (guard++ < 10) {
      const page = getRecordingsPaginated("all", 2, cursor);
      seen.push(...page.items.map((r) => r.id));
      if (!page.hasMore || !page.nextCursor) break;
      cursor = page.nextCursor;
    }

    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5); // no duplicates
  });

  it("reports hasMore correctly and a null cursor on the last page", () => {
    for (let i = 0; i < 3; i++) addRecording({ id: `r${i}`, createdAt: `2026-02-1${i}T00:00:00Z` });
    const first = getRecordingsPaginated("all", 2);
    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    const second = getRecordingsPaginated("all", 2, first.nextCursor!);
    expect(second.items).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();
  });

  it("respects the source filter while paginating", () => {
    addRecording({ id: "z1", source: "zoom" });
    addRecording({ id: "g1", source: "gong" });
    const page = getRecordingsPaginated("gong", 10);
    expect(page.items.map((r) => r.id)).toEqual(["g1"]);
  });
});

describe("search: LIKE wildcard escaping", () => {
  it("treats % in the query as a literal, not a wildcard", () => {
    addRecording({ id: "pct", title: "100% done" });
    addRecording({ id: "plain", title: "ordinary meeting" });

    // A literal "%" query must only match the title containing a percent sign,
    // not every row (which is what an unescaped LIKE '%%%' would do).
    const results = searchRecordings("%");
    expect(results.map((r) => r.id)).toEqual(["pct"]);
  });

  it("treats _ as a literal", () => {
    addRecording({ id: "under", title: "a_b config" });
    addRecording({ id: "other", title: "axb config" });
    expect(searchRecordings("a_b").map((r) => r.id)).toEqual(["under"]);
  });

  it("matches transcript text and speaker names", () => {
    addRecording({ id: "rec-1", title: "Untitled" });
    insertSegments("rec-1", [
      { id: "s1", startTime: 0, endTime: 2, speaker: "Alice", text: "quarterly roadmap" },
    ]);
    expect(searchRecordings("roadmap").map((r) => r.id)).toEqual(["rec-1"]);
    expect(searchRecordings("Alice").map((r) => r.id)).toEqual(["rec-1"]);
  });
});

describe("searchRecordingsWithContext — match types", () => {
  beforeEach(() => {
    addRecording({ id: "rec-1", title: "Budget Planning" });
    insertSegments("rec-1", [
      { id: "s1", startTime: 5, endTime: 7, speaker: "Carol", text: "discuss the launch timeline" },
    ]);
  });

  it("classifies a title match", () => {
    const [r] = searchRecordingsWithContext("Budget");
    expect(r.match_type).toBe("title");
    expect(r.match_text).toBe("Budget Planning");
  });

  it("classifies a transcript match and surfaces the start_time", () => {
    const [r] = searchRecordingsWithContext("launch");
    expect(r.match_type).toBe("transcript");
    expect(r.match_text).toContain("launch timeline");
    expect(r.match_time).toBe(5);
  });

  it("classifies a speaker match", () => {
    const [r] = searchRecordingsWithContext("Carol");
    expect(r.match_type).toBe("speaker");
    expect(r.match_text).toBe("Carol");
  });
});

describe("searchRecordingsWithSpeaker — AND logic", () => {
  beforeEach(() => {
    addRecording({ id: "both", title: "A" });
    insertSpeakers("both", [
      { id: "alice", name: "Alice", color: "#000" },
      { id: "bob", name: "Bob", color: "#111" },
    ]);
    addRecording({ id: "onlyalice", title: "B" });
    insertSpeakers("onlyalice", [{ id: "alice", name: "Alice", color: "#000" }]);
  });

  it("returns only recordings containing ALL requested speakers", () => {
    const res = searchRecordingsWithSpeaker("", ["Alice", "Bob"]);
    expect(res.map((r) => r.id)).toEqual(["both"]);
  });

  it("returns both recordings for a single shared speaker", () => {
    const res = searchRecordingsWithSpeaker("", ["Alice"]);
    expect(res.map((r) => r.id).sort()).toEqual(["both", "onlyalice"]);
  });

  it("returns [] for an empty speaker list", () => {
    expect(searchRecordingsWithSpeaker("", [])).toEqual([]);
  });
});

describe("upsertRecording — preserves custom_title on conflict", () => {
  it("keeps a user-set custom title when the recording is re-synced", () => {
    addRecording({ id: "rec-1", title: "Auto Title" });
    updateRecordingCustomTitle("rec-1", "My Custom Title");

    // Re-sync with a changed upstream title.
    addRecording({ id: "rec-1", title: "Auto Title v2" });

    const row = getRecordingById("rec-1");
    expect(row?.title).toBe("Auto Title v2"); // upstream title updated
    expect(row?.custom_title).toBe("My Custom Title"); // custom title preserved
  });
});

describe("getRelatedRecordings", () => {
  it("groups other recordings with the same title", () => {
    addRecording({ id: "a", title: "Standup", createdAt: "2026-02-10T00:00:00Z" });
    addRecording({ id: "b", title: "Standup", createdAt: "2026-02-11T00:00:00Z" });
    addRecording({ id: "c", title: "Other" });
    expect(getRelatedRecordings("Standup", "a").map((r) => r.id)).toEqual(["b"]);
  });

  it("does not group generic/default titles", () => {
    addRecording({ id: "a", title: "Zoom Meeting" });
    addRecording({ id: "b", title: "Zoom Meeting" });
    expect(getRelatedRecordings("Zoom Meeting", "a")).toEqual([]);
  });
});

describe("getAllUniqueSpeakers", () => {
  it("counts distinct recordings per speaker, ordered by count desc", () => {
    addRecording({ id: "r1" });
    addRecording({ id: "r2", createdAt: "2026-02-12T00:00:00Z" });
    insertSpeakers("r1", [{ id: "alice", name: "Alice", color: "#000" }]);
    insertSpeakers("r2", [
      { id: "alice", name: "Alice", color: "#000" },
      { id: "bob", name: "Bob", color: "#111" },
    ]);
    const speakers = getAllUniqueSpeakers();
    expect(speakers[0]).toMatchObject({ name: "Alice", count: 2 });
    expect(speakers.find((s) => s.name === "Bob")?.count).toBe(1);
  });
});

describe("isMediaUrlExpired", () => {
  it("returns false when there is no expiry", () => {
    expect(isMediaUrlExpired(null)).toBe(false);
  });
  it("returns true for a past timestamp", () => {
    expect(isMediaUrlExpired("2000-01-01T00:00:00Z")).toBe(true);
  });
  it("returns false for a future timestamp", () => {
    expect(isMediaUrlExpired("2999-01-01T00:00:00Z")).toBe(false);
  });
});

describe("updateMediaUrl", () => {
  it("updates the video url and expiry", () => {
    addRecording({ id: "rec-1" });
    updateMediaUrl("rec-1", "https://new/url", "2030-01-01T00:00:00Z");
    const row = getRecordingById("rec-1");
    expect(row?.video_url).toBe("https://new/url");
    expect(row?.media_url_expires_at).toBe("2030-01-01T00:00:00Z");
  });
});

describe("clips", () => {
  beforeEach(() => {
    addRecording({ id: "rec-1", duration: 600 });
    insertSegments("rec-1", [
      { id: "s1", startTime: 10, endTime: 20, speaker: "Alice", text: "Let's talk about the new pricing model" },
      { id: "s2", startTime: 20, endTime: 30, speaker: "Bob", text: "Sounds good to me" },
    ]);
  });

  it("inserts and reads back a clip with an explicit title", () => {
    const row = insertClip({ id: "clip-1", recordingId: "rec-1", title: "My Clip", startTime: 10, endTime: 25 });
    expect(row.title).toBe("My Clip");
    expect(getClipById("clip-1")?.title).toBe("My Clip");
    expect(getClipsByRecordingId("rec-1").map((c) => c.id)).toEqual(["clip-1"]);
  });

  it("auto-derives a title from overlapping transcript when none is given", () => {
    // Regression guard: this path queries transcript segments and must not throw.
    const row = insertClip({ id: "clip-2", recordingId: "rec-1", startTime: 12, endTime: 22 });
    expect(row.title).toBeTruthy();
    expect(row.title).toContain("pricing model");
  });

  it("deleteClip reports whether a row was removed", () => {
    insertClip({ id: "clip-3", recordingId: "rec-1", title: "x", startTime: 10, endTime: 20 });
    expect(deleteClip("clip-3")).toBe(true);
    expect(deleteClip("nonexistent")).toBe(false);
  });
});
