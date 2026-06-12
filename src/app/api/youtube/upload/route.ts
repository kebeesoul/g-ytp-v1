import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { ProjectRecordSchema } from "@/lib/schema";
import { supabaseServer } from "@/lib/supabase/server";
import { workspacePaths } from "@/lib/workspace";
import { buildYouTubeMetadata } from "@/lib/youtube/buildMetadata";
import {
  assertYouTubeQuotaAvailable,
  recordYouTubeQuotaUsage,
  YOUTUBE_UPLOAD_QUOTA_UNITS,
} from "@/lib/youtube/quotaGuard";
import { runPythonJsonLines } from "@/lib/youtube/python";
import { youtubeTokenPath, youtubeWorkerPath } from "@/lib/youtube/paths";

const UploadRequestSchema = z.object({
  exportId: z.string().uuid(),
  channelId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
});
const ChannelRowSchema = z.object({
  id: z.string(),
  token_path: z.string(),
  authorized: z.boolean(),
});
const UploadResultSchema = z.object({
  videoId: z.string(),
  quotaUsed: z.number().int(),
});
const ProgressLineSchema = z.object({
  progress: z.number().int().min(0).max(100),
});

function studioUrl(videoId: string): string {
  return `https://studio.youtube.com/video/${videoId}/edit`;
}

export async function POST(req: Request): Promise<Response> {
  const body: unknown = await req.json();
  const parsed = UploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { exportId, channelId } = parsed.data;
  const { data: channelData, error: channelError } = await supabaseServer
    .from("youtube_channels")
    .select("id, token_path, authorized")
    .eq("id", channelId)
    .maybeSingle();
  if (channelError) return Response.json({ error: channelError.message }, { status: 500 });
  const channel = ChannelRowSchema.safeParse(channelData);
  if (!channel.success) {
    return Response.json({ error: "channel not found" }, { status: 404 });
  }
  if (!channel.data.authorized) {
    return Response.json({ error: "channel not authorized" }, { status: 400 });
  }

  try {
    await assertYouTubeQuotaAvailable();
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "quota check failed" },
      { status: 429 }
    );
  }

  const { data: projectData, error: projectError } = await supabaseServer
    .from("projects")
    .select("*")
    .eq("id", exportId)
    .single();
  if (projectError || !projectData) {
    return Response.json({ error: "project not found" }, { status: 404 });
  }
  const project = ProjectRecordSchema.safeParse(projectData);
  if (!project.success || project.data.status !== "done") {
    return Response.json({ error: "project is not ready for upload" }, { status: 409 });
  }

  const videoPath = workspacePaths.finalVideo(exportId, "mp4");
  try {
    const info = await stat(videoPath);
    if (!info.isFile()) {
      return Response.json({ error: "final video not found" }, { status: 404 });
    }
  } catch {
    return Response.json({ error: "final video not found" }, { status: 404 });
  }

  const metadata = buildYouTubeMetadata(project.data.snapshot);
  const { data: uploadData, error: insertError } = await supabaseServer
    .from("youtube_uploads")
    .insert({
      export_id: exportId,
      channel_id: channelId,
      title: metadata.title,
      privacy_status: "private",
      upload_status: "uploading",
    })
    .select("id")
    .single();
  if (insertError || !uploadData) {
    return Response.json({ error: insertError?.message ?? "upload insert failed" }, { status: 500 });
  }
  const uploadId = z.object({ id: z.string().uuid() }).parse(uploadData).id;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "gytp-youtube-"));
  const metadataPath = path.join(tempDir, "metadata.json");

  try {
    await writeFile(metadataPath, JSON.stringify(metadata), "utf8");
    let latestProgress = 0;
    const result = await runPythonJsonLines({
      scriptPath: youtubeWorkerPath("youtube_upload.py"),
      args: [
        "--video", videoPath,
        "--token", youtubeTokenPath(channel.data.token_path),
        "--metadata", metadataPath,
      ],
      resultSchema: UploadResultSchema,
      onLine: (line) => {
        const progress = ProgressLineSchema.safeParse(line);
        if (progress.success) latestProgress = progress.data.progress;
      },
    });

    await recordYouTubeQuotaUsage();
    const completedAt = new Date().toISOString();
    const { error: updateError } = await supabaseServer
      .from("youtube_uploads")
      .update({
        youtube_video_id: result.videoId,
        upload_status: "done",
        quota_used: YOUTUBE_UPLOAD_QUOTA_UNITS,
        completed_at: completedAt,
      })
      .eq("id", uploadId);
    if (updateError) throw new Error(updateError.message);

    return Response.json({
      videoId: result.videoId,
      studioUrl: studioUrl(result.videoId),
      progress: latestProgress || 100,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "youtube upload failed";
    await supabaseServer
      .from("youtube_uploads")
      .update({ upload_status: "error", error_msg: msg, completed_at: new Date().toISOString() })
      .eq("id", uploadId);
    return Response.json({ error: msg }, { status: 500 });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
