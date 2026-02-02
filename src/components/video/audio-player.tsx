"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";

interface AudioPlayerProps {
  src: string;
  onClick?: () => void;
}

export const AudioPlayer = forwardRef<HTMLAudioElement, AudioPlayerProps>(
  function AudioPlayer({ src, onClick }, ref) {
    const audioRef = useRef<HTMLAudioElement>(null);

    useImperativeHandle(
      ref,
      () => {
        if (!audioRef.current) {
          throw new Error("AudioPlayer ref accessed before audio element mounted");
        }
        return audioRef.current;
      },
      []
    );

    return (
      <div
        className="flex h-full w-full cursor-pointer items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900"
        onClick={onClick}
      >
        <div className="flex flex-col items-center gap-4">
          {/* Audio visualization icon */}
          <div className="flex items-end gap-1">
            {[40, 60, 80, 60, 40, 70, 50, 65, 45].map((height, i) => (
              <div
                key={i}
                className="w-2 rounded-full bg-indigo-500/60"
                style={{ height: `${height}px` }}
              />
            ))}
          </div>
          <div className="text-sm text-zinc-400">Audio Recording</div>
        </div>
        <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      </div>
    );
  }
);
