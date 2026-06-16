import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { TranscriptSegment, AISummary } from "@/types/video";
import { SUMMARY_MODEL } from "@/lib/constants";

const MODEL = SUMMARY_MODEL;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }
  return new Anthropic({ apiKey });
}

function formatTranscriptForPrompt(segments: TranscriptSegment[]): string {
  return segments
    .map((seg) => `[${seg.speaker}]: ${seg.text}`)
    .join("\n");
}

const SUMMARY_PROMPT = `Summarize this meeting transcript.

1. BRIEF: Write a 1-2 sentence summary of what this meeting was about and who participated.

2. KEY POINTS: List up to 10 key points discussed. Be specific and concrete - avoid vague phrases.

3. NEXT STEPS: List any action items, follow-ups, or commitments made. Include who is responsible if mentioned. If none, return an empty list.

Meeting transcript:
---
{transcript}
---`;

// The response shape is enforced by the API via structured outputs, so no
// fence-stripping or manual JSON parsing/coercion is needed.
const SummarySchema = z.object({
  brief: z.string(),
  keyPoints: z.array(z.string()),
  nextSteps: z.array(z.string()),
});

export async function generateTranscriptSummary(
  segments: TranscriptSegment[]
): Promise<AISummary> {
  if (segments.length === 0) {
    return {
      brief: "No transcript available for this recording.",
      keyPoints: [],
      nextSteps: [],
    };
  }

  const client = getClient();
  const transcript = formatTranscriptForPrompt(segments);
  const prompt = SUMMARY_PROMPT.replace("{transcript}", transcript);

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8192, // Max output for Haiku 4.5
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(SummarySchema) },
  });

  const summary = response.parsed_output;
  if (!summary) {
    throw new Error("Claude did not return a structured summary");
  }

  return summary;
}

export { MODEL as SUMMARY_MODEL };

const CLIP_TITLE_PROMPT = `Generate a short, descriptive title for a video clip.

The primary speaker in this clip is: {speaker}

CLIP TRANSCRIPT (the selected portion):
---
{clipTranscript}
---

{fullContext}

Your task:
1. Identify what makes this clip unique or interesting compared to the rest of the call
2. Focus on the most salient point, key insight, or notable moment in the clip
3. Generate a title that captures why someone would want to watch this specific clip

The title should:
- Start with the speaker's first name followed by a colon (e.g., "Sally: ")
- Be followed by 3-6 words summarizing the key moment or insight
- Be specific and concrete - avoid vague descriptions
- Highlight what's distinctive about this part of the conversation
- Not include quotes or punctuation at the end

Return only the title text in format "FirstName: key moment description", nothing else.`;

export async function generateClipTitle(
  clipSegments: TranscriptSegment[],
  fullTranscript?: TranscriptSegment[]
): Promise<string> {
  if (clipSegments.length === 0) {
    return "";
  }

  // Find the primary speaker in the clip (most segments)
  const speakerCounts = new Map<string, number>();
  for (const seg of clipSegments) {
    speakerCounts.set(seg.speaker, (speakerCounts.get(seg.speaker) || 0) + 1);
  }
  let primarySpeaker = "Unknown";
  let maxCount = 0;
  for (const [speaker, count] of speakerCounts) {
    if (count > maxCount) {
      maxCount = count;
      primarySpeaker = speaker;
    }
  }

  const client = getClient();
  const clipTranscript = formatTranscriptForPrompt(clipSegments);

  // Build full context section if we have the full transcript
  let fullContext = "";
  if (fullTranscript && fullTranscript.length > clipSegments.length) {
    const fullText = formatTranscriptForPrompt(fullTranscript);
    // Limit context to avoid token limits (roughly 8k chars)
    // Truncate at segment boundaries to avoid cutting mid-sentence
    let truncatedFull = fullText;
    if (fullText.length > 8000) {
      const halfSegments = Math.floor(fullTranscript.length / 2);
      const startSegments = fullTranscript.slice(0, Math.min(halfSegments, 50));
      const endSegments = fullTranscript.slice(-Math.min(halfSegments, 50));
      truncatedFull = formatTranscriptForPrompt(startSegments) +
        "\n...[middle truncated]...\n" +
        formatTranscriptForPrompt(endSegments);
    }
    fullContext = `FULL CALL TRANSCRIPT (for context):
---
${truncatedFull}
---`;
  }

  const prompt = CLIP_TITLE_PROMPT
    .replace("{clipTranscript}", clipTranscript)
    .replace("{speaker}", primarySpeaker)
    .replace("{fullContext}", fullContext);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude");
  }

  return content.text.trim();
}
