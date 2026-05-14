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

export async function copyInStorage(fromPath: string, toPath: string): Promise<void> {
  const { error } = await supabaseServer.storage
    .from(BUCKET)
    .copy(fromPath, toPath);
  if (error) throw new Error(`Storage copy failed [${fromPath} → ${toPath}]: ${error.message}`);
}

export async function listStorageFiles(prefix: string): Promise<string[]> {
  const { data, error } = await supabaseServer.storage
    .from(BUCKET)
    .list(prefix, { limit: 1000 });
  if (error) throw new Error(`Storage list failed [${prefix}]: ${error.message}`);
  return (data ?? []).map((f) => `${prefix}/${f.name}`);
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
