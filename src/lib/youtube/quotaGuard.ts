import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";

export const YOUTUBE_DAILY_QUOTA_LIMIT = 10_000;
export const YOUTUBE_UPLOAD_QUOTA_UNITS = 1_600;

const QuotaRowSchema = z.object({
  quota_used: z.number(),
});

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function assertYouTubeQuotaAvailable(): Promise<void> {
  const date = todayKey();
  const { data, error } = await supabaseServer
    .from("youtube_quota_log")
    .select("quota_used")
    .eq("date", date)
    .maybeSingle();

  if (error) throw new Error(`quota lookup failed: ${error.message}`);
  const parsed = data ? QuotaRowSchema.parse(data) : { quota_used: 0 };
  if (parsed.quota_used + YOUTUBE_UPLOAD_QUOTA_UNITS > YOUTUBE_DAILY_QUOTA_LIMIT) {
    throw new Error("daily quota exceeded");
  }
}

export async function recordYouTubeQuotaUsage(): Promise<void> {
  const date = todayKey();
  const { data, error } = await supabaseServer
    .from("youtube_quota_log")
    .select("quota_used")
    .eq("date", date)
    .maybeSingle();

  if (error) throw new Error(`quota lookup failed: ${error.message}`);
  const parsed = data ? QuotaRowSchema.parse(data) : { quota_used: 0 };
  const nextQuota = parsed.quota_used + YOUTUBE_UPLOAD_QUOTA_UNITS;
  const { error: upsertError } = await supabaseServer
    .from("youtube_quota_log")
    .upsert({ date, quota_used: nextQuota }, { onConflict: "date" });

  if (upsertError) throw new Error(`quota update failed: ${upsertError.message}`);
}
