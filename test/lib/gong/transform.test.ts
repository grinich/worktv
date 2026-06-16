import { describe, it, expect } from "vitest";
import {
  buildSpeakerMap,
  parseGongTranscript,
  extractSpeakers,
  extractSpeakersFromParties,
  formatDuration,
  transformGongCallToListItem,
  transformGongCall,
} from "@/lib/gong/transform";
import { SPEAKER_COLORS } from "@/lib/constants";
import type { GongCall, GongParty, GongCallTranscript } from "@/types/gong";

function party(overrides: Partial<GongParty>): GongParty {
  return { id: "p1", affiliation: "Internal", ...overrides };
}

function call(overrides: Partial<GongCall>): GongCall {
  return {
    id: "123",
    url: "https://gong/123",
    title: "Discovery Call",
    scheduled: "2026-02-11T17:00:00Z",
    started: "2026-02-11T17:01:00Z",
    duration: 1800,
    primaryUserId: "u1",
    direction: "Outbound",
    scope: "External",
    media: "Video",
    language: "en",
    workspaceId: "w1",
    isPrivate: false,
    ...overrides,
  };
}

describe("buildSpeakerMap", () => {
  it("maps both speakerId and party id to the display name", () => {
    const map = buildSpeakerMap([party({ id: "pa", speakerId: "sa", name: "Alice" })]);
    expect(map.get("sa")).toBe("Alice");
    expect(map.get("pa")).toBe("Alice");
  });

  it("falls back to email then 'Unknown'", () => {
    const map = buildSpeakerMap([
      party({ id: "p1", speakerId: "s1", emailAddress: "bob@x.com" }),
      party({ id: "p2", speakerId: "s2" }),
    ]);
    expect(map.get("s1")).toBe("bob@x.com");
    expect(map.get("s2")).toBe("Unknown");
  });
});

describe("parseGongTranscript", () => {
  const map = new Map([["s1", "Alice"], ["s2", "Bob"]]);

  it("converts ms to seconds", () => {
    const t: GongCallTranscript = {
      callId: "1",
      transcript: [{ speakerId: "s1", sentences: [{ start: 1500, end: 3000, text: "Hello" }] }],
    };
    const segs = parseGongTranscript(t, map);
    expect(segs[0].startTime).toBe(1.5);
    expect(segs[0].endTime).toBe(3);
  });

  it("flattens sentences and sorts by start time", () => {
    const t: GongCallTranscript = {
      callId: "1",
      transcript: [
        { speakerId: "s2", sentences: [{ start: 5000, end: 6000, text: "later" }] },
        { speakerId: "s1", sentences: [
          { start: 1000, end: 2000, text: "first" },
          { start: 2000, end: 3000, text: "second" },
        ] },
      ],
    };
    const segs = parseGongTranscript(t, map);
    expect(segs.map((s) => s.text)).toEqual(["first", "second", "later"]);
    expect(segs.map((s) => s.speaker)).toEqual(["Alice", "Alice", "Bob"]);
  });

  it("uses 'Speaker' for unknown speaker ids", () => {
    const t: GongCallTranscript = {
      callId: "1",
      transcript: [{ speakerId: "ghost", sentences: [{ start: 0, end: 1000, text: "hi" }] }],
    };
    expect(parseGongTranscript(t, map)[0].speaker).toBe("Speaker");
  });
});

describe("extractSpeakersFromParties", () => {
  it("uses name or email, dedupes, and assigns palette colors", () => {
    const speakers = extractSpeakersFromParties([
      party({ name: "Alice" }),
      party({ emailAddress: "bob@x.com" }),
      party({ name: "Alice" }),
    ]);
    expect(speakers.map((s) => s.name)).toEqual(["Alice", "bob@x.com"]);
    expect(speakers[1].color).toBe(SPEAKER_COLORS[1]);
  });

  it("drops parties with neither name nor email", () => {
    const speakers = extractSpeakersFromParties([party({}), party({ name: "Alice" })]);
    expect(speakers.map((s) => s.name)).toEqual(["Alice"]);
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0m"],
    [59, "0m"],
    [60, "1m"],
    [90, "1m"],
    [3599, "59m"],
    [3600, "1h 0m"],
    [3661, "1h 1m"],
    [7320, "2h 2m"],
  ])("formats %i seconds as %s", (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });
});

describe("transformGongCallToListItem", () => {
  it("prefixes the id with gong_ and maps fields", () => {
    const item = transformGongCallToListItem(call({ id: "abc", duration: 1800 }), [
      party({ name: "Alice" }),
      party({ name: "Bob" }),
    ]);
    expect(item.id).toBe("gong_abc");
    expect(item.duration).toBe("30m");
    expect(item.speakers).toBe(2);
    expect(item.source).toBe("gong");
  });

  it("defaults an empty title to 'Untitled Call'", () => {
    expect(transformGongCallToListItem(call({ title: "" })).title).toBe("Untitled Call");
  });
});

describe("transformGongCall", () => {
  const transcript: GongCallTranscript = {
    callId: "123",
    transcript: [{ speakerId: "s1", sentences: [{ start: 0, end: 1000, text: "Hi" }] }],
  };

  it("uses transcript-derived speakers when a transcript exists", () => {
    const rec = transformGongCall(
      call({}),
      [party({ id: "p1", speakerId: "s1", name: "Alice" })],
      transcript,
      "https://media/x",
      "2026-02-12T00:00:00Z"
    );
    expect(rec.id).toBe("gong_123");
    expect(rec.source).toBe("gong");
    expect(rec.transcript).toHaveLength(1);
    expect(rec.speakers.map((s) => s.name)).toEqual(["Alice"]);
    expect(rec.mediaUrlExpiresAt).toBe("2026-02-12T00:00:00Z");
  });

  it("falls back to party-derived speakers when there is no transcript", () => {
    const rec = transformGongCall(
      call({}),
      [party({ name: "Alice" }), party({ name: "Bob" })],
      undefined,
      "https://media/x"
    );
    expect(rec.transcript).toEqual([]);
    expect(rec.speakers.map((s) => s.name)).toEqual(["Alice", "Bob"]);
  });

  it("falls back to parties when the transcript is present but empty", () => {
    const rec = transformGongCall(
      call({}),
      [party({ name: "Alice" })],
      { callId: "123", transcript: [] },
      "https://media/x"
    );
    expect(rec.speakers.map((s) => s.name)).toEqual(["Alice"]);
  });

  it("carries call.purpose into description", () => {
    const rec = transformGongCall(call({ purpose: "Renewal" }), [], undefined, "u");
    expect(rec.description).toBe("Renewal");
  });
});

describe("gong extractSpeakers (transcript-derived)", () => {
  it("dedupes and colors like the zoom variant", () => {
    const speakers = extractSpeakers([
      { id: "1", startTime: 0, endTime: 1, speaker: "Alice", text: "a" },
      { id: "2", startTime: 1, endTime: 2, speaker: "Alice", text: "b" },
    ]);
    expect(speakers).toHaveLength(1);
    expect(speakers[0].color).toBe(SPEAKER_COLORS[0]);
  });
});
