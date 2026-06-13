import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolveStoragePath } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

function contentTypeForPath(pathname: string): string {
  const ext = pathname.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "mp4") return "video/mp4";
  if (ext === "mov") return "video/quicktime";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "m4a" || ext === "aac") return "audio/mp4";
  if (ext === "wav") return "audio/wav";
  if (ext === "flac") return "audio/flac";
  if (ext === "ogg") return "audio/ogg";
  return "application/octet-stream";
}

function streamFile(filePath: string, range?: { start: number; end: number }): ReadableStream<Uint8Array> {
  const fileStream = createReadStream(
    /* turbopackIgnore: true */ filePath,
    range ? { start: range.start, end: range.end } : undefined
  );
  return new ReadableStream({
    start(controller) {
      fileStream.on("data", (chunk) =>
        controller.enqueue(chunk instanceof Buffer ? chunk : Buffer.from(chunk))
      );
      fileStream.on("end", () => controller.close());
      fileStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      fileStream.destroy();
    },
  });
}

function parseRange(rangeHeader: string | null, fileSize: number): { start: number; end: number } | null {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) return null;

  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) return null;

  if (!startRaw) {
    const suffixLength = Number.parseInt(endRaw, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    const start = Math.max(fileSize - suffixLength, 0);
    return { start, end: fileSize - 1 };
  }

  const start = Number.parseInt(startRaw, 10);
  const end = endRaw ? Number.parseInt(endRaw, 10) : fileSize - 1;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    return null;
  }

  return { start, end: Math.min(end, fileSize - 1) };
}

export async function GET(
  req: Request,
  { params }: RouteParams
): Promise<Response> {
  const { path } = await params;
  const relativePath = path.join("/");
  if (
    !relativePath.startsWith("import/") &&
    !relativePath.startsWith("export/") &&
    !relativePath.startsWith("ytmp3/") &&
    !relativePath.startsWith("thumbnail/photos/") &&
    !relativePath.startsWith("thumbnail/selected/")
  ) {
    return Response.json({ error: "invalid workspace path" }, { status: 400 });
  }

  const filePath = resolveStoragePath(relativePath);
  let fileSize: number;
  try {
    const info = await stat(/* turbopackIgnore: true */ filePath);
    if (!info.isFile()) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    fileSize = info.size;
  } catch {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const headers = new Headers({
    "Content-Type": contentTypeForPath(relativePath),
    "Content-Length": fileSize.toString(),
    "Cache-Control": "no-store",
    "Accept-Ranges": "bytes",
  });
  if (url.searchParams.get("download") === "1") {
    headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(relativePath.split("/").at(-1) ?? "download")}"`);
  }

  const requestedRange = req.headers.get("range");
  if (requestedRange) {
    const range = parseRange(requestedRange, fileSize);
    if (!range) {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${fileSize}`,
          "Accept-Ranges": "bytes",
        },
      });
    }

    headers.set("Content-Length", String(range.end - range.start + 1));
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${fileSize}`);
    return new Response(streamFile(filePath, range), {
      status: 206,
      headers,
    });
  }

  return new Response(streamFile(filePath), {
    headers,
  });
}
