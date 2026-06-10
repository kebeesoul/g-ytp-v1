import fs from "node:fs";
import path from "node:path";

const WORKSPACE_ROOT = path.resolve(
  process.env.WORKSPACE_DIR ?? "./workspace"
);

export function assertInsideWorkspace(targetPath: string): void {
  const resolved = path.resolve(targetPath);
  const relative = path.relative(WORKSPACE_ROOT, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`path traversal detected: ${resolved}`);
  }
}

export const workspacePaths = {
  root: WORKSPACE_ROOT,

  importRoot: () =>
    path.join(WORKSPACE_ROOT, "import"),

  importDir: (exportId: string) =>
    path.join(WORKSPACE_ROOT, "import", exportId),

  importFile: (exportId: string, filename: string) =>
    path.join(WORKSPACE_ROOT, "import", exportId, filename),

  exportRoot: () =>
    path.join(WORKSPACE_ROOT, "export"),

  exportDir: (exportId: string) =>
    path.join(WORKSPACE_ROOT, "export", exportId),

  finalVideo: (exportId: string, format: "mp4" | "mov") =>
    path.join(WORKSPACE_ROOT, "export", exportId, `final.${format}`),

  tmpRoot: () =>
    path.join(WORKSPACE_ROOT, "tmp"),

  tmpDir: (jobId: string) =>
    path.join(WORKSPACE_ROOT, "tmp", jobId),

  tmpAudioDir: (jobId: string) =>
    path.join(WORKSPACE_ROOT, "tmp", jobId, "audio"),

  tmpFinalVideo: (jobId: string) =>
    path.join(WORKSPACE_ROOT, "tmp", jobId, "final.mp4"),

  thumbnail: (exportId: string) =>
    path.join(WORKSPACE_ROOT, "import", exportId, "thumbnail.jpg"),

  thumbnailRoot: () =>
    path.join(WORKSPACE_ROOT, "thumbnail"),

  thumbnailPhotoDir: () =>
    path.join(WORKSPACE_ROOT, "thumbnail", "photos"),

  thumbnailPhoto: (filename: string) =>
    path.join(WORKSPACE_ROOT, "thumbnail", "photos", filename),

  selectedThumbnailDir: () =>
    path.join(WORKSPACE_ROOT, "thumbnail", "selected"),

  selectedThumbnail: (filename: string) =>
    path.join(WORKSPACE_ROOT, "thumbnail", "selected", filename),

  masteredCacheDir: () =>
    path.join(WORKSPACE_ROOT, "mastered-cache"),

  masteredCacheFile: (cacheKey: string) =>
    path.join(WORKSPACE_ROOT, "mastered-cache", `${cacheKey}.wav`),
};

export function resolveStoragePath(relativePath: string): string {
  const abs = path.join(WORKSPACE_ROOT, relativePath);
  assertInsideWorkspace(abs);
  return abs;
}

export function fileExists(p: string): boolean {
  assertInsideWorkspace(p);
  return fs.existsSync(p);
}

export function checkImportFilesExist(exportId: string): boolean {
  const dir = workspacePaths.importDir(exportId);
  assertInsideWorkspace(dir);
  return fs.existsSync(dir);
}

export const getJobWorkDir = (jobId: string): string =>
  workspacePaths.tmpDir(jobId);

export const getJobAudioDir = (jobId: string): string =>
  workspacePaths.tmpAudioDir(jobId);

export const getFinalOutputPath = (jobId: string): string =>
  workspacePaths.tmpFinalVideo(jobId);
