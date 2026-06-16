import { describe, it, expect } from "vitest";
import {
  parseTranscript,
  extractSpeakers,
  findVideoFile,
  findTranscriptFile,
  transformZoomMeetingToListItem,
  transformZoomMeeting,
} from "@/lib/zoom/transform";
import { SPEAKER_COLORS } from "@/lib/constants";
import type { ZoomMeeting, ZoomRecordingFile } from "@/types/zoom";

function file(overrides: Partial<ZoomRecordingFile>): ZoomRecordingFile {
  return {
    id: "f1",
    meeting_id: "m1",
    recording_start: "2026-02-11T17:30:00Z",
    recording_end: "2026-02-11T18:07:00Z",
    file_type: "MP4",
    file_extension: "MP4",
    file_size: 1000,
    play_url: "https://zoom.us/play/abc",
    download_url: "https://zoom.us/download/abc",
    status: "completed",
    recording_type: "gallery_view",
    ...overrides,
  };
}

function meeting(overrides: Partial<ZoomMeeting>): ZoomMeeting {
  return {
    uuid: "uuid-1",
    id: 1,
    account_id: "a",
    host_id: "h",
    topic: "Weekly Sync",
    type: 2,
    start_time: "2026-02-11T17:30:00Z",
    timezone: "America/New_York",
    duration: 37,
    total_size: 1000,
    recording_count: 1,
    share_url: "https://zoom.us/share/abc",
    recording_files: [],
    ...overrides,
  };
}

describe("parseTranscript — VTT", () => {
  it("parses standard VTT with cue numbers and speaker prefixes", () => {
    const vtt = [
      "WEBVTT",
      "",
      "1",
      "00:00:01.000 --> 00:00:04.500",
      "Alice: Hello everyone",
      "",
      "2",
      "00:00:05.000 --> 00:00:08.000",
      "Bob: Hi Alice",
      "",
    ].join("\n");

    const segments = parseTranscript(vtt);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      startTime: 1,
      endTime: 4.5,
      speaker: "Alice",
      text: "Hello everyone",
    });
    expect(segments[1]).toMatchObject({ speaker: "Bob", text: "Hi Alice" });
  });

  it("handles CRLF line endings", () => {
    const vtt = "WEBVTT\r\n\r\n00:00:01.000 --> 00:00:02.000\r\nAlice: Hi\r\n";
    const segments = parseTranscript(vtt);
    expect(segments).toHaveLength(1);
    expect(segments[0].speaker).toBe("Alice");
  });

  it("accepts comma as the millisecond separator", () => {
    const vtt = "WEBVTT\n\n00:00:01,250 --> 00:00:02,750\nAlice: Hi\n";
    const segments = parseTranscript(vtt);
    expect(segments[0].startTime).toBeCloseTo(1.25);
    expect(segments[0].endTime).toBeCloseTo(2.75);
  });

  it("converts HH:MM:SS to seconds correctly past the hour", () => {
    const vtt = "WEBVTT\n\n01:02:03.000 --> 01:02:04.000\nAlice: Hi\n";
    const segments = parseTranscript(vtt);
    expect(segments[0].startTime).toBe(3723); // 1h2m3s
  });

  it("falls back to 'Speaker' when no name prefix is present", () => {
    const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nNo speaker here\n";
    const segments = parseTranscript(vtt);
    expect(segments[0].speaker).toBe("Speaker");
    expect(segments[0].text).toBe("No speaker here");
  });

  it("skips blocks without a timestamp line", () => {
    const vtt = "WEBVTT\n\nNOTE just a comment\n\n00:00:01.000 --> 00:00:02.000\nAlice: Hi\n";
    const segments = parseTranscript(vtt);
    expect(segments).toHaveLength(1);
  });
});

describe("parseTranscript — JSON", () => {
  it("parses a JSON array with snake_case fields", () => {
    const json = JSON.stringify([
      { start_time: 1, end_time: 2, speaker: "Alice", text: "Hi" },
      { start_time: 2, end_time: 3, speaker: "Bob", text: "Yo" },
    ]);
    const segments = parseTranscript(json);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ startTime: 1, endTime: 2, speaker: "Alice", text: "Hi" });
  });

  it("reads a `timeline` wrapper and camelCase / alternate field names", () => {
    const json = JSON.stringify({
      timeline: [{ startTime: 5, endTime: 6, user_name: "Carol", content: "Hello" }],
    });
    const segments = parseTranscript(json);
    expect(segments[0]).toMatchObject({ startTime: 5, endTime: 6, speaker: "Carol", text: "Hello" });
  });

  it("defaults missing fields (0 times, 'Speaker', empty text)", () => {
    const segments = parseTranscript(JSON.stringify([{}]));
    expect(segments[0]).toMatchObject({ startTime: 0, endTime: 0, speaker: "Speaker", text: "" });
  });

  it("returns [] for malformed JSON instead of throwing", () => {
    expect(parseTranscript("{ not valid json ")).toEqual([]);
  });
});

describe("extractSpeakers", () => {
  it("dedupes speakers and cycles through the color palette", () => {
    const speakers = extractSpeakers([
      { id: "1", startTime: 0, endTime: 1, speaker: "Alice", text: "a" },
      { id: "2", startTime: 1, endTime: 2, speaker: "Bob", text: "b" },
      { id: "3", startTime: 2, endTime: 3, speaker: "Alice", text: "c" },
    ]);
    expect(speakers.map((s) => s.name)).toEqual(["Alice", "Bob"]);
    expect(speakers[0].color).toBe(SPEAKER_COLORS[0]);
    expect(speakers[1].color).toBe(SPEAKER_COLORS[1]);
  });

  it("derives a slug id from the name", () => {
    const [s] = extractSpeakers([
      { id: "1", startTime: 0, endTime: 1, speaker: "Mary Jane", text: "x" },
    ]);
    expect(s.id).toBe("mary-jane");
  });

  it("wraps color index past the palette length", () => {
    const segs = Array.from({ length: SPEAKER_COLORS.length + 1 }, (_, i) => ({
      id: `${i}`,
      startTime: i,
      endTime: i + 1,
      speaker: `S${i}`,
      text: "x",
    }));
    const speakers = extractSpeakers(segs);
    expect(speakers[SPEAKER_COLORS.length].color).toBe(SPEAKER_COLORS[0]);
  });
});

describe("findVideoFile", () => {
  it("prefers shared_screen_with_speaker_view over other completed MP4s", () => {
    const files = [
      file({ id: "g", recording_type: "gallery_view" }),
      file({ id: "s", recording_type: "shared_screen_with_speaker_view" }),
      file({ id: "a", recording_type: "active_speaker" }),
    ];
    expect(findVideoFile(files)?.id).toBe("s");
  });

  it("falls through the priority list to active_speaker when top choice is absent", () => {
    const files = [
      file({ id: "g", recording_type: "gallery_view" }),
      file({ id: "a", recording_type: "active_speaker" }),
    ];
    expect(findVideoFile(files)?.id).toBe("a");
  });

  it("ignores non-completed files of a higher priority", () => {
    const files = [
      file({ id: "s", recording_type: "shared_screen_with_speaker_view", status: "processing" }),
      file({ id: "g", recording_type: "gallery_view", status: "completed" }),
    ];
    expect(findVideoFile(files)?.id).toBe("g");
  });

  it("falls back to any completed MP4 when no priority type matches", () => {
    const files = [file({ id: "x", recording_type: "audio_only" })];
    expect(findVideoFile(files)?.id).toBe("x");
  });

  it("returns undefined when there is no completed MP4", () => {
    const files = [file({ file_type: "M4A" }), file({ status: "processing" })];
    expect(findVideoFile(files)).toBeUndefined();
  });
});

describe("findTranscriptFile", () => {
  it("matches by TRANSCRIPT file_type", () => {
    const files = [file({ id: "t", file_type: "TRANSCRIPT" })];
    expect(findTranscriptFile(files)?.id).toBe("t");
  });

  it("matches by audio_transcript recording_type", () => {
    const files = [file({ id: "t", file_type: "CC", recording_type: "audio_transcript" })];
    expect(findTranscriptFile(files)?.id).toBe("t");
  });

  it("ignores non-completed transcript files", () => {
    const files = [file({ file_type: "TRANSCRIPT", status: "processing" })];
    expect(findTranscriptFile(files)).toBeUndefined();
  });
});

describe("transformZoomMeetingToListItem", () => {
  it("formats sub-hour duration as Nm", () => {
    const item = transformZoomMeetingToListItem(
      meeting({ duration: 37, recording_files: [file({})] })
    );
    expect(item?.duration).toBe("37m");
  });

  it("formats >= 60 min as Hh Mm", () => {
    const item = transformZoomMeetingToListItem(
      meeting({ duration: 95, recording_files: [file({})] })
    );
    expect(item?.duration).toBe("1h 35m");
  });

  it("marks Processing when any file is not completed", () => {
    const item = transformZoomMeetingToListItem(
      meeting({
        recording_files: [file({ status: "completed" }), file({ id: "2", status: "processing" })],
      })
    );
    expect(item?.status).toBe("Processing");
  });

  it("returns null when there is no usable video file", () => {
    const item = transformZoomMeetingToListItem(
      meeting({ recording_files: [file({ file_type: "M4A" })] })
    );
    expect(item).toBeNull();
  });
});

describe("transformZoomMeeting", () => {
  it("converts duration to seconds and appends access token to the URL", async () => {
    const rec = await transformZoomMeeting(
      meeting({ duration: 37, recording_files: [file({ download_url: "https://v/x" })] }),
      "tok123"
    );
    expect(rec?.duration).toBe(37 * 60);
    expect(rec?.videoUrl).toBe("https://v/x?access_token=tok123");
  });

  it("fetches and parses the transcript when a fetcher is provided", async () => {
    const vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nAlice: Hi\n";
    const rec = await transformZoomMeeting(
      meeting({
        recording_files: [file({}), file({ id: "t", file_type: "TRANSCRIPT", download_url: "https://t" })],
      }),
      undefined,
      async () => vtt
    );
    expect(rec?.transcript).toHaveLength(1);
    expect(rec?.speakers.map((s) => s.name)).toEqual(["Alice"]);
  });

  it("does not throw and yields an empty transcript when the fetcher rejects", async () => {
    const rec = await transformZoomMeeting(
      meeting({
        recording_files: [file({}), file({ id: "t", file_type: "TRANSCRIPT" })],
      }),
      undefined,
      async () => {
        throw new Error("network");
      }
    );
    expect(rec?.transcript).toEqual([]);
    expect(rec?.speakers).toEqual([]);
  });

  it("returns null when there is no video file", async () => {
    const rec = await transformZoomMeeting(meeting({ recording_files: [] }));
    expect(rec).toBeNull();
  });
});
