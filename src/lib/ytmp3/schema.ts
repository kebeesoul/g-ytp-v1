import { z } from "zod";

export const YtmpExtractRequestSchema = z.object({
  url: z.string().url(),
});

export const YtmpUrlTypeSchema = z.enum(["single", "playlist"]);
export type YtmpUrlType = z.infer<typeof YtmpUrlTypeSchema>;

export const YtmpJobSchema = z.object({
  id: z.string().uuid(),
  source_url: z.string(),
  url_type: YtmpUrlTypeSchema,
  status: z.enum(["waiting", "extracting", "done", "error"]),
  total_count: z.coerce.number().int().nullable().default(0),
  done_count: z.coerce.number().int().nullable().default(0),
  error_msg: z.string().nullable(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
});
export type YtmpJob = z.infer<typeof YtmpJobSchema>;

export const YtmpTrackSchema = z.object({
  id: z.string().uuid(),
  job_id: z.string().uuid(),
  youtube_id: z.string(),
  artist: z.string(),
  title: z.string(),
  duration_sec: z.coerce.number().nullable(),
  local_path: z.string(),
  added_to_editor: z.boolean(),
  created_at: z.string(),
});
export type YtmpTrack = z.infer<typeof YtmpTrackSchema>;

export function detectYtmpUrlType(url: string): YtmpUrlType {
  const parsed = new URL(url);
  return parsed.searchParams.has("list") ? "playlist" : "single";
}
