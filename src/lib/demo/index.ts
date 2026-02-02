/**
 * Demo mode utilities for anonymizing sensitive data
 *
 * When ?demo=true is in the URL, all real data is transformed into
 * AI-generated fake data that looks realistic but protects privacy.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";

// In-memory cache for anonymized data (persists for server lifetime)
const anonymizationCache = new Map<string, unknown>();

// Cached name mappings for consistency
const nameCache = new Map<string, string>();
const emailCache = new Map<string, string>();

/**
 * Check if demo mode is enabled via URL params
 */
export function isDemoMode(
  searchParams: { demo?: string } | URLSearchParams
): boolean {
  if (searchParams instanceof URLSearchParams) {
    return searchParams.get("demo") === "true";
  }
  return searchParams.demo === "true";
}

/**
 * Generate a deterministic hash for caching
 */
function hashContent(content: string): string {
  return createHash("md5").update(content).digest("hex").slice(0, 12);
}

/**
 * Get or create a cached anonymization
 */
function getCached<T>(key: string): T | undefined {
  return anonymizationCache.get(key) as T | undefined;
}

function setCache<T>(key: string, value: T): T {
  anonymizationCache.set(key, value);
  return value;
}

/**
 * Generate fake names consistently (same input = same output)
 */
const FAKE_FIRST_NAMES = [
  "Alex",
  "Jordan",
  "Taylor",
  "Morgan",
  "Casey",
  "Riley",
  "Quinn",
  "Avery",
  "Cameron",
  "Drew",
  "Jamie",
  "Skyler",
  "Reese",
  "Parker",
  "Sage",
  "Blake",
  "Hayden",
  "Emery",
  "Rowan",
  "Finley",
];

const FAKE_LAST_NAMES = [
  "Smith",
  "Chen",
  "Park",
  "Rivera",
  "Kim",
  "Jones",
  "Lee",
  "Wu",
  "Garcia",
  "Patel",
  "Brown",
  "Miller",
  "Davis",
  "Wilson",
  "Moore",
  "Taylor",
  "Anderson",
  "Thomas",
  "Jackson",
  "White",
];

function anonymizeName(realName: string): string {
  if (nameCache.has(realName)) {
    return nameCache.get(realName)!;
  }

  const hash = hashContent(realName);
  const firstIndex = parseInt(hash.slice(0, 4), 16) % FAKE_FIRST_NAMES.length;
  const lastIndex = parseInt(hash.slice(4, 8), 16) % FAKE_LAST_NAMES.length;
  const fakeName = `${FAKE_FIRST_NAMES[firstIndex]} ${FAKE_LAST_NAMES[lastIndex]}`;

  nameCache.set(realName, fakeName);
  return fakeName;
}

function anonymizeEmail(realEmail: string): string {
  if (emailCache.has(realEmail)) {
    return emailCache.get(realEmail)!;
  }

  const hash = hashContent(realEmail);
  const localPart = realEmail.includes("@") ? realEmail.split("@")[0] : realEmail;
  const fakeName = anonymizeName(localPart);
  const fakeEmail = `${fakeName.toLowerCase().replace(" ", ".")}@example.com`;

  emailCache.set(realEmail, fakeEmail);
  return fakeEmail;
}

/**
 * Anonymize recording titles using Claude
 */
export async function anonymizeRecordingTitles(
  titles: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const uncached: string[] = [];

  // Check cache first
  for (const title of titles) {
    const cacheKey = `title:${hashContent(title)}`;
    const cached = getCached<string>(cacheKey);
    if (cached) {
      result.set(title, cached);
    } else {
      uncached.push(title);
    }
  }

  if (uncached.length === 0) {
    return result;
  }

  // Generate fake titles using Claude
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `Generate fake but realistic meeting titles for a software company. For each input title, create a similar but completely different title about a different topic. Keep the style and length similar.

Input titles (one per line):
${uncached.join("\n")}

Output exactly ${uncached.length} fake titles, one per line, in the same order. Just the titles, no numbering or extra text.`,
      },
    ],
  });

  const fakeContent =
    response.content[0].type === "text" ? response.content[0].text : "";
  const fakeTitles = fakeContent.split("\n").filter((t) => t.trim());

  if (fakeTitles.length !== uncached.length) {
    console.warn(
      `Demo: Expected ${uncached.length} titles, got ${fakeTitles.length}`
    );
  }

  for (let i = 0; i < uncached.length; i++) {
    const original = uncached[i];
    const fake = fakeTitles[i] || `Meeting ${i + 1}`;
    const cacheKey = `title:${hashContent(original)}`;
    setCache(cacheKey, fake);
    result.set(original, fake);
  }

  return result;
}

/**
 * Anonymize transcript segments
 */
export async function anonymizeTranscriptSegments(
  segments: Array<{
    id: string;
    speaker: string;
    text: string;
    start_time: number;
    end_time: number;
  }>
): Promise<
  Array<{
    id: string;
    speaker: string;
    text: string;
    start_time: number;
    end_time: number;
  }>
> {
  if (segments.length === 0) return [];

  // Collect unique speakers for consistent anonymization
  const speakerMap = new Map<string, string>();
  for (const seg of segments) {
    if (!speakerMap.has(seg.speaker)) {
      speakerMap.set(seg.speaker, anonymizeName(seg.speaker));
    }
  }

  // Check if already cached
  const cacheKey = `transcript:${hashContent(JSON.stringify(segments.map((s) => s.text)))}`;
  const cached = getCached<
    Array<{
      id: string;
      speaker: string;
      text: string;
      start_time: number;
      end_time: number;
    }>
  >(cacheKey);
  if (cached) {
    return cached.map((seg, i) => ({
      ...seg,
      speaker: speakerMap.get(segments[i].speaker) || seg.speaker,
    }));
  }

  // Only anonymize text content if there are segments
  const textsToAnonymize = segments.map((s) => s.text);

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: `Rewrite these meeting transcript segments to anonymize them. Keep the same conversational style, length, and tone but change:
- All company names to fictional ones
- All product names to fictional ones
- All specific details (dates, numbers, metrics) to different but plausible values
- Any personal information

Keep each segment on its own line, maintaining the same number of segments.

Segments (one per line):
${textsToAnonymize.join("\n---SEGMENT---\n")}

Output exactly ${textsToAnonymize.length} anonymized segments, separated by ---SEGMENT---`,
      },
    ],
  });

  const fakeContent =
    response.content[0].type === "text" ? response.content[0].text : "";
  const fakeTexts = fakeContent.split("---SEGMENT---").map((t) => t.trim());

  const result = segments.map((seg, i) => ({
    ...seg,
    speaker: speakerMap.get(seg.speaker) || seg.speaker,
    text: fakeTexts[i] || seg.text,
  }));

  setCache(cacheKey, result);
  return result;
}

/**
 * Anonymize speakers list
 */
export function anonymizeSpeakers(
  speakers: Array<{ id: string; name: string; color: string }>
): Array<{ id: string; name: string; color: string }> {
  return speakers.map((speaker) => ({
    ...speaker,
    name: anonymizeName(speaker.name),
  }));
}

/**
 * Anonymize participants list
 */
export function anonymizeParticipants(
  participants: Array<{
    id: string;
    name: string;
    email: string | null;
    user_id: string | null;
  }>
): Array<{
  id: string;
  name: string;
  email: string | null;
  user_id: string | null;
}> {
  return participants.map((p) => ({
    ...p,
    name: anonymizeName(p.name),
    email: p.email ? anonymizeEmail(p.email) : null,
    user_id: p.user_id ? `user_${hashContent(p.user_id)}` : null,
  }));
}

/**
 * Anonymize summary content
 */
export async function anonymizeSummary(summary: {
  brief: string;
  keyPoints: string[];
  nextSteps: string[];
}): Promise<{
  brief: string;
  keyPoints: string[];
  nextSteps: string[];
}> {
  const cacheKey = `summary:${hashContent(JSON.stringify(summary))}`;
  const cached = getCached<typeof summary>(cacheKey);
  if (cached) return cached;

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `Rewrite this meeting summary to anonymize it. Keep the same structure and professional tone, but change all specific details, names, and companies to fictional ones.

Original:
Brief: ${summary.brief}

Key Points:
${summary.keyPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}

Next Steps:
${summary.nextSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Output in this exact JSON format:
{
  "brief": "...",
  "keyPoints": ["...", "..."],
  "nextSteps": ["...", "..."]
}`,
      },
    ],
  });

  const fakeContent =
    response.content[0].type === "text" ? response.content[0].text : "{}";

  try {
    // Extract JSON from response
    const jsonMatch = fakeContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      setCache(cacheKey, parsed);
      return parsed;
    }
  } catch {
    // Fall back to original
  }

  setCache(cacheKey, summary);
  return summary;
}

// Common false positives for name detection (places, companies, etc.)
const NAME_BLOCKLIST = new Set([
  "New York",
  "Los Angeles",
  "San Francisco",
  "San Diego",
  "Las Vegas",
  "New Jersey",
  "New Zealand",
  "United States",
  "United Kingdom",
  "South Africa",
  "North America",
  "South America",
  "Microsoft Office",
  "Google Chrome",
  "Visual Studio",
  "Open Source",
  "Machine Learning",
  "Artificial Intelligence",
  "Next Steps",
  "Key Points",
  "Action Items",
]);

/**
 * Anonymize chat messages
 */
export function anonymizeChatMessages(
  messages: Array<{
    id: string;
    sender: string;
    message: string;
    timestamp: number;
  }>
): Array<{ id: string; sender: string; message: string; timestamp: number }> {
  return messages.map((msg) => ({
    ...msg,
    sender: anonymizeName(msg.sender),
    // Simple text anonymization - replace potential names and emails
    message: msg.message
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "user@example.com")
      .replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, (match) =>
        NAME_BLOCKLIST.has(match) ? match : anonymizeName(match)
      ),
  }));
}

/**
 * Anonymize clip data
 */
export async function anonymizeClips(
  clips: Array<{ id: string; title: string | null; recording_id: string }>
): Promise<Array<{ id: string; title: string | null; recording_id: string }>> {
  const titlesToAnonymize = clips
    .filter((c) => c.title)
    .map((c) => c.title as string);

  if (titlesToAnonymize.length === 0) {
    return clips;
  }

  const titleMap = await anonymizeRecordingTitles(titlesToAnonymize);

  return clips.map((clip) => ({
    ...clip,
    title: clip.title ? titleMap.get(clip.title) || clip.title : null,
  }));
}
