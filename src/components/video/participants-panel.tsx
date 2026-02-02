"use client";

import { useState } from "react";
import Link from "next/link";
import type { ParticipantRow } from "@/lib/db";

interface ParticipantsPanelProps {
  participants: ParticipantRow[];
}

function formatDuration(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    return `${hours}h ${remainingMins}m`;
  }
  return `${minutes}m`;
}

export function ParticipantsPanel({ participants }: ParticipantsPanelProps) {
  const [copied, setCopied] = useState(false);

  const emails = participants
    .map((p) => p.email)
    .filter((email): email is string => !!email);

  const handleCopyEmails = async () => {
    if (emails.length === 0) return;
    await navigator.clipboard.writeText(emails.join(", "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex h-[450px] flex-col">
      {/* Header with copy button */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-zinc-400 light:text-zinc-500">
          {participants.length} participant{participants.length !== 1 ? "s" : ""}
        </span>
        {emails.length > 0 && (
          <button
            onClick={handleCopyEmails}
            className="flex items-center gap-1.5 rounded-md bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 transition hover:bg-zinc-700 hover:text-zinc-100 light:bg-zinc-100 light:text-zinc-600 light:hover:bg-zinc-200 light:hover:text-zinc-900"
          >
            {copied ? (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy all emails
              </>
            )}
          </button>
        )}
      </div>

      {/* Participant list */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {participants.map((participant) => (
          <div
            key={participant.id}
            className="rounded-lg border border-white/5 bg-zinc-800/50 p-3 light:border-zinc-200 light:bg-zinc-50"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-zinc-200 light:text-zinc-900">
                  {participant.name}
                </div>
                {participant.email && (
                  <Link
                    href={`/recordings?participant=${encodeURIComponent(participant.email)}`}
                    className="text-sm text-zinc-400 hover:text-indigo-400 light:text-zinc-500 light:hover:text-indigo-600"
                  >
                    {participant.email}
                  </Link>
                )}
              </div>
              {participant.duration && (
                <span className="shrink-0 text-xs text-zinc-500">
                  {formatDuration(participant.duration)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
