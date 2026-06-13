"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { z } from "zod";
import { TrackSchema, type Track } from "@/lib/schema";
import { YtmpTrackSchema, type YtmpTrack } from "@/lib/ytmp3/schema";

const TracksResponseSchema = z.array(YtmpTrackSchema);
const ToEditorResponseSchema = z.array(TrackSchema);
const EDITOR_DRAFT_KEY = "gytp:editor-draft";

const EditorDraftSchema = z.object({
  editorSessionId: z.string().uuid(),
  title: z.string().default(""),
  tracks: z.array(TrackSchema).default([]),
  background: z.unknown().nullable().default(null),
  transitionType: z.enum(["silence", "crossfade"]).default("silence"),
  overlayMode: z.enum(["0", "2", "5", "full"]).default("0"),
  waveformStyle: z.enum(["off", "wave1", "wave2", "wave3", "wave4"]).default("off"),
  playlistRepeatCount: z.number().int().min(1).max(5).default(1),
  overlayPresetId: z.string().default("default"),
  hashtags: z.array(z.string()).default([]),
  mastering: z.boolean().default(false),
});

type EditorDraft = z.infer<typeof EditorDraftSchema>;

interface ExtractedTrackListProps {
  refreshKey: number;
}

function formatDuration(sec: number | null): string {
  if (!sec || sec <= 0) return "--:--";
  const minutes = Math.floor(sec / 60);
  const seconds = Math.floor(sec % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function readEditorDraft(): EditorDraft {
  const fallback = {
    editorSessionId: crypto.randomUUID(),
    title: "",
    tracks: [],
  };
  try {
    const raw = window.localStorage.getItem(EDITOR_DRAFT_KEY);
    if (!raw) return EditorDraftSchema.parse(fallback);
    return EditorDraftSchema.parse(JSON.parse(raw));
  } catch {
    return EditorDraftSchema.parse(fallback);
  }
}

function withSequentialOrder(tracks: Track[]): Track[] {
  return tracks.map((track, index) => ({ ...track, order: index }));
}

export function ExtractedTrackList({ refreshKey }: ExtractedTrackListProps) {
  const [tracks, setTracks] = useState<YtmpTrack[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  async function loadTracks(): Promise<void> {
    const res = await fetch("/api/ytmp3/tracks", { cache: "no-store" });
    const raw: unknown = await res.json();
    if (!res.ok) return;
    setTracks(TracksResponseSchema.parse(raw));
  }

  useEffect(() => {
    queueMicrotask(() => void loadTracks());
  }, [refreshKey]);

  async function addSelectedToEditor(): Promise<void> {
    if (selectedIds.size === 0) return;
    setAdding(true);
    setError(null);
    try {
      const draft = readEditorDraft();
      const res = await fetch("/api/ytmp3/to-editor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackIds: Array.from(selectedIds), editorSessionId: draft.editorSessionId }),
      });
      const raw: unknown = await res.json();
      if (!res.ok) {
        const body = z.object({ error: z.string().optional() }).safeParse(raw);
        throw new Error(body.success ? body.data.error ?? `to editor failed: ${res.status}` : `to editor failed: ${res.status}`);
      }
      const newTracks = ToEditorResponseSchema.parse(raw);
      const merged = withSequentialOrder([...draft.tracks, ...newTracks]);
      window.localStorage.setItem(EDITOR_DRAFT_KEY, JSON.stringify({ ...draft, tracks: merged }));
      setSelectedIds(new Set());
      setAdded(true);
      await loadTracks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Editor 추가 실패");
    } finally {
      setAdding(false);
    }
  }

  function toggleSelectAll(): void {
    setSelectedIds((prev) => {
      if (prev.size === tracks.length) return new Set();
      return new Set(tracks.map((track) => track.id));
    });
  }

  return (
    <section className="vm-panel vm-panel-pad flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="vm-label">Extracted Tracks</span>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSelectAll}
            disabled={tracks.length === 0}
            className="vm-button-secondary disabled:opacity-40"
          >
            {selectedIds.size === tracks.length && tracks.length > 0 ? "전체 해제" : "전체 선택"}
          </button>
          <button
            onClick={() => void addSelectedToEditor()}
            disabled={adding || selectedIds.size === 0}
            className="vm-button-secondary disabled:opacity-40"
          >
            {adding ? "추가 중..." : "선택 트랙 Editor에 추가"}
          </button>
        </div>
      </div>

      <div className="flex flex-col divide-y divide-[var(--vm-border)]">
        {tracks.length === 0 ? (
          <p className="py-4 text-sm text-[var(--vm-subtle)]">추출 완료 트랙 없음</p>
        ) : tracks.map((track) => (
          <div key={track.id} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 py-3 text-sm">
            <input
              type="checkbox"
              checked={selectedIds.has(track.id)}
              onChange={(e) => {
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(track.id);
                  else next.delete(track.id);
                  return next;
                });
              }}
            />
            <div className="min-w-0">
              <p className="truncate text-white">{track.artist ? `${track.artist} - ${track.title}` : track.title}</p>
              <p className="text-[11px] text-[var(--vm-subtle)]">{formatDuration(track.duration_sec)}</p>
            </div>
            <button
              onClick={() => setPreviewPath(track.local_path)}
              className="vm-button-secondary"
            >
              ▶ 미리듣기
            </button>
            <span className="text-[11px] text-[var(--vm-subtle)]">
              {track.added_to_editor ? "added" : ""}
            </span>
          </div>
        ))}
      </div>

      {previewPath && (
        <audio controls src={`/api/workspace-file/${previewPath}`} className="w-full" />
      )}
      {added && (
        <Link href="/editor" className="text-sm text-[var(--vm-cyan)] underline">
          Editor로 이동
        </Link>
      )}
      {error && <p className="text-xs text-[var(--vm-error)]">{error}</p>}
    </section>
  );
}
