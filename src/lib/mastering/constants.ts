import type { AudioConfig } from "@/lib/schema";

export const FIXED_MASTERING_SETTINGS = {
  TARGET_LOUDNESS: -9.0,
  OUTPUT_CEILING: -0.1,
  LRA_TARGET: 9.0,
  STEREO_WIDTH: 1.0,
  TONE: "balanced",
  GLUE: "light",
  LOUDNESS_MODE: "natural",
  EXPORT_FORMAT: "wav",
  BIT_DEPTH: 24,
  SAMPLE_RATE: "keep",
  DITHER: "off",
} as const;

export const MASTERED_STORAGE_PREFIX = "mastered";

export const FIXED_MASTERING_AUDIO_CONFIG: AudioConfig = {
  normalize: "ebu_r128",
  targetLufs: FIXED_MASTERING_SETTINGS.TARGET_LOUDNESS,
  truePeakDb: FIXED_MASTERING_SETTINGS.OUTPUT_CEILING,
};

export function getMasteredStoragePath(
  exportId: string,
  trackId: string,
  index: number
): string {
  const slot = String(index + 1).padStart(3, "0");
  return `${MASTERED_STORAGE_PREFIX}/${exportId}/${slot}_${trackId}.wav`;
}

export function getMasteredProxyStoragePath(
  exportId: string,
  trackId: string,
  index: number
): string {
  const slot = String(index + 1).padStart(3, "0");
  return `${MASTERED_STORAGE_PREFIX}/${exportId}/${slot}_${trackId}.m4a`;
}
