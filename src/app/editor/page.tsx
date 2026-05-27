"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
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

interface EditorPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const DEFAULT_RENDER_CONFIG: ProjectSnapshot["renderConfig"] = {
  transition: { type: "silence", crossfadeSec: 2 },
  overlay: { displayMode: "0", presetId: "default", presetVersion: 1 },
  audio: { normalize: "ebu_r128", targetLufs: -14, truePeakDb: -1 },
  thumbnail: { mode: "extract", presetId: "default", presetVersion: 1 },
  waveform: { style: "off" },
  mastering: false,
  outputFormat: "mp4",
  audioBitrateKbps: 192,
  resolution: [1920, 1080],
  hwaccel: "videotoolbox",
};

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

  const [editorSessionId] = useState<string>(() => crypto.randomUUID());
  const [title, setTitle] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [background, setBackground] = useState<Background | null>(null);
  const [transitionType, setTransitionType] = useState<"silence" | "crossfade">("silence");
  const [crossfadeSec] = useState(2);
  const [overlayMode, setOverlayMode] = useState<"0" | "2" | "5" | "full">("0");
  const [waveformStyle, setWaveformStyle] = useState<ProjectSnapshot["renderConfig"]["waveform"]["style"]>("off");
  const [hashtags, setHashtags] = useState<string[]>([]);
  // Separate input state — only synced to hashtags on blur to avoid per-keystroke snapshot updates.
  const [hashtagInput, setHashtagInput] = useState("");
  const [outputFormat, setOutputFormat] = useState<"mp4" | "mov">("mp4");

  const [overlayPresetId, setOverlayPresetId] = useState("default");
  const [presets, setPresets] = useState<(OverlayPreset | null)[]>(Array(6).fill(null));

  const [activeTrackId, setActiveTrackId] = useState<string | null>(null);
  const [activeStoragePath, setActiveStoragePath] = useState<string | null>(null);

  const [hydrateError, setHydrateError] = useState<string | null>(null);
  const [hydrateLoading, setHydrateLoading] = useState(!!fromId);
  const [ffmpegWarning, setFfmpegWarning] = useState<string | null>(null);
  const [presetLoadWarning, setPresetLoadWarning] = useState<string | null>(null);

  const hydratedRef = useRef(false);

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
        setOverlayPresetId(snapshot.renderConfig.overlay.presetId);
        setHashtags(snapshot.hashtags);
        setHashtagInput(snapshot.hashtags.join(", "));
        setOutputFormat(snapshot.renderConfig.outputFormat);
        setHydrateLoading(false);
      } catch (err) {
        setHydrateError(err instanceof Error ? err.message : "복원 실패");
        setHydrateLoading(false);
      }
    })();
  }, [fromId]);

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
        outputFormat,
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

  const snapshot = useMemo(
    () => buildSnapshot(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [title, tracks, background, transitionType, crossfadeSec, overlayMode, overlayPresetId, presets, outputFormat, hashtags, waveformStyle]
  );
  const snapshotValid = !("error" in snapshot);

  if (hydrateLoading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-gray-950">
        <p className="text-sm text-gray-400">프로젝트 복원 중...</p>
      </div>
    );
  }

  if (hydrateError) {
    return (
      <div className="flex min-h-full items-center justify-center bg-gray-950">
        <p className="text-sm text-red-400">복원 실패: {hydrateError}</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-950 px-6 py-8">
      {ffmpegWarning && (
        <div className="mx-auto mb-4 max-w-6xl rounded-md border border-yellow-500/40 bg-yellow-950/40 px-4 py-3 text-sm text-yellow-300">
          ⚠ FFmpeg 미설치: {ffmpegWarning}
        </div>
      )}
      {presetLoadWarning && (
        <div className="mx-auto mb-4 max-w-6xl rounded-md border border-yellow-500/40 bg-yellow-950/40 px-4 py-3 text-sm text-yellow-300">
          ⚠ 오버레이 프리셋: {presetLoadWarning}
        </div>
      )}
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <TitleInput value={title} onChange={setTitle} />

          <TrackList
            tracks={tracks}
            onReorder={setTracks}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onPlay={handlePlay}
            onFilesAdded={handleFilesAdded}
          />

          <AudioPlayer storagePath={activeStoragePath} trackId={activeTrackId} />
        </div>

        <div className="flex flex-col gap-6">
          <BackgroundPicker
            editorSessionId={editorSessionId}
            value={background}
            onChange={setBackground}
          />

          <OverlayPresetSlots
            presets={presets}
            selectedId={overlayPresetId}
            onChange={setOverlayPresetId}
          />

          <div className="flex flex-col gap-3 rounded-md border border-gray-700 bg-gray-900 p-4">
            <span className="text-sm font-medium text-gray-300">렌더 설정</span>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-400">Transition</span>
              <div className="flex gap-4">
                {(["silence", "crossfade"] as const).map((t) => (
                  <label key={t} className="flex items-center gap-2 text-sm text-gray-200">
                    <input
                      type="radio"
                      name="transition"
                      value={t}
                      checked={transitionType === t}
                      onChange={() => setTransitionType(t)}
                    />
                    {t === "silence" ? "silence" : `crossfade ${crossfadeSec}s`}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-400">Overlay 표시</span>
              <div className="flex gap-3 flex-wrap">
                {(["0", "2", "5", "full"] as const).map((m) => (
                  <label key={m} className="flex items-center gap-2 text-sm text-gray-200">
                    <input
                      type="radio"
                      name="overlayMode"
                      value={m}
                      checked={overlayMode === m}
                      onChange={() => setOverlayMode(m)}
                    />
                    {m === "0" ? "없음" : m === "full" ? "Full" : `${m}s`}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-400">해시태그 (쉼표 구분)</span>
              <input
                type="text"
                value={hashtagInput}
                onChange={(e) => setHashtagInput(e.target.value)}
                onBlur={(e) => {
                  const parsed = e.target.value
                    .split(",")
                    .map((h) => h.trim())
                    .filter(Boolean);
                  setHashtags(parsed);
                }}
                placeholder="#lofi, #chill"
                className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <RenderPanel
            exportId={editorSessionId}
            buildSnapshot={buildSnapshot}
            outputFormat={outputFormat}
            onOutputFormatChange={setOutputFormat}
          />

          {snapshotValid && tracks.length > 0 && (
            <TracklistExport snapshot={snapshot as ProjectSnapshot} />
          )}
        </div>
      </div>
    </div>
  );
}
