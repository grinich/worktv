import { NextResponse } from "next/server";
import {
  getRecordingsPaginated,
  getSpeakersByRecordingIds,
  getSummariesByRecordingIds,
} from "@/lib/db";
import {
  isDemoMode,
  anonymizeRecordingTitles,
  anonymizeSpeakers,
} from "@/lib/demo";
import type { AISummary } from "@/types/video";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source") as "zoom" | "gong" | "all" | null;
  const cursor = searchParams.get("cursor") ?? undefined;
  const parsedLimit = parseInt(searchParams.get("limit") || "20", 10);
  const limit = Math.min(Math.max(Number.isNaN(parsedLimit) ? 20 : parsedLimit, 1), 100);
  const includeSummaries = searchParams.get("includeSummaries") === "true";
  const demoMode = isDemoMode(searchParams);

  const sourceFilter = source === "zoom" || source === "gong" ? source : "all";

  const result = getRecordingsPaginated(sourceFilter, limit, cursor);

  const speakersByRecording = getSpeakersByRecordingIds(
    result.items.map((r) => r.id)
  );

  // Fetch summaries if requested (for grid view)
  const summariesByRecording = includeSummaries
    ? getSummariesByRecordingIds(result.items.map((r) => r.id))
    : {};

  // Anonymize titles in demo mode
  let titleMap: Map<string, string> | null = null;
  if (demoMode && result.items.length > 0) {
    const titles = result.items.map((r) => r.custom_title || r.title);
    titleMap = await anonymizeRecordingTitles(titles);
  }

  const recordingsWithMeta = result.items.map((recording) => {
    let speakers = speakersByRecording[recording.id] ?? [];
    const summaryRow = summariesByRecording[recording.id];
    let summaryBrief: string | null = null;
    if (summaryRow) {
      try {
        const parsed = JSON.parse(summaryRow.content) as AISummary;
        summaryBrief = parsed.brief || null;
      } catch (e) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(`Invalid summary JSON for recording ${recording.id}:`, e);
        }
      }
    }

    // Apply demo mode anonymization
    let title = recording.title;
    let customTitle = recording.custom_title;
    let description = recording.description;

    if (demoMode && titleMap) {
      const originalTitle = recording.custom_title || recording.title;
      const fakeTitle = titleMap.get(originalTitle);
      if (fakeTitle) {
        if (recording.custom_title) {
          customTitle = fakeTitle;
        } else {
          title = fakeTitle;
        }
      }
      if (description) {
        description = "Discussion about project updates and team coordination.";
      }
      // Anonymize speaker names while preserving other fields
      const anonymized = anonymizeSpeakers(speakers.map(s => ({ id: s.id, name: s.name, color: s.color })));
      speakers = speakers.map((s, i) => ({ ...s, name: anonymized[i].name }));
      if (summaryBrief) {
        summaryBrief = "Team discussed project milestones and upcoming deliverables.";
      }
    }

    return {
      ...recording,
      title,
      custom_title: customTitle,
      description,
      speakers,
      hasTranscript: speakers.length > 0,
      posterUrl: recording.poster_url,
      previewGifUrl: recording.preview_gif_url,
      summaryBrief,
      match_type: "title" as const,
      match_text: null,
      match_time: null,
    };
  });

  return NextResponse.json({
    recordings: recordingsWithMeta,
    hasMore: result.hasMore,
    nextCursor: result.nextCursor,
  });
}
