import { supabaseServer } from "./server";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "g-ytp-v1";

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
