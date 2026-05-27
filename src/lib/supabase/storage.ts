import { supabaseServer } from "./server";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "g-ytp-v1";
const PUBLIC_BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ??
  process.env.SUPABASE_STORAGE_BUCKET ??
  "g-ytp-v1";

export async function uploadToStorage(
  path: string,
  data: Buffer | Uint8Array,
  contentType: string
): Promise<void> {
  const { error } = await supabaseServer.storage
    .from(BUCKET)
    .upload(path, data, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed [${path}]: ${error.message}`);
}

export async function downloadFromStorage(path: string): Promise<Buffer> {
  const { data, error } = await supabaseServer.storage
    .from(BUCKET)
    .download(path);
  if (error) throw new Error(`Storage download failed [${path}]: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

// Stream a storage file directly to disk without buffering the whole file in RAM.
// Uses a short-lived signed URL so the service role key is never used in raw fetch headers.
export async function downloadToFile(storagePath: string, localPath: string): Promise<void> {
  const { data: signed, error: signErr } = await supabaseServer.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60);
  if (signErr || !signed) {
    throw new Error(`Storage signed URL failed [${storagePath}]: ${signErr?.message}`);
  }

  const res = await fetch(signed.signedUrl);
  if (!res.ok || !res.body) {
    throw new Error(`Storage stream download failed [${storagePath}]: ${res.status}`);
  }

  const { createWriteStream } = await import("node:fs");
  const { pipeline } = await import("node:stream/promises");
  const { Readable } = await import("node:stream");

  await pipeline(
    Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(localPath)
  );
}

export async function copyInStorage(fromPath: string, toPath: string): Promise<void> {
  const { error } = await supabaseServer.storage
    .from(BUCKET)
    .copy(fromPath, toPath);
  if (error) throw new Error(`Storage copy failed [${fromPath} → ${toPath}]: ${error.message}`);
}

// Recursively lists all files under a storage prefix.
// Items with id === null and metadata === null are folders — traverse them depth-first.
export async function listStorageFiles(prefix: string): Promise<string[]> {
  const { data, error } = await supabaseServer.storage
    .from(BUCKET)
    .list(prefix, { limit: 1000 });
  if (error) throw new Error(`Storage list failed [${prefix}]: ${error.message}`);

  const results: string[] = [];
  for (const item of data ?? []) {
    const childPath = `${prefix}/${item.name}`;
    if (item.id === null && item.metadata === null) {
      // Supabase represents folders as items with no id/metadata — recurse
      const nested = await listStorageFiles(childPath);
      results.push(...nested);
    } else {
      results.push(childPath);
    }
  }
  return results;
}

export async function removeFromStorage(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabaseServer.storage.from(BUCKET).remove(paths);
  if (error) throw new Error(`Storage remove failed: ${error.message}`);
}

export function getPublicUrl(path: string): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${url}/storage/v1/object/public/${PUBLIC_BUCKET}/${path}`;
}
