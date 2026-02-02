"use client";

import { useMemo, useState } from "react";

interface Speaker {
  id: string;
  name: string;
  color: string;
}

interface TranscriptSegment {
  id: string;
  startTime: number;
  endTime: number;
  speaker: string;
  text: string;
}

interface Participant {
  name: string;
  email: string | null;
}

interface SpeakerTimelineProps {
  segments: TranscriptSegment[];
  speakers: Speaker[];
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
  participants?: Participant[];
}

interface SpeakerStats {
  name: string;
  color: string;
  totalTime: number;
  percentage: number;
  segments: { start: number; end: number }[];
}

export function SpeakerTimeline({
  segments,
  speakers,
  duration,
  currentTime,
  onSeek,
  participants = [],
}: SpeakerTimelineProps) {
  const [hoveredSpeaker, setHoveredSpeaker] = useState<string | null>(null);

  // Create a map of speaker names to participant emails (fuzzy match by name)
  const speakerEmails = useMemo(() => {
    const emailMap = new Map<string, string>();
    for (const participant of participants) {
      if (participant.email) {
        // Try exact match first
        emailMap.set(participant.name.toLowerCase(), participant.email);
      }
    }
    return emailMap;
  }, [participants]);

  const getEmailForSpeaker = (speakerName: string): string | null => {
    const lowerName = speakerName.toLowerCase();
    // Try exact match
    if (speakerEmails.has(lowerName)) {
      return speakerEmails.get(lowerName) || null;
    }
    // Try partial match (speaker name contains participant name or vice versa)
    for (const [participantName, email] of speakerEmails) {
      if (lowerName.includes(participantName) || participantName.includes(lowerName)) {
        return email;
      }
    }
    return null;
  };
  const speakerStats = useMemo(() => {
    const stats = new Map<string, SpeakerStats>();

    // Initialize stats for each speaker
    for (const speaker of speakers) {
      stats.set(speaker.name, {
        name: speaker.name,
        color: speaker.color,
        totalTime: 0,
        percentage: 0,
        segments: [],
      });
    }

    // Calculate speaking time from segments
    for (const segment of segments) {
      const speakerName = segment.speaker;
      let stat = stats.get(speakerName);

      if (!stat) {
        // Speaker not in speakers list, create one with a default color
        const colors = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
        stat = {
          name: speakerName,
          color: colors[stats.size % colors.length],
          totalTime: 0,
          percentage: 0,
          segments: [],
        };
        stats.set(speakerName, stat);
      }

      const segmentDuration = segment.endTime - segment.startTime;
      stat.totalTime += segmentDuration;
      stat.segments.push({ start: segment.startTime, end: segment.endTime });
    }

    // Calculate percentages
    for (const stat of stats.values()) {
      stat.percentage = duration > 0 ? (stat.totalTime / duration) * 100 : 0;
    }

    // Sort by total speaking time (descending)
    return Array.from(stats.values())
      .filter((s) => s.totalTime > 0)
      .sort((a, b) => b.totalTime - a.totalTime);
  }, [segments, speakers, duration]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (speakerStats.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Combined timeline */}
      <div>
        <div className="mb-2 text-xs font-medium text-zinc-400 light:text-zinc-500">Timeline</div>
        <div
          className="relative h-8 w-full cursor-pointer overflow-hidden rounded-lg bg-zinc-800 light:bg-zinc-200"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = x / rect.width;
            onSeek(percentage * duration);
          }}
        >
          {/* Render all segments */}
          {speakerStats.map((speaker) =>
            speaker.segments.map((segment, i) => (
              <div
                key={`${speaker.name}-${i}`}
                className="absolute top-0 h-full opacity-80 transition-opacity hover:opacity-100"
                style={{
                  left: `${(segment.start / duration) * 100}%`,
                  width: `${((segment.end - segment.start) / duration) * 100}%`,
                  backgroundColor: speaker.color,
                }}
                title={`${speaker.name}: ${formatTime(segment.start)} - ${formatTime(segment.end)}`}
              />
            ))
          )}
          {/* Playhead */}
          <div
            className="absolute top-0 h-full w-0.5 bg-white shadow-lg light:bg-zinc-900"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          />
        </div>
      </div>

      {/* Speaker stats */}
      <div className="space-y-2">
        {speakerStats.map((speaker) => {
          const email = getEmailForSpeaker(speaker.name);
          return (
          <div key={speaker.name} className="group">
            <div className="mb-1 flex items-center justify-between text-xs">
              <div className="relative flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: speaker.color }}
                />
                <span
                  className="cursor-default font-medium text-zinc-300 light:text-zinc-700"
                  onMouseEnter={() => email && setHoveredSpeaker(speaker.name)}
                  onMouseLeave={() => setHoveredSpeaker(null)}
                >
                  {speaker.name}
                </span>
                {hoveredSpeaker === speaker.name && email && (
                  <div className="absolute left-0 top-full z-10 mt-1 whitespace-nowrap rounded-md bg-zinc-700 px-2 py-1 text-xs text-zinc-200 shadow-lg light:bg-zinc-800 light:text-zinc-100">
                    {email}
                  </div>
                )}
              </div>
              <span className="text-zinc-500">
                {formatTime(speaker.totalTime)} ({speaker.percentage.toFixed(0)}%)
              </span>
            </div>
            {/* Individual speaker timeline - click to jump */}
            <div
              className="relative h-2 w-full cursor-pointer overflow-hidden rounded bg-zinc-800/50 light:bg-zinc-200"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const percentage = x / rect.width;
                const targetTime = percentage * duration;
                // Find the closest segment for this speaker
                let closest = speaker.segments[0];
                let minDist = Infinity;
                for (const seg of speaker.segments) {
                  const segMid = (seg.start + seg.end) / 2;
                  const dist = Math.abs(segMid - targetTime);
                  if (dist < minDist) {
                    minDist = dist;
                    closest = seg;
                  }
                }
                if (closest) {
                  onSeek(closest.start);
                }
              }}
            >
              {speaker.segments.map((segment, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full transition-opacity group-hover:opacity-100"
                  style={{
                    left: `${(segment.start / duration) * 100}%`,
                    width: `${((segment.end - segment.start) / duration) * 100}%`,
                    backgroundColor: speaker.color,
                    opacity: 0.6,
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
