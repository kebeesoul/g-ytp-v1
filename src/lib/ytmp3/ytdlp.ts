import { mkdir, stat } from "node:fs/promises";
import { basename } from "node:path";
import { execa } from "execa";
import { parseFile } from "music-metadata";
import { z } from "zod";
import { assertInsideWorkspace, workspacePaths } from "@/lib/workspace";
import { detectYtmpUrlType, type YtmpUrlType } from "@/lib/ytmp3/schema";

const YTDLP = process.env.YTDLP_PATH ?? "yt-dlp";
const NICE = process.env.NICE_PATH ?? "nice";

const YtdlpEntrySchema = z.object({
  id: z.string().optional(),
  url: z.string().optional(),
  webpage_url: z.string().optional(),
  title: z.string().optional(),
  duration: z.number().optional(),
});

export interface Ytmp3SourceEntry {
  youtubeId: string;
  title: string;
  url: string;
  durationSec?: number;
}

export interface Ytmp3ExtractedTrack {
  id: string;
  youtubeId: string;
  artist: string;
  title: string;
  durationSec?: number;
  localPath: string;
}

function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

function parseJsonLines(stdout: string): Ytmp3SourceEntry[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => YtdlpEntrySchema.parse(JSON.parse(line)))
    .map((entry) => {
      const youtubeId = entry.id ?? entry.url ?? crypto.randomUUID();
      const url = entry.webpage_url ?? (entry.url?.startsWith("http") ? entry.url : youtubeWatchUrl(youtubeId));
      return {
        youtubeId,
        title: entry.title ?? youtubeId,
        url,
        durationSec: entry.duration,
      };
    });
}

export async function listYtmp3SourceEntries(url: string): Promise<{
  urlType: YtmpUrlType;
  entries: Ytmp3SourceEntry[];
}> {
  const urlType = detectYtmpUrlType(url);
  const { stdout } = await execa(YTDLP, ["--dump-json", "--flat-playlist", url]);
  const entries = parseJsonLines(stdout);
  if (entries.length === 0) {
    throw new Error("yt-dlp returned no entries");
  }
  return { urlType, entries: urlType === "single" ? [entries[0]] : entries };
}

function splitArtistTitle(rawTitle: string): { artist: string; title: string } {
  const parts = rawTitle.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) {
    return {
      artist: parts[0].trim(),
      title: parts.slice(1).join(" - ").trim(),
    };
  }
  return { artist: "", title: rawTitle.trim() || "Untitled" };
}

async function getMp3Metadata(filePath: string, fallbackTitle: string, fallbackDuration?: number): Promise<{
  artist: string;
  title: string;
  durationSec?: number;
}> {
  try {
    const meta = await parseFile(filePath);
    const parsed = splitArtistTitle(fallbackTitle);
    return {
      artist: meta.common.artist ?? meta.common.artists?.join(", ") ?? parsed.artist,
      title: meta.common.title ?? parsed.title,
      durationSec: meta.format.duration ?? fallbackDuration,
    };
  } catch {
    const parsed = splitArtistTitle(fallbackTitle);
    return {
      ...parsed,
      durationSec: fallbackDuration,
    };
  }
}

export async function extractYtmp3Entry(entry: Ytmp3SourceEntry): Promise<Ytmp3ExtractedTrack> {
  const trackId = crypto.randomUUID();
  const outDir = workspacePaths.ytmp3Dir();
  const localFile = workspacePaths.ytmp3File(trackId);
  assertInsideWorkspace(outDir);
  assertInsideWorkspace(localFile);
  await mkdir(outDir, { recursive: true });

  await execa(NICE, [
    "-n",
    "10",
    YTDLP,
    "-x",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "0",
    "-o",
    `${outDir}/${trackId}.%(ext)s`,
    entry.url,
  ]);

  const fileInfo = await stat(localFile);
  if (!fileInfo.isFile()) {
    throw new Error(`mp3 output missing: ${basename(localFile)}`);
  }

  const metadata = await getMp3Metadata(localFile, entry.title, entry.durationSec);
  return {
    id: trackId,
    youtubeId: entry.youtubeId,
    artist: metadata.artist,
    title: metadata.title,
    durationSec: metadata.durationSec,
    localPath: `ytmp3/${trackId}.mp3`,
  };
}

export async function extractYtmp3(url: string): Promise<{
  urlType: YtmpUrlType;
  tracks: Ytmp3ExtractedTrack[];
}> {
  const source = await listYtmp3SourceEntries(url);
  const tracks = await extractYtmp3Entries(source.entries);
  return { urlType: source.urlType, tracks };
}

export async function extractYtmp3Entries(entries: Ytmp3SourceEntry[]): Promise<Ytmp3ExtractedTrack[]> {
  const tracks: Ytmp3ExtractedTrack[] = [];
  for (const entry of entries) {
    tracks.push(await extractYtmp3Entry(entry));
  }
  return tracks;
}
