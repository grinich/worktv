"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { formatTime, type TranscriptSegment } from "@/types/video";

interface ClipCreatorProps {
  recordingId: string;
  videoUrl: string;
  duration: number;
  currentTime: number;
  transcript: TranscriptSegment[];
  onClose: () => void;
  onClipCreated: (clip: { id: string; startTime: number; endTime: number; title: string | null }) => void;
}

export function ClipCreator({
  recordingId,
  videoUrl,
  duration,
  currentTime,
  transcript,
  onClose,
  onClipCreated,
}: ClipCreatorProps) {
  const previewRef = useRef<HTMLVideoElement>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);

  const [startTime, setStartTime] = useState(Math.max(0, currentTime - 15));
  const [endTime, setEndTime] = useState(Math.min(duration, currentTime + 15));
  const [title, setTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewTime, setPreviewTime] = useState(startTime);
  const [isPlaying, setIsPlaying] = useState(false);
  const [settingPoint, setSettingPoint] = useState<"in" | "out" | null>(null);

  const clipDuration = endTime - startTime;

  // Get transcript segments that are visible around the clip range
  const visibleSegments = transcript.filter(
    (seg) => seg.endTime >= startTime - 60 && seg.startTime <= endTime + 60
  );

  // Loop preview within clip bounds
  useEffect(() => {
    const video = previewRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setPreviewTime(video.currentTime);
      if (video.currentTime >= endTime) {
        video.currentTime = startTime;
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
    };
  }, [startTime, endTime]);

  // Seek preview to start when range changes
  useEffect(() => {
    const video = previewRef.current;
    if (video && !isPlaying) {
      video.currentTime = startTime;
      setPreviewTime(startTime);
    }
  }, [startTime, isPlaying]);

  // Scroll transcript to keep current segment in view
  useEffect(() => {
    const container = transcriptContainerRef.current;
    if (!container) return;

    const activeSegment = container.querySelector('[data-active="true"]');
    if (activeSegment) {
      activeSegment.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [startTime]);

  const handleSegmentClick = (segment: TranscriptSegment, position: "start" | "end") => {
    if (settingPoint === "in" || position === "start") {
      setStartTime(Math.min(segment.startTime, endTime - 1));
      setSettingPoint(null);
    } else if (settingPoint === "out" || position === "end") {
      setEndTime(Math.max(segment.endTime, startTime + 1));
      setSettingPoint(null);
    }
  };

  const togglePlayPause = useCallback(() => {
    const video = previewRef.current;
    if (!video) return;

    if (video.paused) {
      video.currentTime = startTime;
      video.play();
    } else {
      video.pause();
    }
  }, [startTime]);

  const handleCreate = async () => {
    if (clipDuration <= 0) {
      setError("End time must be after start time");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch(`/api/recordings/${encodeURIComponent(recordingId)}/clips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime,
          endTime,
          title: title.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create clip");
      }

      const clip = await response.json();
      onClipCreated(clip);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create clip");
    } finally {
      setIsCreating(false);
    }
  };

  const startPercent = (startTime / duration) * 100;
  const endPercent = (endTime / duration) * 100;
  const previewPercent = (previewTime / duration) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl light:border-zinc-200 light:bg-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 light:border-zinc-200">
          <h2 className="text-lg font-semibold">Create Clip</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200 light:hover:bg-zinc-100 light:hover:text-zinc-700"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex max-h-[calc(90vh-180px)] flex-col gap-4 overflow-y-auto p-6 lg:flex-row">
          {/* Left: Video Preview */}
          <div className="flex-1">
            <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
              <video
                ref={previewRef}
                src={videoUrl}
                className="h-full w-full object-contain"
                playsInline
                muted
              />
              {/* Play/Pause overlay */}
              <button
                onClick={togglePlayPause}
                className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition hover:opacity-100"
              >
                {isPlaying ? (
                  <svg className="h-16 w-16 text-white/80" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                ) : (
                  <svg className="h-16 w-16 text-white/80" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Range selector */}
            <div className="mt-4">
              <div className="relative h-3 cursor-pointer rounded-full bg-zinc-700 light:bg-zinc-200">
                {/* Selected range */}
                <div
                  className="absolute inset-y-0 rounded-full bg-amber-500/60"
                  style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }}
                />
                {/* Preview position */}
                <div
                  className="absolute top-1/2 h-4 w-1 -translate-y-1/2 bg-white"
                  style={{ left: `${previewPercent}%` }}
                />
                {/* Start handle */}
                <div
                  className="absolute top-1/2 h-5 w-3 -translate-y-1/2 cursor-ew-resize rounded bg-amber-500 shadow-lg"
                  style={{ left: `calc(${startPercent}% - 6px)` }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const bar = e.currentTarget.parentElement!;
                    const rect = bar.getBoundingClientRect();
                    const handleMove = (moveE: MouseEvent) => {
                      const percent = Math.max(0, Math.min(1, (moveE.clientX - rect.left) / rect.width));
                      const newTime = percent * duration;
                      setStartTime(Math.min(newTime, endTime - 1));
                    };
                    const handleUp = () => {
                      document.removeEventListener("mousemove", handleMove);
                      document.removeEventListener("mouseup", handleUp);
                    };
                    document.addEventListener("mousemove", handleMove);
                    document.addEventListener("mouseup", handleUp);
                  }}
                />
                {/* End handle */}
                <div
                  className="absolute top-1/2 h-5 w-3 -translate-y-1/2 cursor-ew-resize rounded bg-amber-500 shadow-lg"
                  style={{ left: `calc(${endPercent}% - 6px)` }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const bar = e.currentTarget.parentElement!;
                    const rect = bar.getBoundingClientRect();
                    const handleMove = (moveE: MouseEvent) => {
                      const percent = Math.max(0, Math.min(1, (moveE.clientX - rect.left) / rect.width));
                      const newTime = percent * duration;
                      setEndTime(Math.max(newTime, startTime + 1));
                    };
                    const handleUp = () => {
                      document.removeEventListener("mousemove", handleMove);
                      document.removeEventListener("mouseup", handleUp);
                    };
                    document.addEventListener("mousemove", handleMove);
                    document.addEventListener("mouseup", handleUp);
                  }}
                />
              </div>

              {/* Time display */}
              <div className="mt-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSettingPoint(settingPoint === "in" ? null : "in")}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      settingPoint === "in"
                        ? "bg-amber-500 text-black"
                        : "bg-zinc-700 hover:bg-zinc-600 light:bg-zinc-200 light:hover:bg-zinc-300"
                    }`}
                  >
                    <span>In:</span>
                    <span className="font-mono">{formatTime(startTime)}</span>
                  </button>
                  <button
                    onClick={() => setSettingPoint(settingPoint === "out" ? null : "out")}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      settingPoint === "out"
                        ? "bg-amber-500 text-black"
                        : "bg-zinc-700 hover:bg-zinc-600 light:bg-zinc-200 light:hover:bg-zinc-300"
                    }`}
                  >
                    <span>Out:</span>
                    <span className="font-mono">{formatTime(endTime)}</span>
                  </button>
                </div>
                <span className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-400">
                  {formatTime(clipDuration)}
                </span>
              </div>
              {settingPoint && (
                <p className="mt-2 text-xs text-amber-400">
                  Click a transcript segment to set the {settingPoint === "in" ? "start" : "end"} point
                </p>
              )}
            </div>
          </div>

          {/* Right: Transcript */}
          <div className="w-full lg:w-80">
            <div className="mb-2 text-sm font-medium text-zinc-400">
              Click transcript to set in/out points
            </div>
            <div
              ref={transcriptContainerRef}
              className="h-64 overflow-y-auto rounded-xl border border-white/10 bg-zinc-800/50 p-3 lg:h-[360px] light:border-zinc-200 light:bg-zinc-50"
            >
              {visibleSegments.length === 0 ? (
                <p className="text-center text-sm text-zinc-500">No transcript available</p>
              ) : (
                <div className="space-y-2">
                  {visibleSegments.map((segment) => {
                    const isInClip = segment.startTime >= startTime && segment.endTime <= endTime;
                    const isPartialStart = segment.startTime < startTime && segment.endTime > startTime;
                    const isPartialEnd = segment.startTime < endTime && segment.endTime > endTime;
                    const isActive = previewTime >= segment.startTime && previewTime < segment.endTime;

                    return (
                      <div
                        key={segment.id}
                        data-active={segment.startTime <= startTime && segment.endTime >= startTime}
                        className={`group cursor-pointer rounded-lg p-2 transition ${
                          isActive
                            ? "bg-amber-500/20 ring-1 ring-amber-500/50"
                            : isInClip
                            ? "bg-amber-500/10"
                            : isPartialStart || isPartialEnd
                            ? "bg-amber-500/5"
                            : "hover:bg-white/5 light:hover:bg-zinc-100"
                        }`}
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-medium text-zinc-400">{segment.speaker}</span>
                          <span className="font-mono text-xs text-zinc-500">
                            {formatTime(segment.startTime)}
                          </span>
                        </div>
                        <p
                          className="text-sm leading-relaxed"
                          onClick={() => {
                            if (settingPoint) {
                              handleSegmentClick(segment, settingPoint === "in" ? "start" : "end");
                            }
                          }}
                        >
                          {segment.text.split(" ").map((word, i) => (
                            <span
                              key={i}
                              onClick={(e) => {
                                e.stopPropagation();
                                // Estimate word timing within segment
                                const wordCount = segment.text.split(" ").length;
                                const segmentDuration = segment.endTime - segment.startTime;
                                const wordTime = segment.startTime + (i / wordCount) * segmentDuration;

                                if (settingPoint === "in") {
                                  setStartTime(Math.min(wordTime, endTime - 1));
                                  setSettingPoint(null);
                                } else if (settingPoint === "out") {
                                  setEndTime(Math.max(wordTime, startTime + 1));
                                  setSettingPoint(null);
                                }
                              }}
                              className={`inline-block rounded px-0.5 transition ${
                                settingPoint
                                  ? "cursor-pointer hover:bg-amber-500/30"
                                  : ""
                              }`}
                            >
                              {word}{" "}
                            </span>
                          ))}
                        </p>
                        {/* Quick set buttons on hover */}
                        <div className="mt-1 flex gap-1 opacity-0 transition group-hover:opacity-100">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setStartTime(Math.min(segment.startTime, endTime - 1));
                            }}
                            className="rounded bg-zinc-700 px-2 py-0.5 text-xs hover:bg-zinc-600 light:bg-zinc-200 light:hover:bg-zinc-300"
                          >
                            Set In
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEndTime(Math.max(segment.endTime, startTime + 1));
                            }}
                            className="rounded bg-zinc-700 px-2 py-0.5 text-xs hover:bg-zinc-600 light:bg-zinc-200 light:hover:bg-zinc-300"
                          >
                            Set Out
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 px-6 py-4 light:border-zinc-200">
          <div className="mb-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Clip title (optional - auto-generated from transcript)"
              className="w-full rounded-lg border border-white/10 bg-zinc-800 px-4 py-2 text-sm placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none light:border-zinc-200 light:bg-zinc-50"
            />
          </div>

          {error && (
            <div className="mb-3 rounded-lg bg-red-500/20 px-4 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-lg px-5 py-2 text-sm font-medium text-zinc-400 transition hover:text-zinc-200 light:hover:text-zinc-700"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={isCreating || clipDuration <= 0}
              className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-medium text-black transition hover:bg-amber-400 disabled:opacity-50"
            >
              {isCreating ? "Creating..." : "Create Clip"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
