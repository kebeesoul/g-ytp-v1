import { z } from "zod";

// ─── 트랙 ────────────────────────────────────────────────────────────────────
export const TrackSchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  storagePath: z.string(),
  artist: z.string(),
  title: z.string(),
  durationSec: z.number().positive(),
  order: z.number().int().nonnegative(),
});
export type Track = z.infer<typeof TrackSchema>;

// ─── 배경 ────────────────────────────────────────────────────────────────────
export const BackgroundSchema = z.object({
  kind: z.enum(["image", "video"]),
  storagePath: z.string(),
  durationSec: z.number().optional(),
  fit: z.enum(["cover", "contain", "blurred_contain"]).default("cover"),
  dim: z.number().min(0).max(1).default(0.25),
  blur: z.number().min(0).max(50).default(0),
  cropX: z.number().min(0).max(1).default(0.5),
  cropY: z.number().min(0).max(1).default(0.5),
  cropW: z.number().min(0.01).max(1).default(1.0),
});
export type Background = z.infer<typeof BackgroundSchema>;

// ─── 오버레이 프리셋 ─────────────────────────────────────────────────────────
export const OverlayPresetSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  renderer: z.enum(["drawtext", "png_card"]).default("png_card"),

  layout: z.object({
    anchor: z.enum([
      "top-left", "top-center", "top-right",
      "center",
      "bottom-left", "bottom-center", "bottom-right",
    ]).default("bottom-left"),
    x: z.number().default(80),
    y: z.number().default(-160),
    safeMarginX: z.number().default(96),
    safeMarginY: z.number().default(72),
  }),

  typography: z.object({
    artistFontFamily: z.string().default("AppleSDGothicNeo"),
    titleFontFamily: z.string().default("AppleSDGothicNeo"),
    artistFontSize: z.number().default(32),
    titleFontSize: z.number().default(42),
    artistWeight: z.number().default(500),
    titleWeight: z.number().default(700),
    letterSpacing: z.number().default(0),
    lineHeight: z.number().default(1.15),
    maxLinesTitle: z.number().default(2),
    textAlign: z.enum(["left", "center", "right"]).default("left"),
  }),

  color: z.object({
    // Restrict to valid FFmpeg color formats: #RGB/#RRGGBB/#RRGGBBAA, 0xRRGGBB[AA], or named colors.
    // Prevents filter graph injection via fontcolor= parameter.
    artist: z.string().regex(/^(#[0-9A-Fa-f]{3,8}|0x[0-9A-Fa-f]{6,8}|[a-zA-Z]+)$/).default("#FFFFFF"),
    title: z.string().regex(/^(#[0-9A-Fa-f]{3,8}|0x[0-9A-Fa-f]{6,8}|[a-zA-Z]+)$/).default("#FFFFFF"),
    background: z.string().regex(/^(#[0-9A-Fa-f]{3,8}|0x[0-9A-Fa-f]{6,8}|[a-zA-Z]+)$/).optional(),
    shadow: z.string().regex(/^(#[0-9A-Fa-f]{3,8}|0x[0-9A-Fa-f]{6,8}|[a-zA-Z]+)$/).optional(),
  }),

  card: z.object({
    enabled: z.boolean().default(false),
    paddingX: z.number().default(32),
    paddingY: z.number().default(24),
    radius: z.number().default(24),
    blur: z.number().default(0),
    opacity: z.number().default(1),
  }),

  animation: z.object({
    fadeInSec: z.number().min(0).max(3).default(0.3),
    fadeOutSec: z.number().min(0).max(3).default(0.5),
    animMemo: z.string().optional(),
  }),
});
export type OverlayPreset = z.infer<typeof OverlayPresetSchema>;

// ─── 오버레이 설정 ───────────────────────────────────────────────────────────
export const OverlayConfigSchema = z.object({
  displayMode: z.enum(["0", "2", "5", "full"]).default("5"),
  presetId: z.string().default("default"),
  presetVersion: z.number().int().positive().default(1),
});
export type OverlayConfig = z.infer<typeof OverlayConfigSchema>;

// ─── 오디오 설정 ─────────────────────────────────────────────────────────────
export const AudioConfigSchema = z.object({
  // ebu_r128: two-pass accurate / ebu_r128_fast: single-pass (saves ~10 min per hour of audio)
  normalize: z.enum(["off", "ebu_r128", "ebu_r128_fast"]).default("ebu_r128_fast"),
  targetLufs: z.number().default(-14),
  truePeakDb: z.number().default(-1),
});
export type AudioConfig = z.infer<typeof AudioConfigSchema>;

// ─── 트랜지션 ────────────────────────────────────────────────────────────────
export const TransitionConfigSchema = z.object({
  type: z.enum(["silence", "crossfade"]).default("crossfade"),
  crossfadeSec: z.number().min(0).max(10).default(2),
});
export type TransitionConfig = z.infer<typeof TransitionConfigSchema>;

// ─── 썸네일 설정 ─────────────────────────────────────────────────────────────
export const ThumbnailConfigSchema = z.object({
  mode: z.enum(["extract", "designed"]).default("extract"),
  presetId: z.string().default("default"),
  presetVersion: z.number().int().positive().default(1),
});
export type ThumbnailConfig = z.infer<typeof ThumbnailConfigSchema>;

// ─── 렌더 설정 ───────────────────────────────────────────────────────────────
export const WaveformConfigSchema = z.object({
  style: z.enum(["off", "line", "bars"]).catch("off"),
});

export const RenderConfigSchema = z.object({
  transition: TransitionConfigSchema,
  overlay: OverlayConfigSchema,
  audio: AudioConfigSchema,
  thumbnail: ThumbnailConfigSchema,
  waveform: WaveformConfigSchema.default({ style: "off" }),
  mastering: z.boolean().default(false),
  outputFormat: z.enum(["mp4", "mov"]).default("mp4"),
  audioBitrateKbps: z.literal(192).catch(192),
  resolution: z.tuple([z.literal(1920), z.literal(1080)]),
  hwaccel: z.enum(["videotoolbox", "none"]).default("videotoolbox"),
});
export type RenderConfig = z.infer<typeof RenderConfigSchema>;

// ─── 프로젝트 스냅샷 ─────────────────────────────────────────────────────────
export const ProjectSnapshotSchema = z.object({
  title: z.string().min(1),
  tracks: z.array(TrackSchema),
  background: BackgroundSchema.nullable(),
  renderConfig: RenderConfigSchema,
  hashtags: z.array(z.string()),
});
export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>;

// ─── DB: projects 테이블 ─────────────────────────────────────────────────────
export const ProjectRecordSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  snapshot: ProjectSnapshotSchema,
  status: z.enum(["rendering", "done", "error"]),
  thumbnail_path: z.string().nullable(),
  export_folder: z.string(),
  latest_job_id: z.string().uuid().nullable(),
  // Supabase returns timestamps as "2026-05-16 21:14:00.903842+00" (space, microseconds, +00)
  // which doesn't satisfy z.string().datetime() strict ISO 8601 — use z.string() instead.
  exported_at: z.string().nullable(),
  created_at: z.string(),
});
export type ProjectRecord = z.infer<typeof ProjectRecordSchema>;

// ─── DB: render_jobs 테이블 ──────────────────────────────────────────────────
export const RenderJobRecordSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  status: z.enum(["queued", "running", "done", "error"]),
  progress: z.number().min(0).max(1),
  eta_sec: z.number().nullable(),
  output_path: z.string().nullable(),
  error_msg: z.string().nullable(),
  started_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
});
export type RenderJobRecord = z.infer<typeof RenderJobRecordSchema>;

// ─── localStorage 상태 ───────────────────────────────────────────────────────
export const ActiveRenderSchema = z.object({
  exportId: z.string().uuid(),
  jobId: z.string().uuid(),
});
export type ActiveRender = z.infer<typeof ActiveRenderSchema>;

// ─── 트랙리스트 ──────────────────────────────────────────────────────────────
export const TracklistLineSchema = z.object({
  timecode: z.string(),
  artist: z.string(),
  title: z.string(),
});
export const TracklistSchema = z.object({
  lines: z.array(TracklistLineSchema),
  hashtags: z.array(z.string()),
});
export type Tracklist = z.infer<typeof TracklistSchema>;
