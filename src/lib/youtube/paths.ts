import path from "node:path";
import { assertInsideWorkspace, workspacePaths } from "@/lib/workspace";

export function youtubeAuthDir(): string {
  const dir = path.join(workspacePaths.root, "youtube-auth");
  assertInsideWorkspace(dir);
  return dir;
}

export function youtubeTokenPath(tokenPath: string): string {
  const baseDir = youtubeAuthDir();
  const resolved = path.resolve(baseDir, tokenPath);
  const relative = path.relative(baseDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("invalid token path");
  }
  assertInsideWorkspace(resolved);
  return resolved;
}

export function youtubeWorkerPath(filename: "youtube_auth.py" | "youtube_upload.py"): string {
  return path.join(process.cwd(), "workers", filename);
}
