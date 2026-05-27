export const FIXED_MASTERING_SETTINGS = {
  TARGET_LOUDNESS: -9,
  OUTPUT_CEILING: -0.1,
} as const;

// e.g. getMasteredStoragePath("export-id", "track-id", 0) → "mastered/export-id/001_track-id.wav"
export function getMasteredStoragePath(exportId: string, trackId: string, order: number): string {
  const prefix = String(order + 1).padStart(3, "0");
  return `mastered/${exportId}/${prefix}_${trackId}.wav`;
}

// Proxy: lossy m4a used for render when lossless wav is overkill.
export function getMasteredProxyStoragePath(exportId: string, trackId: string, order: number): string {
  const prefix = String(order + 1).padStart(3, "0");
  return `mastered/${exportId}/${prefix}_${trackId}.m4a`;
}
