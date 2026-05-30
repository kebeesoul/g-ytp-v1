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

export async function GET(
  _req: Request,
  { params }: RouteParams
): Promise<Response> {
  const { path } = await params;
  const relativePath = path.join("/");
  if (
    !relativePath.startsWith("import/") &&
    !relativePath.startsWith("export/") &&
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

  const fileStream = createReadStream(/* turbopackIgnore: true */ filePath);
  const readable = new ReadableStream({
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

  return new Response(readable, {
    headers: {
      "Content-Type": contentTypeForPath(relativePath),
      "Content-Length": fileSize.toString(),
      "Cache-Control": "no-store",
    },
  });
}
