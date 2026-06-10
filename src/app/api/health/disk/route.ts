import {
  getFreeDiskMb,
  getWorkspaceUsageMb,
} from "@/lib/workspace/diskUsage";
import { workspacePaths } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const usageMb = await getWorkspaceUsageMb({
    import: workspacePaths.importRoot(),
    export: workspacePaths.exportRoot(),
    tmp: workspacePaths.tmpRoot(),
    "mastered-cache": workspacePaths.masteredCacheDir(),
    thumbnail: workspacePaths.thumbnailRoot(),
  });

  const totalMb = Object.values(usageMb).reduce(
    (total, usage) => total + usage,
    0
  );

  return Response.json({
    workspace: {
      root: workspacePaths.root,
      usage_mb: usageMb,
      total_mb: totalMb,
    },
    disk: {
      free_mb: await getFreeDiskMb(workspacePaths.root),
    },
    generated_at: new Date().toISOString(),
  });
}
