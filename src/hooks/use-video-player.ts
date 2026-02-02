"use client";

import { useState, useCallback, useEffect, type RefObject } from "react";
import type { PlaybackState } from "@/types/video";

const initialState: PlaybackState = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  isMuted: false,
  playbackRate: 1,
  isFullscreen: false,
};

// Accepts both video and audio elements since they share the HTMLMediaElement interface
export function useVideoPlayer(mediaRef: RefObject<HTMLMediaElement | null>) {
  const [state, setState] = useState<PlaybackState>(initialState);

  const play = useCallback(() => {
    mediaRef.current?.play();
  }, [mediaRef]);

  const pause = useCallback(() => {
    mediaRef.current?.pause();
  }, [mediaRef]);

  const togglePlay = useCallback(() => {
    if (state.isPlaying) {
      pause();
    } else {
      play();
    }
  }, [state.isPlaying, play, pause]);

  const seek = useCallback(
    (time: number) => {
      if (mediaRef.current) {
        const duration = mediaRef.current.duration || 0;
        mediaRef.current.currentTime = Math.max(0, Math.min(time, duration));
      }
    },
    [mediaRef]
  );

  const seekRelative = useCallback(
    (delta: number) => {
      seek(state.currentTime + delta);
    },
    [seek, state.currentTime]
  );

  const setVolume = useCallback(
    (volume: number) => {
      if (mediaRef.current) {
        const clampedVolume = Math.max(0, Math.min(1, volume));
        mediaRef.current.volume = clampedVolume;
        setState((prev) => ({ ...prev, volume: clampedVolume }));
      }
    },
    [mediaRef]
  );

  const toggleMute = useCallback(() => {
    if (mediaRef.current) {
      mediaRef.current.muted = !mediaRef.current.muted;
      setState((prev) => ({ ...prev, isMuted: !prev.isMuted }));
    }
  }, [mediaRef]);

  const setPlaybackRate = useCallback(
    (rate: number) => {
      if (mediaRef.current) {
        mediaRef.current.playbackRate = rate;
        setState((prev) => ({ ...prev, playbackRate: rate }));
      }
    },
    [mediaRef]
  );

  const toggleFullscreen = useCallback(() => {
    const container = mediaRef.current?.parentElement;
    if (!container) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  }, [mediaRef]);

  useEffect(() => {
    const video = mediaRef.current;
    if (!video) return;

    const handlePlay = () => setState((prev) => ({ ...prev, isPlaying: true }));
    const handlePause = () =>
      setState((prev) => ({ ...prev, isPlaying: false }));
    const handleEnded = () =>
      setState((prev) => ({ ...prev, isPlaying: false }));

    const handleTimeUpdate = () => {
      setState((prev) => ({
        ...prev,
        currentTime: video.currentTime,
      }));
    };

    const handleDurationChange = () => {
      setState((prev) => ({
        ...prev,
        duration: video.duration || 0,
      }));
    };

    const handleVolumeChange = () => {
      setState((prev) => ({
        ...prev,
        volume: video.volume,
        isMuted: video.muted,
      }));
    };

    const handleFullscreenChange = () => {
      setState((prev) => ({
        ...prev,
        isFullscreen: !!document.fullscreenElement,
      }));
    };

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("volumechange", handleVolumeChange);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("volumechange", handleVolumeChange);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [mediaRef]);

  return {
    state,
    play,
    pause,
    togglePlay,
    seek,
    seekRelative,
    setVolume,
    toggleMute,
    setPlaybackRate,
    toggleFullscreen,
  };
}
