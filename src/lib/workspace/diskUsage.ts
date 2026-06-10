import { readdir, stat, statfs } from "node:fs/promises";

const BYTES_PER_MB = 1024 * 1024;

export type WorkspaceUsageKey =
  | "import"
  | "export"
  | "tmp"
  | "mastered-cache"
  | "thumbnail";

export async function getDirectorySizeBytes(directory: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingPathError(error)) return 0;
    throw error;
  }

  const sizes = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return getDirectorySizeBytes(entryPath);
      if (!entry.isFile()) return 0;
      return (await stat(entryPath)).size;
    })
  );

  return sizes.reduce((total, size) => total + size, 0);
}

export function bytesToMegabytes(bytes: number): number {
  return Math.round(bytes / BYTES_PER_MB);
}

export async function getWorkspaceUsageMb(
  directories: Record<WorkspaceUsageKey, string>
): Promise<Record<WorkspaceUsageKey, number>> {
  const entries = await Promise.all(
    Object.entries(directories).map(async ([key, directory]) => [
      key,
      bytesToMegabytes(await getDirectorySizeBytes(directory)),
    ])
  );

  return Object.fromEntries(entries) as Record<WorkspaceUsageKey, number>;
}

export async function getFreeDiskMb(directory: string): Promise<number> {
  const disk = await statfs(directory);
  return bytesToMegabytes(disk.bavail * disk.bsize);
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
