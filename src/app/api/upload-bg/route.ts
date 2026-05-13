import { z } from "zod";
import { BackgroundSchema } from "@/lib/schema";
import { uploadToStorage } from "@/lib/supabase/storage";
import { probeMediaFile } from "@/lib/ffmpeg/probe";
import { ensureBootCleanup } from "@/lib/render/bootCleanup";
import { applyBgDefaults } from "@/lib/backgroundDefaults";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  const ext = file.name.split(".").pop() ?? (kind === "image" ? "jpg" : "mp4");
  const storagePath = `import/${sessionId.data}/bg.${ext}`;

  await uploadToStorage(storagePath, buffer, mimeType);

  let durationSec: number | undefined;

  if (kind === "video") {
    // ffprobe로 영상 길이 측정 — 임시 파일 경유
    const tmpPath = join(tmpdir(), `bg_${crypto.randomUUID()}.${ext}`);
    try {
      await writeFile(tmpPath, buffer);
      const probe = await probeMediaFile(tmpPath);
      durationSec = probe.durationSec;
    } finally {
      await unlink(tmpPath).catch(() => undefined);
    }
  }

  const background = BackgroundSchema.parse(
    applyBgDefaults({ kind, storagePath, durationSec })
  );

  return Response.json(background);
}
