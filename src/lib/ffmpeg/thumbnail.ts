import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveFfmpegPath } from "./resolveFfmpeg";

const execFileAsync = promisify(execFile);
const FFMPEG = resolveFfmpegPath();

// 영상에서 640×360 첫 프레임 추출 → outputPath(jpg)
export async function extractThumbnail(
  videoPath: string,
  outputPath: string
): Promise<void> {
  await execFileAsync(FFMPEG, [
    "-y",
    "-ss", "0",
    "-i", videoPath,
    "-vframes", "1",
    "-vf", "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2",
    "-q:v", "2",
    outputPath,
  ], { maxBuffer: 64 * 1024 * 1024 });
}
