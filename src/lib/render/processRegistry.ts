import type { ChildProcess } from "node:child_process";

export const activeProcesses = new Map<string, ChildProcess>();

// Jobs cancelled by the user — runRenderPipeline catch skips DB error updates for these.
export const cancelledJobs = new Set<string>();
