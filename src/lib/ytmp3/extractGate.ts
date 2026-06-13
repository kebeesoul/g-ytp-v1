import { supabaseServer } from "@/lib/supabase/server";

export async function isRenderActive(): Promise<boolean> {
  const { data } = await supabaseServer
    .from("render_jobs")
    .select("id")
    .in("status", ["queued", "running"])
    .limit(1);
  return Boolean(data && data.length > 0);
}

export async function waitUntilRenderIdle(maxWaitMs = 1_800_000): Promise<void> {
  const start = Date.now();
  while (await isRenderActive()) {
    if (Date.now() - start > maxWaitMs) {
      throw new Error("render busy timeout (30min)");
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
}
