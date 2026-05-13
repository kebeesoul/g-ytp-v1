"use client";

import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { getPublicUrl } from "@/lib/supabase/storage";

interface AudioPlayerProps {
  storagePath: string | null;
  trackId: string | null;
}

export function AudioPlayer({ storagePath, trackId }: AudioPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!containerRef.current || !storagePath) return;

    wavesurferRef.current?.destroy();
    setReady(false);
    setPlaying(false);
    setCurrentTime(0);

    const url = getPublicUrl(storagePath);

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#4B5563",
      progressColor: "#3B82F6",
      height: 48,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      url,
    });

    ws.on("ready", () => {
      setDuration(ws.getDuration());
      setReady(true);
    });

    ws.on("timeupdate", (t) => setCurrentTime(t));
    ws.on("finish", () => setPlaying(false));

    wavesurferRef.current = ws;

    return () => {
      ws.destroy();
    };
  }, [storagePath, trackId]);

  function togglePlay() {
    const ws = wavesurferRef.current;
    if (!ws || !ready) return;
    ws.playPause();
    setPlaying((p) => !p);
  }

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  if (!storagePath) return null;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-gray-700 bg-gray-900 p-3">
      <div ref={containerRef} className="w-full" />
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          disabled={!ready}
          className="rounded-full bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-40 hover:bg-blue-500"
        >
          {playing ? "⏸" : "▶"}
        </button>
        <span className="text-xs text-gray-400">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
