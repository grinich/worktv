import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TranscriptSegment } from "@/types/video";

// Mock the Anthropic SDK so no network call happens. `createMock` is what each
// test configures to control the model's "response".
const createMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class {
      messages = { create: createMock };
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
});

describe("generateTranscriptSummary", () => {
  it("short-circuits with a placeholder when there are no segments (no API call)", async () => {
    const result = await generateTranscriptSummary([]);
    expect(result.brief).toMatch(/no transcript/i);
    expect(result.keyPoints).toEqual([]);
    expect(result.nextSteps).toEqual([]);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("parses a plain JSON response", async () => {
    createMock.mockResolvedValue(
      textResponse(JSON.stringify({ brief: "A sync.", keyPoints: ["Ship Friday"], nextSteps: ["Bob owns release"] }))
    );
    const result = await generateTranscriptSummary(segments);
    expect(result).toEqual({ brief: "A sync.", keyPoints: ["Ship Friday"], nextSteps: ["Bob owns release"] });
  });

  it("strips a ```json fenced code block before parsing", async () => {
    createMock.mockResolvedValue(
      textResponse('```json\n{"brief":"x","keyPoints":[],"nextSteps":[]}\n```')
    );
    const result = await generateTranscriptSummary(segments);
    expect(result.brief).toBe("x");
  });

  it("strips a bare ``` fence too", async () => {
    createMock.mockResolvedValue(
      textResponse('```\n{"brief":"y","keyPoints":[],"nextSteps":[]}\n```')
    );
    expect((await generateTranscriptSummary(segments)).brief).toBe("y");
  });

  it("normalizes object array items to strings (action/text/JSON fallback)", async () => {
    createMock.mockResolvedValue(
      textResponse(
        JSON.stringify({
          brief: "z",
          keyPoints: [{ text: "a point" }, "plain"],
          nextSteps: [{ action: "do thing" }, { owner: "Bob" }],
        })
      )
    );
    const result = await generateTranscriptSummary(segments);
    expect(result.keyPoints).toEqual(["a point", "plain"]);
    expect(result.nextSteps[0]).toBe("do thing");
    // No action/text key -> falls back to JSON.stringify of the object.
    expect(result.nextSteps[1]).toBe(JSON.stringify({ owner: "Bob" }));
  });

  it("throws on invalid JSON", async () => {
    createMock.mockResolvedValue(textResponse("not json at all"));
    await expect(generateTranscriptSummary(segments)).rejects.toThrow(/parse/i);
  });

  it("throws when the response shape is invalid", async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify({ brief: "x", keyPoints: "nope" })));
    await expect(generateTranscriptSummary(segments)).rejects.toThrow(/invalid summary/i);
  });

  it("throws when the response is not a text block", async () => {
    createMock.mockResolvedValue({ content: [{ type: "tool_use" }] });
    await expect(generateTranscriptSummary(segments)).rejects.toThrow(/unexpected response/i);
  });

  it("sends the configured Haiku model and a bounded max_tokens", async () => {
    createMock.mockResolvedValue(textResponse(JSON.stringify({ brief: "x", keyPoints: [], nextSteps: [] })));
    await generateTranscriptSummary(segments);
    const arg = createMock.mock.calls[0][0];
    expect(arg.model).toBe("claude-haiku-4-5-20251001");
    expect(arg.max_tokens).toBe(8192);
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
