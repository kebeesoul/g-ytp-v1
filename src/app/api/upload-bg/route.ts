import { z } from "zod";
import fs from "node:fs/promises";
import { BackgroundSchema } from "@/lib/schema";
import { probeMediaFile } from "@/lib/ffmpeg/probe";
import { preprocessBackground } from "@/lib/ffmpeg/preprocessBg";
import { ensureBootCleanup } from "@/lib/render/bootCleanup";
import { applyBgDefaults } from "@/lib/backgroundDefaults";
import { assertInsideWorkspace, resolveStoragePath, workspacePaths } from "@/lib/workspace";

const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const VIDEO_MIMES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/webm",
]);
const KIND_EXTENSIONS = {
  image: new Set(["jpg", "jpeg", "png", "webp", "gif"]),
  video: new Set(["mp4", "mov", "mkv", "webm"]),
} as const;

function detectKind(mimeType: string): "image" | "video" | null {
  if (IMAGE_MIMES.has(mimeType)) return "image";
  if (VIDEO_MIMES.has(mimeType)) return "video";
  return null;
}

export async function POST(req: Request): Promise<Response> {
  await ensureBootCleanup();

  const formData = await req.formData();

  const sessionId = z.string().uuid().safeParse(formData.get("editorSessionId"));
  if (!sessionId.success) {
    return Response.json({ error: "invalid editorSessionId" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file || !file.name) {
    return Response.json({ error: "no file provided" }, { status: 400 });
  }

  const mimeType = file.type || "";
  const kind = detectKind(mimeType);
  if (!kind) {
    return Response.json(
      { error: `unsupported file type: ${mimeType}` },
      { status: 415 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const rawExt = file.name.split(".").pop()?.toLowerCase();
  const ext = rawExt && KIND_EXTENSIONS[kind].has(rawExt)
    ? rawExt
    : kind === "image" ? "jpg" : "mp4";
  const storagePath = `import/${sessionId.data}/bg.${ext}`;
  const previousStoragePath = z.string().optional().safeParse(
    formData.get("previousStoragePath") || undefined
  );

  if (
    previousStoragePath.success &&
    previousStoragePath.data &&
    previousStoragePath.data.startsWith(`import/${sessionId.data}/`)
  ) {
    const previousPath = resolveStoragePath(previousStoragePath.data);
    await fs.rm(previousPath, { force: true });
  }

  const importDir = workspacePaths.importDir(sessionId.data);
  const dest = workspacePaths.importFile(sessionId.data, `bg.${ext}`);
  assertInsideWorkspace(importDir);
  assertInsideWorkspace(dest);
  await fs.mkdir(importDir, { recursive: true });
  await fs.writeFile(dest, buffer);

  let durationSec: number | undefined;

  if (kind === "video") {
    const probe = await probeMediaFile(dest);
    durationSec = probe.durationSec;
  }

  const processed = await preprocessBackground(dest, kind, 0.25, importDir);
  const processedExt = kind === "image" ? "jpg" : "mp4";
  const processedStoragePath = `import/${sessionId.data}/bg_processed.${processedExt}`;
  durationSec = processed.durationSec ?? durationSec;

  const background = BackgroundSchema.parse(
    applyBgDefaults({ kind, storagePath, processedStoragePath, durationSec })
  );

  return Response.json(background);
}
