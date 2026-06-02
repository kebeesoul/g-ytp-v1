import type { ChildProcess } from "node:child_process";

export const activeProcesses = new Map<string, Set<ChildProcess>>();

// Jobs cancelled by the user — runRenderPipeline catch skips DB error updates for these.
export const cancelledJobs = new Set<string>();

export function registerProcess(jobId: string | undefined, proc: ChildProcess): void {
  if (!jobId) return;
  const processes = activeProcesses.get(jobId) ?? new Set<ChildProcess>();
  processes.add(proc);
  activeProcesses.set(jobId, processes);
}

export function unregisterProcess(jobId: string | undefined, proc: ChildProcess): void {
  if (!jobId) return;
  const processes = activeProcesses.get(jobId);
  if (!processes) return;
  processes.delete(proc);
  if (processes.size === 0) activeProcesses.delete(jobId);
}

export function killJobProcesses(jobId: string): void {
  const processes = activeProcesses.get(jobId);
  if (!processes) return;

  for (const proc of processes) {
    proc.kill("SIGTERM");
    const sigkillTimer = setTimeout(() => {
      if (!proc.killed) proc.kill("SIGKILL");
    }, 2000);
    proc.once("exit", () => clearTimeout(sigkillTimer));
  }
}
