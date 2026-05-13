"use client";

import { useEffect, useState } from "react";
import { TracklistSchema, type ProjectSnapshot, type Tracklist } from "@/lib/schema";
import { formatTracklistText } from "@/lib/tracklist";

interface TracklistExportProps {
  snapshot: ProjectSnapshot;
}

export function TracklistExport({ snapshot }: TracklistExportProps) {
  const [tracklist, setTracklist] = useState<Tracklist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setTracklist(null);

    (async () => {
      try {
        const res = await fetch("/api/description", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshot }),
        });
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error ?? `description failed: ${res.status}`);
        }
        const raw: unknown = await res.json();
        const parsed = TracklistSchema.parse(raw);
        if (!cancelled) setTracklist(parsed);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "tracklist 생성 실패");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [snapshot]);

  async function handleCopy(): Promise<void> {
    if (!tracklist) return;
    const text = formatTracklistText(tracklist);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("클립보드 복사 실패");
    }
  }

  if (error) {
    return <p className="text-xs text-red-400">{error}</p>;
  }

  if (!tracklist) {
    return <p className="text-xs text-gray-500">tracklist 생성 중...</p>;
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-gray-700 bg-gray-900 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-300">Tracklist</span>
        <button
          onClick={handleCopy}
          className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-200 hover:bg-gray-600"
        >
          {copied ? "✓ 복사됨" : "📋 복사"}
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto font-mono text-xs text-gray-300">
        {tracklist.lines.map((line, i) => (
          <div key={i} className="flex gap-2">
            <span className="shrink-0 text-gray-500">{line.timecode}</span>
            <span className="truncate">
              {line.artist} - {line.title}
            </span>
          </div>
        ))}
        {tracklist.hashtags.length > 0 && (
          <div className="mt-2 text-gray-400">
            {tracklist.hashtags.join(" ")}
          </div>
        )}
      </div>
    </div>
  );
}
