import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { BackgroundSchema } from "@/lib/schema";
import { applyBgDefaults } from "@/lib/backgroundDefaults";
import { assertInsideWorkspace, workspacePaths } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.type !== "image/png") {
    return NextResponse.json({ error: "missing png file" }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const filename = `${id}.png`;
  const dir = workspacePaths.selectedThumbnailDir();
  const dest = workspacePaths.selectedThumbnail(filename);
  assertInsideWorkspace(dir);
  assertInsideWorkspace(dest);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(dest, Buffer.from(await file.arrayBuffer()));

  const background = BackgroundSchema.parse(
    applyBgDefaults({
      kind: "image",
      storagePath: `thumbnail/selected/${filename}`,
    })
  );

  return NextResponse.json(background);
}
