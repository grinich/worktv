"use client";

import Link from "next/link";
import { useState } from "react";
import type { Clip } from "@/types/video";
import { LocalDateTime } from "@/components/local-datetime";

interface ClipWithRecording extends Clip {
  recordingTitle: string;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function ClipsListView({ clips: initialClips }: { clips: ClipWithRecording[] }) {
  const [clips, setClips] = useState(initialClips);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCopyLink = async (clip: ClipWithRecording) => {
    const url = `${window.location.origin}/c/${clip.id}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(clip.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (clipId: string) => {
    if (!confirm("Delete this clip?")) return;

    setDeletingId(clipId);
    try {
      const response = await fetch(`/api/clips/${clipId}`, { method: "DELETE" });
      if (response.ok) {
        setClips((prev) => prev.filter((c) => c.id !== clipId));
      }
    } finally {
      setDeletingId(null);
    }
  };

  if (clips.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-zinc-900/50 p-8 text-center light:border-zinc-200 light:bg-white">
        <p className="text-zinc-400 light:text-zinc-500">
          No clips yet. Create clips from any recording by clicking the &quot;Clip&quot; button while watching.
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-2 light:border-zinc-200 light:bg-white">
      <div className="divide-y divide-white/10 light:divide-zinc-200">
        {clips.map((clip) => {
          const isCopied = copiedId === clip.id;
          const isDeleting = deletingId === clip.id;

          return (
            <div
              key={clip.id}
              className="group grid gap-2 rounded-xl p-4 transition hover:bg-white/5 md:grid-cols-[1fr_auto] light:hover:bg-zinc-50"
            >
              <Link
                href={`/recordings/${encodeURIComponent(clip.recordingId)}?clip=${clip.id}`}
                className="min-w-0"
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-zinc-50 light:text-zinc-900">
                    {clip.title || "Untitled Clip"}
                  </span>
                  <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-medium text-amber-400">
                    {formatDuration(clip.endTime - clip.startTime)}
                  </span>
                </div>
                <div className="mt-0.5 line-clamp-1 text-xs text-zinc-400 light:text-zinc-500">
                  From: {clip.recordingTitle}
                </div>
              </Link>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <LocalDateTime iso={clip.createdAt} />
                <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => handleCopyLink(clip)}
                    className="rounded p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200 light:hover:bg-zinc-200 light:hover:text-zinc-700"
                    title="Copy share link"
                  >
                    {isCopied ? (
                      <svg className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(clip.id)}
                    disabled={isDeleting}
                    className="rounded p-1.5 text-zinc-400 transition hover:bg-red-500/20 hover:text-red-400 disabled:opacity-50"
                    title="Delete clip"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
