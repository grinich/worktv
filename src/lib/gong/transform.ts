// Gong Data Transformation
// Converts Gong API data to app domain types

import type { GongCall, GongCallTranscript, GongParty } from "@/types/gong";
import type { TranscriptSegment, Speaker } from "@/types/video";
import { SPEAKER_COLORS } from "@/lib/constants";

// Build a map of speakerId -> speaker name from parties
export function buildSpeakerMap(parties: GongParty[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const party of parties) {
    if (party.speakerId) {
      map.set(party.speakerId, party.name ?? party.emailAddress ?? "Unknown");
    }
    // Also map by party ID in case speakerId isn't set
    if (party.id) {
      map.set(party.id, party.name ?? party.emailAddress ?? "Unknown");
    }
  }
  return map;
}

export function parseGongTranscript(
  transcript: GongCallTranscript,
  speakerMap: Map<string, string>
): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let segmentId = 0;

  for (const entry of transcript.transcript) {
    const speakerName = speakerMap.get(entry.speakerId) ?? "Speaker";

    for (const sentence of entry.sentences) {
      segments.push({
        id: `seg-${++segmentId}`,
        startTime: sentence.start / 1000, // Convert ms to seconds
        endTime: sentence.end / 1000,
        speaker: speakerName,
        text: sentence.text,
      });
    }
  }

  // Sort by start time
  return segments.sort((a, b) => a.startTime - b.startTime);
}

export function extractSpeakers(segments: TranscriptSegment[]): Speaker[] {
  const speakerNames = [...new Set(segments.map((s) => s.speaker))];

  return speakerNames.map((name, i) => ({
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
  }));
}

// Get speakers directly from parties when no transcript is available
export function extractSpeakersFromParties(parties: GongParty[]): Speaker[] {
  const names = parties
    .map((p) => p.name ?? p.emailAddress)
    .filter((n): n is string => Boolean(n));

  const uniqueNames = [...new Set(names)];

  return uniqueNames.map((name, i) => ({
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
  }));
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  }
  return `${mins}m`;
}

export interface GongRecordingListItem {
  id: string;
  title: string;
  space: string;
  duration: string;
  speakers: number;
  status: string;
  createdAt: string;
  source: string;
  mediaType: "Video" | "Audio";
}

export function transformGongCallToListItem(
  call: GongCall,
  parties: GongParty[] = []
): GongRecordingListItem {
  return {
    id: `gong_${call.id}`,
    title: call.title || "Untitled Call",
    space: "Gong Calls",
    duration: formatDuration(call.duration),
    speakers: parties.length,
    status: "Processed",
    createdAt: call.started,
    source: "gong",
    mediaType: call.media,
  };
}

export interface GongRecordingData {
  id: string;
  title: string;
  description?: string;
  videoUrl: string;
  duration: number;
  space: string;
  source: string;
  mediaUrlExpiresAt?: string;
  createdAt: string;
  speakers: Speaker[];
  transcript: TranscriptSegment[];
}

export function transformGongCall(
  call: GongCall,
  parties: GongParty[],
  transcript: GongCallTranscript | undefined,
  mediaUrl: string,
  mediaUrlExpiresAt?: string
): GongRecordingData {
  const speakerMap = buildSpeakerMap(parties);

  let segments: TranscriptSegment[] = [];
  let speakers: Speaker[] = [];

  if (transcript && transcript.transcript.length > 0) {
    segments = parseGongTranscript(transcript, speakerMap);
    speakers = extractSpeakers(segments);
  } else {
    // Use parties as speakers when no transcript
    speakers = extractSpeakersFromParties(parties);
  }

  return {
    id: `gong_${call.id}`,
    title: call.title || "Untitled Call",
    description: call.purpose ?? undefined,
    videoUrl: mediaUrl,
    duration: call.duration,
    space: "Gong Calls",
    source: "gong",
    mediaUrlExpiresAt,
    createdAt: call.started,
    speakers,
    transcript: segments,
  };
}
