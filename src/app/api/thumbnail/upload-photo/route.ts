import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertInsideWorkspace, workspacePaths } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

function sanitizeExt(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "jpg";
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return ext;
  return "jpg";
}

export async function POST(req: Request): Promise<Response> {
  const formData = await req.formData();
  const file = formData.get("file");
  const photoId = z.string().uuid().safeParse(formData.get("photoId"));

  if (!(file instanceof File) || !file.name || !photoId.success) {
    return NextResponse.json({ error: "missing file or photoId" }, { status: 400 });
  }

  if (!IMAGE_MIMES.has(file.type)) {
    return NextResponse.json({ error: `unsupported file type: ${file.type}` }, { status: 415 });
  }

  const ext = sanitizeExt(file.name);
  const filename = `${photoId.data}.${ext}`;
  const dir = workspacePaths.thumbnailPhotoDir();
  const dest = workspacePaths.thumbnailPhoto(filename);
  assertInsideWorkspace(dir);
  assertInsideWorkspace(dest);

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(dest, Buffer.from(await file.arrayBuffer()));

  return NextResponse.json({ localPath: `thumbnail/photos/${filename}` });
}
