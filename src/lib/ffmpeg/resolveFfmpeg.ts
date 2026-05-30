import { existsSync } from "node:fs";

// Well-known ffmpeg locations to try when FFMPEG_PATH is not set.
const FALLBACK_PATHS = [
  "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg", // Mac Studio (Homebrew ffmpeg-full)
  "/opt/homebrew/bin/ffmpeg",                  // Apple Silicon Homebrew
  "/usr/local/bin/ffmpeg",                     // Intel Mac Homebrew / MacBook
  "/usr/bin/ffmpeg",                           // Linux system install
];

// Resolves the ffmpeg binary: FFMPEG_PATH env → known locations → system PATH.
export function resolveFfmpegPath(): string {
  const fromEnv = process.env.FFMPEG_PATH;
  if (fromEnv) return fromEnv;
  for (const p of FALLBACK_PATHS) {
    if (existsSync(p)) return p;
  }
  return "ffmpeg";
}
