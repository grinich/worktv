import Link from "next/link";
import { Suspense } from "react";
import {
  searchRecordings,
  searchRecordingsWithSpeaker,
  getSpeakersByRecordingIds,
  getRecordingsBySource,
} from "@/lib/db";
import { isZoomConfigured } from "@/lib/zoom/auth";
import { isGongConfigured } from "@/lib/gong/auth";
import { SearchInput } from "./search-input";
import { ViewToggle } from "./view-toggle";
import { CalendarView } from "./calendar-view";
import { SourceFilter } from "./source-filter";
import { LocalDateTime } from "@/components/local-datetime";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  }
  return `${mins}m`;
}

export default async function RecordingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; speaker?: string; source?: string }>;
}) {
  const { q, view, speaker, source } = await searchParams;

  // Parse source filter
  const sourceFilter = (source === "zoom" || source === "gong") ? source : "all";

  // Determine which query to run based on filters
  let recordings;
  if (speaker) {
    recordings = searchRecordingsWithSpeaker(q ?? "", speaker, sourceFilter);
  } else if (q) {
    recordings = searchRecordings(q, sourceFilter);
  } else {
    recordings = getRecordingsBySource(sourceFilter);
  }

  const isCalendarView = view === "calendar";

  // Check which integrations are configured
  const zoomConfigured = isZoomConfigured();
  const gongConfigured = isGongConfigured();
  const missingCredentials: string[] = [];
  if (!zoomConfigured) missingCredentials.push("Zoom");
  if (!gongConfigured) missingCredentials.push("Gong");

  // Prepare recordings data for client components
  const speakersByRecording = getSpeakersByRecordingIds(
    recordings.map((r) => r.id)
  );

  const recordingsWithMeta = recordings.map((recording) => {
    const speakers = speakersByRecording[recording.id] ?? [];
    return {
      ...recording,
      speakers,
      hasTranscript: speakers.length > 0,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={<div className="h-10 animate-pulse rounded-xl bg-zinc-800 light:bg-zinc-200" />}>
        <div className="flex flex-wrap items-center gap-3">
          <ViewToggle currentView={isCalendarView ? "calendar" : "list"} />
          <SourceFilter currentSource={sourceFilter} />
          <SearchInput defaultValue={q} defaultSpeaker={speaker} />
        </div>
      </Suspense>

      {missingCredentials.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 light:border-amber-300 light:bg-amber-50 light:text-amber-800">
          <span className="font-medium">{missingCredentials.join(" and ")} credentials not configured.</span>{" "}
          <span className="text-amber-300 light:text-amber-600">
            Add credentials to <code className="rounded bg-amber-500/20 px-1 py-0.5 text-xs light:bg-amber-200">.env.local</code> and run{" "}
            <code className="rounded bg-amber-500/20 px-1 py-0.5 text-xs light:bg-amber-200">npm run sync</code> to import recordings.
          </span>
        </div>
      )}

      {(q || speaker) && (
        <div className="flex items-center gap-2 text-sm text-zinc-400 light:text-zinc-600">
          <span>
            {recordings.length} result{recordings.length !== 1 ? "s" : ""}
            {speaker && (
              <>
                {" "}with <span className="font-medium text-indigo-400 light:text-indigo-600">@{speaker}</span>
              </>
            )}
            {q && (
              <>
                {" "}for "{q}"
              </>
            )}
          </span>
          <Link
            href="/recordings"
            className="text-indigo-400 hover:text-indigo-300 light:text-indigo-600 light:hover:text-indigo-500"
          >
            Clear
          </Link>
        </div>
      )}

      {recordings.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-zinc-900/50 p-8 text-center text-sm text-zinc-400 light:border-zinc-200 light:bg-white light:text-zinc-600">
          <p>No recordings found.</p>
          <p className="mt-2 text-xs text-zinc-500">
            Run{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5 light:bg-zinc-100">
              npm run sync
            </code>{" "}
            to pull recordings from Zoom.
          </p>
        </div>
      ) : isCalendarView ? (
        <CalendarView recordings={recordingsWithMeta} />
      ) : (
        <section className="rounded-2xl border border-white/10 bg-zinc-900/50 p-2 light:border-zinc-200 light:bg-white">
          <div className="divide-y divide-white/10 light:divide-zinc-200">
            {recordingsWithMeta.map((recording) => (
              <Link
                key={recording.id}
                href={`/recordings/${encodeURIComponent(recording.id)}`}
                className="group grid gap-2 rounded-xl p-4 transition hover:bg-white/5 md:grid-cols-[1fr_auto] light:hover:bg-zinc-50"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-zinc-50 light:text-zinc-900">
                      {recording.title}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        recording.source === "gong"
                          ? "bg-violet-500/20 text-violet-400 light:bg-violet-100 light:text-violet-600"
                          : "bg-blue-500/20 text-blue-400 light:bg-blue-100 light:text-blue-600"
                      }`}
                    >
                      {recording.source === "gong" ? "Gong" : "Zoom"}
                    </span>
                  </div>
                  {recording.description && (
                    <div className="mt-0.5 line-clamp-1 text-xs text-zinc-400 light:text-zinc-500">
                      {recording.description}
                    </div>
                  )}
                  <div className="mt-1 text-xs text-zinc-500">
                    {formatDuration(recording.duration)}
                    {recording.speakers.length > 0 && (
                      <span>
                        {" · "}
                        {recording.speakers.map((s) => s.name).join(", ")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center text-xs text-zinc-500">
                  <LocalDateTime iso={recording.created_at} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
