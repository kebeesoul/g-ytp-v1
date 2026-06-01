import { rm, readdir } from "node:fs/promises";
import path from "node:path";
import { workspacePaths, assertInsideWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

const CLEAR_DIRS = ["export", "import", "thumbnail", "tmp"] as const;

export async function DELETE(): Promise<Response> {
  let deleted = 0;

  for (const dir of CLEAR_DIRS) {
    const target = path.join(workspacePaths.root, dir);
    assertInsideWorkspace(target);

    let entries: string[];
    try {
      entries = await readdir(target);
    } catch {
      // dir doesn't exist yet — skip
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(target, entry);
      assertInsideWorkspace(entryPath);
      await rm(entryPath, { recursive: true, force: true });
      deleted++;
    }
  }

  return Response.json({ deleted });
}
