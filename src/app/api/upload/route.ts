import { z } from "zod";
import { parseBuffer } from "music-metadata";
import { TrackSchema } from "@/lib/schema";
import { uploadToStorage } from "@/lib/supabase/storage";
import { ensureBootCleanup } from "@/lib/render/bootCleanup";

const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "m4a", "aac", "flac", "ogg"]);

function compareFileName(a: File, b: File): number {
  return a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function isAudioFile(file: File): boolean {
  if (file.type.startsWith("audio/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return !!ext && AUDIO_EXTENSIONS.has(ext);
}

export async function POST(req: Request): Promise<Response> {
  await ensureBootCleanup();

  const formData = await req.formData();

  const sessionId = z.string().uuid().safeParse(formData.get("editorSessionId"));
  if (!sessionId.success) {
    return Response.json({ error: "invalid editorSessionId" }, { status: 400 });
  }

  const files = formData
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File && !!entry.name);

  const singleFile = formData.get("file");
  if (singleFile instanceof File && singleFile.name) {
    files.push(singleFile);
  }

  if (files.length === 0) {
    return Response.json({ error: "no files provided" }, { status: 400 });
  }

  const invalidFiles = files.filter((file) => !isAudioFile(file));
  if (invalidFiles.length > 0) {
    return Response.json(
      { error: `unsupported audio file type: ${invalidFiles.map((f) => f.name).join(", ")}` },
      { status: 415 }
    );
  }

  const sortedFiles = [...files].sort(compareFileName);
  const tracks = [];

  for (let i = 0; i < sortedFiles.length; i++) {
    const file = sortedFiles[i];
    const buffer = Buffer.from(await file.arrayBuffer());

    let artist = "";
    let title = "";
    let durationSec = 0;

    try {
      const meta = await parseBuffer(buffer, { mimeType: file.type || "audio/mpeg" });
      artist = meta.common.artist ?? "";
      title = meta.common.title ?? "";
      durationSec = meta.format.duration ?? 0;
    } catch {
      // Fall back to filename parsing below.
    }

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
