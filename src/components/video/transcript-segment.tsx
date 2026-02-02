"use client";

import { forwardRef } from "react";
import { formatTime } from "@/types/video";
import { highlightText } from "@/lib/highlight";

interface TranscriptSegmentProps {
  startTime: number;
  speaker: string;
  text: string;
  isActive: boolean;
  showSpeaker: boolean;
  onClick: () => void;
  searchQuery?: string;
  isSearchMatch?: boolean;
}

export const TranscriptSegment = forwardRef<
  HTMLButtonElement,
  TranscriptSegmentProps
>(function TranscriptSegment(
  { startTime, speaker, text, isActive, showSpeaker, onClick, searchQuery, isSearchMatch },
  ref
) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      className={`group w-full text-left text-sm transition ${
        showSpeaker ? "mt-3 first:mt-0" : ""
      } ${isSearchMatch ? "bg-yellow-400/10 -mx-2 px-2 py-1 rounded" : ""}`}
    >
      {showSpeaker && (
        <div className="mb-1 text-xs font-semibold text-zinc-400 light:text-zinc-500">{speaker}</div>
      )}
      <div className="flex items-start gap-3">
        <span
          className={`flex-1 transition ${
            isActive
              ? "text-zinc-50 light:text-zinc-900"
              : "text-zinc-500 group-hover:text-zinc-300 light:text-zinc-500 light:group-hover:text-zinc-700"
          }`}
        >
          {searchQuery ? highlightText(text, searchQuery) : text}
        </span>
        <span
          className={`shrink-0 font-mono text-xs transition ${
            isActive
              ? "text-indigo-400 light:text-indigo-600"
              : "text-zinc-600 group-hover:text-zinc-500"
          }`}
        >
          {formatTime(startTime)}
        </span>
      </div>
    </button>
  );
});
