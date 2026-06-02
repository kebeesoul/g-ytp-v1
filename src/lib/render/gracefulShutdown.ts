import { activeProcesses } from "./processRegistry";
import { supabaseServer } from "@/lib/supabase/server";

let registered = false;

export function registerShutdownHandler(): void {
  if (registered) return;
  registered = true;

  const handler = async () => {
    for (const [jobId, processes] of activeProcesses) {
      for (const proc of processes) {
        try {
          proc.kill("SIGTERM");
        } catch {}
      }
      await supabaseServer
        .from("render_jobs")
        .update({
          status: "error",
          error_msg: "server shutdown",
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }
    process.exit(0);
  };

  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
}
