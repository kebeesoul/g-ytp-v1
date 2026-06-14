import { createReadStream, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { assertInsideWorkspace, workspacePaths } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Validates that the request carries the session cookie set at upload time.
function hasSessionCookie(req: Request, sessionId: string): boolean {
  const cookie = req.headers.get("cookie") ?? "";
  return cookie.split(";").some((c) => c.trim() === `ws-session-${sessionId}=1`);
}

// MIME types for workspace media files.
function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    aac: "audio/aac",
    ogg: "audio/ogg",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    mkv: "video/x-matroska",
  };
  return map[ext] ?? "application/octet-stream";
}

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

export async function GET(_req: Request, { params }: RouteParams): Promise<Response> {
  const { path: segments } = await params;
  const storagePath = segments.join("/");
  const relativePath = storagePath;
  const isSelectedThumbnail = relativePath.startsWith("thumbnail/selected/");

  // Session ownership check for import paths.
  // import/{sessionId}/... — the session cookie must have been set by /api/upload or /api/upload-bg.
  if (segments[0] === "import" && !isSelectedThumbnail) {
    const sessionId = segments[1];
    if (!sessionId || !hasSessionCookie(_req, sessionId)) {
      return new Response("forbidden", { status: 403 });
    }
  }

  const absPath = join(workspacePaths.root, storagePath);

  try {
    assertInsideWorkspace(absPath);
  } catch {
    return new Response("forbidden", { status: 403 });
  }

  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(absPath);
  } catch {
    return new Response("not found", { status: 404 });
  }

  if (!stat.isFile()) {
    return new Response("not found", { status: 404 });
  }

  const mimeType = getMimeType(absPath);
  const stream = createReadStream(absPath);
  const webStream = Readable.toWeb(stream) as ReadableStream;

  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(stat.size),
      "Cache-Control": "no-store",
    },
  });
}
