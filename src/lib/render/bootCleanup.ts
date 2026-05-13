import { supabaseServer } from "@/lib/supabase/server";
import { registerShutdownHandler } from "./gracefulShutdown";

let bootCleanupDone = false;

export async function ensureBootCleanup(): Promise<void> {
  if (bootCleanupDone) return;
  bootCleanupDone = true;

  registerShutdownHandler(); // Layer F — 부팅 시 1회 등록

  const { data: zombies } = await supabaseServer
    .from("render_jobs")
    .select("id, project_id")
    .in("status", ["queued", "running"]);

  if (!zombies || zombies.length === 0) return;

  const now = new Date().toISOString();
  await supabaseServer
    .from("render_jobs")
    .update({
      status: "error",
      error_msg: "server restarted before completion",
      completed_at: now,
    })
    .in("status", ["queued", "running"]);

  const projectIds = zombies.map((z) => z.project_id as string);
  await supabaseServer
    .from("projects")
    .update({ status: "error" })
    .in("id", projectIds)
    .eq("status", "rendering");

  console.log(`[startup] cleaned up ${zombies.length} zombie jobs`);
}
