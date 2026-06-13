import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { parseFile } from "music-metadata";
import { TrackSchema } from "@/lib/schema";
import { supabaseServer } from "@/lib/supabase/server";
import { assertInsideWorkspace, resolveStoragePath, workspacePaths } from "@/lib/workspace";
import { YtmpTrackSchema } from "@/lib/ytmp3/schema";

export const runtime = "nodejs";

const ToEditorRequestSchema = z.object({
  trackIds: z.array(z.string().uuid()).min(1),
  editorSessionId: z.string().uuid(),
});

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_");
}

export async function POST(req: Request): Promise<Response> {
  const body: unknown = await req.json();
  const parsed = ToEditorRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("ytmp3_tracks")
    .select("*")
    .in("id", parsed.data.trackIds);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = z.array(YtmpTrackSchema).safeParse(data ?? []);
  if (!rows.success) {
    return Response.json({ error: "schema validation failed" }, { status: 500 });
  }

  const orderedRows = parsed.data.trackIds
    .map((id) => rows.data.find((row) => row.id === id))
    .filter((row): row is z.infer<typeof YtmpTrackSchema> => Boolean(row));

  const importDir = workspacePaths.importDir(parsed.data.editorSessionId);
  assertInsideWorkspace(importDir);
  await mkdir(importDir, { recursive: true });

  const tracks = [];
  for (let i = 0; i < orderedRows.length; i++) {
    const row = orderedRows[i];
    const source = resolveStoragePath(row.local_path);
    const filename = sanitizeFilename(`${String(i + 1).padStart(3, "0")}_${row.id}.mp3`);
    const dest = workspacePaths.importFile(parsed.data.editorSessionId, filename);
    assertInsideWorkspace(dest);
    await copyFile(source, dest);

    let durationSec = row.duration_sec ?? 0;
    if (durationSec <= 0) {
      const meta = await parseFile(dest);
      durationSec = meta.format.duration ?? 0;
    }
    if (durationSec <= 0) {
      return Response.json({ error: `could not determine duration: ${path.basename(source)}` }, { status: 422 });
    }

    tracks.push(TrackSchema.parse({
      id: crypto.randomUUID(),
      filename,
      storagePath: `import/${parsed.data.editorSessionId}/${filename}`,
      artist: row.artist,
      title: row.title,
      durationSec,
      order: i,
    }));
  }

  await supabaseServer
    .from("ytmp3_tracks")
    .update({ added_to_editor: true })
    .in("id", orderedRows.map((row) => row.id));

  return Response.json(tracks);
}
