import { z } from "zod";
import { parseBuffer } from "music-metadata";
import { TrackSchema } from "@/lib/schema";
import { uploadToStorage } from "@/lib/supabase/storage";
import { ensureBootCleanup } from "@/lib/render/bootCleanup";

export async function POST(req: Request): Promise<Response> {
  await ensureBootCleanup();

  const formData = await req.formData();

  const sessionId = z.string().uuid().safeParse(formData.get("editorSessionId"));
  if (!sessionId.success) {
    return Response.json({ error: "invalid editorSessionId" }, { status: 400 });
  }

  const files = formData.getAll("files") as File[];
  if (files.length === 0) {
    return Response.json({ error: "no files provided" }, { status: 400 });
  }

  const tracks = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file.name) {
      return Response.json({ error: "invalid file entry" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // music-metadata 파싱
    let artist = "";
    let title = "";
    let durationSec = 0;

    try {
      const meta = await parseBuffer(buffer, { mimeType: file.type || "audio/mpeg" });
      artist = meta.common.artist ?? "";
      title = meta.common.title ?? "";
      durationSec = meta.format.duration ?? 0;
    } catch {
      // 파싱 실패 시 파일명 fallback (§15)
    }

    // 파일명 fallback
    const baseName = file.name.replace(/\.[^.]+$/, "");
    if (!artist && !title) {
      const parts = baseName.split(" - ");
      if (parts.length >= 2) {
        artist = parts[0].trim();
        title = parts.slice(1).join(" - ").trim();
      } else {
        title = baseName;
      }
    }
    if (!artist) artist = "Unknown Artist";
    if (!title) title = baseName;

    if (durationSec <= 0) {
      return Response.json(
        { error: `could not determine duration for: ${file.name}` },
        { status: 422 }
      );
    }

    const trackId = crypto.randomUUID();
    const ext = file.name.split(".").pop() ?? "mp3";
    const padded = String(i + 1).padStart(3, "0");
    const storagePath = `import/${sessionId.data}/track_${padded}_${trackId}.${ext}`;

    await uploadToStorage(storagePath, buffer, file.type || "audio/mpeg");

    const track = TrackSchema.parse({
      id: trackId,
      filename: file.name,
      storagePath,
      artist,
      title,
      durationSec,
      order: i,
    });

    tracks.push(track);
  }

  return Response.json(tracks);
}
