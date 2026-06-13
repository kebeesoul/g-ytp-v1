import { readFile } from "node:fs/promises";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { resolveStoragePath } from "@/lib/workspace";
import { YtmpTrackSchema } from "@/lib/ytmp3/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DownloadQuerySchema = z.object({
  ids: z.string().optional(),
}).transform((data) => ({
  ids: data.ids
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean) ?? [],
}));

const UuidListSchema = z.array(z.string().uuid());

const crcTable = new Uint32Array(256);
for (let i = 0; i < crcTable.length; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[i] = c >>> 0;
}

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) {
    c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").trim() || "track";
}

function writeUInt16(value: number): Buffer {
  const buffer = Buffer.allocUnsafe(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
}

function writeUInt32(value: number): Buffer {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}

interface ZipEntry {
  filename: string;
  data: Buffer;
}

function buildZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.filename, "utf8");
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const localHeader = Buffer.concat([
      writeUInt32(0x04034b50),
      writeUInt16(20),
      writeUInt16(0x0800),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(crc),
      writeUInt32(size),
      writeUInt32(size),
      writeUInt16(name.length),
      writeUInt16(0),
      name,
    ]);
    localParts.push(localHeader, entry.data);

    centralParts.push(Buffer.concat([
      writeUInt32(0x02014b50),
      writeUInt16(20),
      writeUInt16(20),
      writeUInt16(0x0800),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(crc),
      writeUInt32(size),
      writeUInt32(size),
      writeUInt16(name.length),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(0),
      writeUInt32(offset),
      name,
    ]));
    offset += localHeader.length + size;
  }

  const central = Buffer.concat(centralParts);
  const end = Buffer.concat([
    writeUInt32(0x06054b50),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(entries.length),
    writeUInt16(entries.length),
    writeUInt32(central.length),
    writeUInt32(offset),
    writeUInt16(0),
  ]);

  return Buffer.concat([...localParts, central, end]);
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parsed = DownloadQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return Response.json({ error: "invalid query" }, { status: 400 });
  }

  const ids = UuidListSchema.safeParse(parsed.data.ids);
  if (!ids.success) {
    return Response.json({ error: "invalid track ids" }, { status: 400 });
  }

  const query = supabaseServer
    .from("ytmp3_tracks")
    .select("*")
    .order("created_at", { ascending: false });
  const { data, error } = ids.data.length > 0 ? await query.in("id", ids.data) : await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = z.array(YtmpTrackSchema).safeParse(data ?? []);
  if (!rows.success) {
    return Response.json({ error: "schema validation failed" }, { status: 500 });
  }
  if (rows.data.length === 0) {
    return Response.json({ error: "no tracks to download" }, { status: 404 });
  }

  const orderedRows = ids.data.length > 0
    ? ids.data
      .map((id) => rows.data.find((row) => row.id === id))
      .filter((row): row is z.infer<typeof YtmpTrackSchema> => Boolean(row))
    : rows.data;

  const entries: ZipEntry[] = [];
  for (let i = 0; i < orderedRows.length; i++) {
    const row = orderedRows[i];
    const source = resolveStoragePath(row.local_path);
    const baseName = sanitizeFilename(row.artist ? `${row.artist} - ${row.title}` : row.title);
    const filename = `${String(i + 1).padStart(3, "0")}_${baseName}.mp3`;
    entries.push({ filename, data: await readFile(/* turbopackIgnore: true */ source) });
  }

  const zip = buildZip(entries);
  const body = new ArrayBuffer(zip.length);
  new Uint8Array(body).set(zip);
  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="ytmp3-tracks-${Date.now()}.zip"`,
      "Content-Length": zip.length.toString(),
      "Cache-Control": "no-store",
    },
  });
}
