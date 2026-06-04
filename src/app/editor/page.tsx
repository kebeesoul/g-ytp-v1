"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  BackgroundSchema,
  OverlayPresetSchema,
  ProjectRecordSchema,
  ProjectSnapshotSchema,
  TrackSchema,
  type Background,
  type OverlayPreset,
  type ProjectSnapshot,
  type Track,
  type TransitionConfig,
} from "@/lib/schema";
import { TitleInput } from "@/components/editor/TitleInput";
import { TrackList } from "@/components/editor/TrackList";
import { AudioPlayer } from "@/components/editor/AudioPlayer";
import { BackgroundPicker } from "@/components/editor/BackgroundPicker";
import { OverlayPresetSlots } from "@/components/editor/OverlayPresetSlots";
import { RenderPanel } from "@/components/editor/RenderPanel";
import { TracklistExport } from "@/components/editor/TracklistExport";
import { FIXED_MASTERING_AUDIO_CONFIG } from "@/lib/mastering/constants";
import TitleRecommend from "@/components/editor/TitleRecommend";

interface EditorPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const DEFAULT_RENDER_CONFIG: ProjectSnapshot["renderConfig"] = {
  transition: { type: "silence", crossfadeSec: 2 },
  overlay: { displayMode: "0", presetId: "default", presetVersion: 1 },
  audio: FIXED_MASTERING_AUDIO_CONFIG,
  thumbnail: { mode: "extract", presetId: "default", presetVersion: 1 },
  waveform: { style: "off" },
  playlistRepeatCount: 1,
  mastering: false,
  audioBitrateKbps: 192,
  resolution: [1920, 1080],
  hwaccel: "videotoolbox",
};

const SELECTED_THUMBNAIL_KEY = "gytp:selected-thumbnail-background";
const EDITOR_DRAFT_KEY = "gytp:editor-draft";

type EditorDraft = {
  editorSessionId: string;
  title: string;
  tracks: Track[];
  background: Background | null;
  transitionType: "silence" | "crossfade";
  overlayMode: "0" | "2" | "5" | "full";
  waveformStyle: ProjectSnapshot["renderConfig"]["waveform"]["style"];
  playlistRepeatCount: number;
  overlayPresetId: string;
  hashtags: string[];
  mastering: boolean;
};

function readEditorDraft(): EditorDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(EDITOR_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as EditorDraft;
  } catch {
    return null;
  }
}

function compareFilename(a: { filename: string }, b: { filename: string }): number {
  return a.filename.localeCompare(b.filename, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function compareFileName(a: File, b: File): number {
  return a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function withSequentialOrder(tracks: Track[]): Track[] {
  return tracks.map((track, index) => ({ ...track, order: index }));
}

export default function EditorPage({ searchParams }: EditorPageProps) {
  const params = use(searchParams);
  const fromId = typeof params.from === "string" ? params.from : null;
  const selectedThumbnail = params.selectedThumbnail === "1";

  const [editorSessionId] = useState<string>(() => {
    if (typeof window === "undefined") return crypto.randomUUID();
    const draft = fromId ? null : readEditorDraft();
    return draft?.editorSessionId ?? crypto.randomUUID();
  });
  const [title, setTitle] = useState(() => {
    if (fromId || typeof window === "undefined") return "";
    return readEditorDraft()?.title ?? "";
  });
  const [tracks, setTracks] = useState<Track[]>(() => {
    if (fromId || typeof window === "undefined") return [];
    return readEditorDraft()?.tracks ?? [];
  });
  const [background, setBackground] = useState<Background | null>(() => {
    if (fromId || typeof window === "undefined") return null;
    if (selectedThumbnail) {
      const raw = window.localStorage.getItem(SELECTED_THUMBNAIL_KEY);
      if (raw) {
        try {
          const parsed = BackgroundSchema.safeParse(JSON.parse(raw));
          if (parsed.success) return parsed.data;
        } catch {}
      }
    }
    return readEditorDraft()?.background ?? null;
  });
  const [transitionType, setTransitionType] = useState<"silence" | "crossfade">(() => {
    if (fromId || typeof window === "undefined") return "silence";
    return readEditorDraft()?.transitionType ?? "silence";
  });
  const [crossfadeSec] = useState(2);
  const [overlayMode, setOverlayMode] = useState<"0" | "2" | "5" | "full">(() => {
    if (fromId || typeof window === "undefined") return "0";
    return readEditorDraft()?.overlayMode ?? "0";
  });
  const [waveformStyle, setWaveformStyle] = useState<ProjectSnapshot["renderConfig"]["waveform"]["style"]>(() => {
    if (fromId || typeof window === "undefined") return "off";
    return readEditorDraft()?.waveformStyle ?? "off";
  });
  const [playlistRepeatCount, setPlaylistRepeatCount] = useState(() => {
    if (fromId || typeof window === "undefined") return 1;
    return readEditorDraft()?.playlistRepeatCount ?? 1;
  });
  const [hashtags, setHashtags] = useState<string[]>(() => {
    if (fromId || typeof window === "undefined") return [];
    return readEditorDraft()?.hashtags ?? [];
  });
  // Separate input state — only synced to hashtags on blur to avoid per-keystroke snapshot updates.
  const [hashtagInput, setHashtagInput] = useState(() => {
    if (fromId || typeof window === "undefined") return "";
    const draft = readEditorDraft();
    return draft?.hashtags.join(", ") ?? "";
  });
  const [hashtagLoading, setHashtagLoading] = useState(false);
  const [hashtagError, setHashtagError] = useState<string | null>(null);
  const [mastering, setMastering] = useState(() => {
    if (fromId || typeof window === "undefined") return false;
    return readEditorDraft()?.mastering ?? false;
  });

  const [overlayPresetId, setOverlayPresetId] = useState(() => {
    if (fromId || typeof window === "undefined") return "default";
    return readEditorDraft()?.overlayPresetId ?? "default";
  });
  const [presets, setPresets] = useState<(OverlayPreset | null)[]>(Array(6).fill(null));

  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [activeStoragePath, setActiveStoragePath] = useState<string | null>(null);

  const [hydrateError, setHydrateError] = useState<string | null>(null);
  const [hydrateLoading, setHydrateLoading] = useState(!!fromId);
  const [ffmpegWarning, setFfmpegWarning] = useState<string | null>(null);
  const [presetLoadWarning, setPresetLoadWarning] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const hydratedRef = useRef(false);
  const router = useRouter();

  // Persist editor state to localStorage on every relevant change (skip when viewing a saved project)
  useEffect(() => {
    if (fromId || typeof window === "undefined") return;
    const draft: EditorDraft = {
      editorSessionId,
      title,
      tracks,
      background,
      transitionType,
      overlayMode,
      waveformStyle,
      playlistRepeatCount,
      overlayPresetId,
      hashtags,
      mastering,
    };
    window.localStorage.setItem(EDITOR_DRAFT_KEY, JSON.stringify(draft));
  }, [fromId, editorSessionId, title, tracks, background, transitionType, overlayMode, waveformStyle, playlistRepeatCount, overlayPresetId, hashtags, mastering]);

  useEffect(() => {
    fetch("/api/overlay-presets")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`서버 오류 (${r.status})`))))
      .then((data: unknown) => {
        const result = z.array(OverlayPresetSchema).safeParse(data);
        if (!result.success) {
          setPresetLoadWarning("오버레이 프리셋 데이터 형식 오류");
          return;
        }
        const slots: (OverlayPreset | null)[] = Array(6).fill(null);
        for (const preset of result.data) {
          const match = /^slot-(\d)$/.exec(preset.id);
          if (match) slots[parseInt(match[1], 10) - 1] = preset;
        }
        setPresets(slots);
        setOverlayPresetId((prev) => {
          if (prev !== "default") return prev;
          return result.data[0]?.id ?? prev;
        });
      })
      .catch((err: unknown) => {
        setPresetLoadWarning(err instanceof Error ? err.message : "오버레이 프리셋 로드 실패");
      });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/health");
        if (!res.ok) {
          const body = (await res.json()) as { ffmpegError?: string };
          setFfmpegWarning(body.ffmpegError ?? "FFmpeg를 찾을 수 없습니다. FFMPEG_PATH 환경변수를 확인하세요.");
        }
      } catch {
        // Ignore network failures during local development startup.
      }
    })();
  }, []);

  useEffect(() => {
    if (!fromId || hydratedRef.current) return;
    hydratedRef.current = true;

    (async () => {
      try {
        const res = await fetch(`/api/project/${fromId}`);
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error ?? `프로젝트 로드 실패: ${res.status}`);
        }
        const raw: unknown = await res.json();

        const record = ProjectRecordSchema.safeParse(raw);
        if (!record.success) {
          throw new Error("ProjectRecord 스키마 검증 실패");
        }

        const snap = ProjectSnapshotSchema.safeParse(record.data.snapshot);
        if (!snap.success) {
          throw new Error("ProjectSnapshot 스키마 검증 실패");
        }
        const snapshot = snap.data;

        setTitle(snapshot.title);
        setTracks([...snapshot.tracks].sort((a, b) => a.order - b.order));
        setBackground(snapshot.background);
        setTransitionType(snapshot.renderConfig.transition.type);
        setOverlayMode(snapshot.renderConfig.overlay.displayMode);
        setWaveformStyle(snapshot.renderConfig.waveform.style);
        setPlaylistRepeatCount(snapshot.renderConfig.playlistRepeatCount);
        setOverlayPresetId(snapshot.renderConfig.overlay.presetId);
        setHashtags(snapshot.hashtags);
        setHashtagInput(snapshot.hashtags.join(", "));
        setMastering(snapshot.renderConfig.mastering);
        setHydrateLoading(false);
      } catch (err) {
        setHydrateError(err instanceof Error ? err.message : "복원 실패");
        setHydrateLoading(false);
      }
    })();
  }, [fromId]);

  useEffect(() => {
    if (!fromId && selectedThumbnail) {
      window.localStorage.removeItem(SELECTED_THUMBNAIL_KEY);
    }
  }, [fromId, selectedThumbnail]);

  function buildSnapshot(): ProjectSnapshot | { error: string } {
    const transition: TransitionConfig = {
      type: transitionType,
      crossfadeSec,
    };
    const snapshotRaw = {
      title,
      tracks,
      background,
      renderConfig: {
        ...DEFAULT_RENDER_CONFIG,
        transition,
        overlay: {
          ...DEFAULT_RENDER_CONFIG.overlay,
          displayMode: overlayMode,
          presetId: overlayPresetId,
          presetVersion: presets.find((p) => p?.id === overlayPresetId)?.version ?? 1,
        },
        waveform: { style: waveformStyle },
        playlistRepeatCount,
        mastering,
      },
      hashtags,
    };
    const parsed = ProjectSnapshotSchema.safeParse(snapshotRaw);
    if (!parsed.success) {
      return { error: parsed.error.issues.map((i) => i.message).join(", ") };
    }
    return parsed.data;
  }

  async function handleFilesAdded(files: FileList | File[]): Promise<void> {
    const arr = Array.from(files).sort(compareFileName);
    if (arr.length === 0) return;

    const form = new FormData();
    form.append("editorSessionId", editorSessionId);
    for (const file of arr) {
      form.append("files", file);
    }

    const res = await fetch("/api/upload", { method: "POST", body: form });
    const raw: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const body = raw as { error?: string } | null;
      throw new Error(body?.error ?? `음원 업로드 실패: ${res.status}`);
    }

    const parsed = z.array(TrackSchema).safeParse(raw);
    if (!parsed.success) {
      throw new Error("서버 응답 형식 오류");
    }

    const sortedNewTracks = [...parsed.data].sort(compareFilename);
    setTracks((prev) =>
      withSequentialOrder([...prev, ...sortedNewTracks].sort(compareFilename))
    );
  }

  function handlePlay(id: string) {
    const track = tracks.find((t) => t.id === id);
    if (!track) return;
    setActiveTrackId(id);
    setActiveStoragePath(track.storagePath);
  }

  function handleEdit(id: string, artist: string, titleVal: string) {
    setTracks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, artist, title: titleVal } : t))
    );
  }

  function handleDelete(id: string) {
    setTracks((prev) => prev.filter((t) => t.id !== id).map((t, i) => ({ ...t, order: i })));
    if (activeTrackId === id) {
      setActiveTrackId(null);
      setActiveStoragePath(null);
    }
  }

  function handleClearAll() {
    setShowClearConfirm(false);
    window.localStorage.removeItem(EDITOR_DRAFT_KEY);
    window.localStorage.removeItem(SELECTED_THUMBNAIL_KEY);
    router.push("/editor");
  }

  function parseHashtagInput(value: string): string[] {
    return value
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
  }

  async function handleRecommendHashtags(): Promise<void> {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setHashtagError("Session Title을 먼저 입력하세요");
      return;
    }

    setHashtagLoading(true);
    setHashtagError(null);
    try {
      const res = await fetch("/api/hashtags-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedTitle }),
      });
      const body = (await res.json()) as { hashtags?: string[]; error?: string };
      if (!res.ok || !body.hashtags?.length) {
        throw new Error(body.error ?? `hashtag recommend failed: ${res.status}`);
      }

      const merged: string[] = [];
      for (const tag of body.hashtags) {
        if (!merged.includes(tag)) merged.push(tag);
      }
      setHashtags(merged);
      setHashtagInput(merged.join(", "));
    } catch (err) {
      setHashtagError(err instanceof Error ? err.message : "해시태그 추천 실패");
    } finally {
      setHashtagLoading(false);
    }
  }

  const snapshot = useMemo(
    () => buildSnapshot(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [title, tracks, background, transitionType, crossfadeSec, overlayMode, waveformStyle, playlistRepeatCount, overlayPresetId, presets, mastering, hashtags]
  );
  const snapshotValid = !("error" in snapshot);

  if (hydrateLoading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[var(--vm-bg)]">
        <p className="vm-label">Loading project...</p>
      </div>
    );
  }

  if (hydrateError) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[var(--vm-bg)]">
        <p className="text-sm text-[var(--vm-error)]">복원 실패: {hydrateError}</p>
      </div>
    );
  }

  return (
    <>
    <div className="vm-shell">
      <aside className="vm-rail flex h-[calc(100vh-58px)] flex-col gap-5 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1 [overflow-anchor:none]">
          <div className="flex flex-col">
            <TitleInput value={title} onChange={setTitle} />
            <TitleRecommend tracks={tracks} onSelect={setTitle} />
          </div>

          <div className="vm-panel vm-panel-pad flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
              <span className="vm-label">Hashtags</span>
              <button
                type="button"
                onClick={() => void handleRecommendHashtags()}
                disabled={hashtagLoading}
                className="text-[10px] font-normal leading-none tracking-normal text-[var(--vm-cyan)] transition-colors hover:text-white disabled:cursor-wait disabled:text-[var(--vm-muted)]"
              >
                {hashtagLoading ? "추천 중..." : "추천"}
              </button>
            </div>
            <input
              type="text"
              value={hashtagInput}
              onChange={(e) => setHashtagInput(e.target.value)}
              onBlur={(e) => {
                setHashtags(parseHashtagInput(e.target.value));
              }}
              placeholder="#lofi, #chill"
              className="vm-input"
            />
            {hashtagError && (
              <p className="text-[10px] text-[var(--vm-error)]">{hashtagError}</p>
            )}
          </div>

          <AudioPlayer storagePath={activeStoragePath} trackId={activeTrackId} />

          <TrackList
            tracks={tracks}
            activeTrackId={activeTrackId}
            onReorder={setTracks}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onPlay={handlePlay}
            onFilesAdded={handleFilesAdded}
            playlistRepeatCount={playlistRepeatCount}
          />

          {snapshotValid && (
            <TracklistExport snapshot={snapshot as ProjectSnapshot} />
          )}

          {/* Clear all — reset to fresh editor */}
          <button
            onClick={() => setShowClearConfirm(true)}
            className="w-full border border-[var(--vm-border)] bg-transparent px-3 py-2 text-xs uppercase tracking-[0.12em] text-[var(--vm-subtle)] hover:border-[var(--vm-error)] hover:text-[var(--vm-error)] transition-colors"
          >
            Clear
          </button>
        </div>
      </aside>

      <section className="vm-main">
        {ffmpegWarning && (
          <div className="vm-panel mb-4 px-4 py-3 text-xs text-[var(--vm-amber)]">
            FFmpeg: {ffmpegWarning}
          </div>
        )}
        {presetLoadWarning && (
          <div className="vm-panel mb-4 px-4 py-3 text-xs text-[var(--vm-amber)]">
            Overlay preset: {presetLoadWarning}
          </div>
        )}
        <div className="grid h-full min-h-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(520px,1fr)_380px]">
          <div className="flex min-h-0 flex-col gap-5 overflow-y-auto pr-1 [overflow-anchor:none]">
            <BackgroundPicker
              editorSessionId={editorSessionId}
              value={background}
              onChange={setBackground}
              overlayPreview={presets.find((p) => p?.id === overlayPresetId) ?? null}
              waveformStyle={waveformStyle}
            />

            <OverlayPresetSlots
              presets={presets}
              selectedId={overlayPresetId}
              onChange={setOverlayPresetId}
            />

            <div className="vm-panel vm-panel-pad flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="vm-label">Thumbnail</span>
                <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--vm-muted)]">
                  YouTube
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-[var(--vm-subtle)]">
                YouTube 업로드용 썸네일은 별도 1280x720 캔버스에서 제작합니다.
              </p>
              <Link href="/thumbnail" className="vm-button-secondary text-center">
                Open Thumbnail Maker
              </Link>
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-5 overflow-y-auto [overflow-anchor:none]">
            <div className="vm-panel vm-panel-pad flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="vm-label">Render Settings</span>
                <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--vm-cyan)]">Transparent</span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="vm-label">Transition</span>
                <div className="flex flex-wrap gap-2">
                  {(["silence", "crossfade"] as const).map((t) => (
                    <label key={t} className="flex items-center gap-2 border border-[var(--vm-border)] bg-[#0b0b0b] px-3 py-2 text-xs text-[var(--vm-text)]">
                      <input
                        type="radio"
                        name="transition"
                        value={t}
                        checked={transitionType === t}
                        onChange={() => setTransitionType(t)}
                        className="accent-[var(--vm-cyan)]"
                      />
                      {t === "silence" ? "silence" : `crossfade ${crossfadeSec}s`}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="vm-label">Overlay Window</span>
                <div className="flex flex-wrap gap-2">
                  {(["0", "2", "5", "full"] as const).map((m) => (
                    <label key={m} className="flex items-center gap-2 border border-[var(--vm-border)] bg-[#0b0b0b] px-3 py-2 text-xs text-[var(--vm-text)]">
                      <input
                        type="radio"
                        name="overlayMode"
                        value={m}
                        checked={overlayMode === m}
                        onChange={() => setOverlayMode(m)}
                        className="accent-[var(--vm-cyan)]"
                      />
                      {m === "0" ? "없음" : m === "full" ? "Full" : `${m}s`}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="vm-label">Waveform</span>
                <div className="flex flex-wrap gap-2">
                  {([
                    ["wave1", "Wave 1"],
                    ["wave2", "Wave 2"],
                    ["wave3", "Wave 3"],
                    ["wave4", "Wave 4"],
                    ["off", "None"],
                  ] as const).map(([style, label]) => (
                    <label key={style} className="flex items-center gap-2 border border-[var(--vm-border)] bg-[#0b0b0b] px-3 py-2 text-xs text-[var(--vm-text)]">
                      <input
                        type="radio"
                        name="waveformStyle"
                        value={style}
                        checked={waveformStyle === style}
                        onChange={() => setWaveformStyle(style)}
                        className="accent-[var(--vm-cyan)]"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

            </div>

            <RenderPanel
              exportId={editorSessionId}
              buildSnapshot={buildSnapshot}
              mastering={mastering}
              onMasteringChange={setMastering}
              playlistRepeatCount={playlistRepeatCount}
              onPlaylistRepeatCountChange={setPlaylistRepeatCount}
            />
          </div>
        </div>
      </section>
    </div>

      {/* Clear 확인 팝업 */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="flex flex-col gap-4 rounded border border-[var(--vm-border)] bg-[#0d0d0d] p-5 shadow-xl">
            <p className="text-sm text-[var(--vm-text)]">플레이리스트를 초기화할까요?</p>
            <p className="text-[11px] text-[var(--vm-subtle)]">현재 작업이 모두 삭제됩니다.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="vm-button-secondary px-4 py-1.5 text-xs"
              >
                No
              </button>
              <button
                onClick={handleClearAll}
                className="border border-[#5a2a2a] bg-[#1e0a0a] px-4 py-1.5 text-xs text-[var(--vm-error)] hover:bg-[#2a0f0f]"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
