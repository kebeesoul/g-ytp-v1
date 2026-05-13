import type { ChildProcess } from "node:child_process";

export const activeProcesses = new Map<string, ChildProcess>();
