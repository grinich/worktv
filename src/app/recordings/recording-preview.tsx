interface RecordingPreviewProps {
  posterUrl?: string | null;
  previewGifUrl?: string | null;
  title: string;
  duration: number;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}:${remainingMins.toString().padStart(2, "0")}:00`;
  }
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function RecordingPreview({
  posterUrl,
  previewGifUrl,
  title,
  duration,
}: RecordingPreviewProps) {
  return (
    <div className="relative aspect-video w-48 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-800 light:bg-zinc-200">
      {/* Poster image - visible by default, hidden on group hover if GIF exists */}
      {posterUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={posterUrl}
          alt={title}
          className={`absolute inset-0 h-full w-full object-cover ${
            previewGifUrl ? "group-hover:opacity-0" : ""
          }`}
        />
      )}
      {/* GIF - hidden by default, visible on group hover */}
      {previewGifUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={previewGifUrl}
          alt={title}
          className="absolute inset-0 h-full w-full object-cover opacity-0 group-hover:opacity-100"
        />
      )}
      {/* Placeholder when no images */}
      {!posterUrl && !previewGifUrl && (
        <div className="flex h-full w-full items-center justify-center">
          <svg
            className="h-8 w-8 text-zinc-600 light:text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </div>
      )}
      {/* Duration badge */}
      <div className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[10px] font-medium text-white">
        {formatDuration(duration)}
      </div>
      {/* Play indicator when GIF is available - hidden on hover */}
      {previewGifUrl && (
        <div className="absolute left-1 top-1 rounded bg-black/60 p-0.5 group-hover:opacity-0">
          <svg
            className="h-3 w-3 text-white"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
