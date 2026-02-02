"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

type Source = "all" | "zoom" | "gong";

interface SourceFilterProps {
  currentSource: Source;
}

const sources: { value: Source; label: string }[] = [
  { value: "all", label: "All" },
  { value: "zoom", label: "Zoom" },
  { value: "gong", label: "Gong" },
];

export function SourceFilter({ currentSource }: SourceFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSourceChange = useCallback(
    (source: Source) => {
      const params = new URLSearchParams(searchParams.toString());

      if (source === "all") {
        params.delete("source");
      } else {
        params.set("source", source);
      }

      const queryString = params.toString();
      router.push(`/${queryString ? `?${queryString}` : ""}`);
    },
    [router, searchParams]
  );

  return (
    <div className="flex gap-1 rounded-lg bg-zinc-800/50 p-1 light:bg-zinc-100">
      {sources.map((source) => (
        <button
          key={source.value}
          onClick={() => handleSourceChange(source.value)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            currentSource === source.value
              ? "bg-indigo-500 text-white"
              : "text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200 light:text-zinc-600 light:hover:bg-zinc-200 light:hover:text-zinc-900"
          }`}
        >
          {source.label}
        </button>
      ))}
    </div>
  );
}
