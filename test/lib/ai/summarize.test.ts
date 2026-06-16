import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TranscriptSegment } from "@/types/video";

// Mock the Anthropic SDK so no network call happens. Summaries go through
// messages.parse (structured outputs); clip titles through messages.create.
const createMock = vi.fn();
const parseMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class {
      messages = { create: createMock, parse: parseMock };
    },
  };
});

// getClient() requires an API key to be present.
process.env.ANTHROPIC_API_KEY = "test-key";

import {
  generateTranscriptSummary,
  generateClipTitle,
} from "@/lib/ai/summarize";

function textResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

const segments: TranscriptSegment[] = [
  { id: "1", startTime: 0, endTime: 2, speaker: "Alice", text: "We should ship Friday." },
  { id: "2", startTime: 2, endTime: 4, speaker: "Bob", text: "I'll own the release." },
];

beforeEach(() => {
  createMock.mockReset();
  parseMock.mockReset();
});

describe("generateTranscriptSummary", () => {
  it("short-circuits with a placeholder when there are no segments (no API call)", async () => {
    const result = await generateTranscriptSummary([]);
    expect(result.brief).toMatch(/no transcript/i);
    expect(result.keyPoints).toEqual([]);
    expect(result.nextSteps).toEqual([]);
    expect(parseMock).not.toHaveBeenCalled();
  });

  it("returns the structured parsed_output from the API", async () => {
    const summary = { brief: "A sync.", keyPoints: ["Ship Friday"], nextSteps: ["Bob owns release"] };
    parseMock.mockResolvedValue({ parsed_output: summary });
    expect(await generateTranscriptSummary(segments)).toEqual(summary);
  });

  it("throws when no structured output is returned (e.g. refusal)", async () => {
    parseMock.mockResolvedValue({ parsed_output: null });
    await expect(generateTranscriptSummary(segments)).rejects.toThrow(/structured summary/i);
  });

  it("requests structured output with the configured Haiku model and bounded max_tokens", async () => {
    parseMock.mockResolvedValue({ parsed_output: { brief: "x", keyPoints: [], nextSteps: [] } });
    await generateTranscriptSummary(segments);
    const arg = parseMock.mock.calls[0][0];
    expect(arg.model).toBe("claude-haiku-4-5-20251001");
    expect(arg.max_tokens).toBe(8192);
    // A json_schema format is attached so the API enforces the response shape.
    expect(arg.output_config.format.type).toBe("json_schema");
    expect(arg.output_config.format.schema.required).toEqual(
      expect.arrayContaining(["brief", "keyPoints", "nextSteps"])
    );
    // The transcript is formatted as "[speaker]: text" lines in the prompt.
    expect(arg.messages[0].content).toContain("[Alice]: We should ship Friday.");
  });
});

describe("generateClipTitle", () => {
  it("returns empty string for an empty clip without calling the API", async () => {
    expect(await generateClipTitle([])).toBe("");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns the trimmed model output", async () => {
    createMock.mockResolvedValue(textResponse("  Alice: ship date locked  "));
    expect(await generateClipTitle(segments)).toBe("Alice: ship date locked");
  });

  it("identifies the primary (most frequent) speaker in the prompt", async () => {
    createMock.mockResolvedValue(textResponse("Alice: x"));
    const clip: TranscriptSegment[] = [
      { id: "1", startTime: 0, endTime: 1, speaker: "Alice", text: "a" },
      { id: "2", startTime: 1, endTime: 2, speaker: "Alice", text: "b" },
      { id: "3", startTime: 2, endTime: 3, speaker: "Bob", text: "c" },
    ];
    await generateClipTitle(clip);
    expect(createMock.mock.calls[0][0].messages[0].content).toContain("primary speaker in this clip is: Alice");
  });
});
