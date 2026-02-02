"use client";

import { highlightText } from "@/lib/highlight";
import { formatTime } from "@/types/video";

interface SearchMatchDisplayProps {
  matchType: "title" | "custom_title" | "transcript" | "speaker";
  matchText: string;
  matchTime: number | null;
  query: string;
}

export function SearchMatchDisplay({
  matchType,
  matchText,
  matchTime,
  query,
}: SearchMatchDisplayProps) {
  const label =
    matchType === "transcript"
      ? `@${formatTime(matchTime ?? 0)}`
      : matchType === "speaker"
        ? "Speaker"
        : "Title";

  return (
    <div className="mt-1 line-clamp-1 text-xs text-zinc-400 light:text-zinc-500">
      <span className="text-zinc-500 light:text-zinc-400">{label}: </span>
      {highlightText(matchText, query)}
    </div>
  );
}
