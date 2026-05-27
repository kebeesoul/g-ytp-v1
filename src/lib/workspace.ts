import { join, resolve } from "node:path";

const WORKSPACE_DIR = process.env.WORKSPACE_DIR ?? "./workspace";

export const workspacePaths = {
  root: resolve(WORKSPACE_DIR),
  import: resolve(join(WORKSPACE_DIR, "import")),
  export: resolve(join(WORKSPACE_DIR, "export")),
};

// Throws if absPath escapes the workspace root (path traversal guard).
export function assertInsideWorkspace(absPath: string): void {
  const normalized = resolve(absPath);
  const root = workspacePaths.root;
  if (normalized !== root && !normalized.startsWith(root + "/")) {
    throw new Error("path traversal detected");
  }
}

// Resolves a storage-relative path to an absolute workspace path, asserting no traversal.
export function resolveStoragePath(storagePath: string): string {
  const absPath = join(workspacePaths.root, storagePath);
  assertInsideWorkspace(absPath);
  return absPath;
}

export const getJobWorkDir = (jobId: string): string =>
  join(WORKSPACE_DIR, "tmp", jobId);

export const getJobAudioDir = (jobId: string): string =>
  join(getJobWorkDir(jobId), "audio");

export const getFinalOutputPath = (jobId: string, format: "mp4" | "mov"): string =>
  join(getJobWorkDir(jobId), `final.${format}`);
