import { checkFFmpegAvailable } from "@/lib/ffmpeg/probe";

export async function GET(): Promise<Response> {
  let ffmpeg = false;
  let ffmpegError: string | undefined;

  try {
    await checkFFmpegAvailable();
    ffmpeg = true;
  } catch (err) {
    ffmpegError = err instanceof Error ? err.message : "FFmpeg check failed";
  }

  const ok = ffmpeg;
  return Response.json({ ok, ffmpeg, ffmpegError }, { status: ok ? 200 : 503 });
}
