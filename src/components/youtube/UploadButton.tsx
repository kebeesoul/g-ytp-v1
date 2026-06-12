"use client";

import { useEffect, useState } from "react";
import { z } from "zod";

interface UploadButtonProps {
  exportId: string;
}

const ChannelSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  token_path: z.string(),
  authorized: z.boolean(),
});
const UploadResponseSchema = z.object({
  videoId: z.string(),
  studioUrl: z.string().url(),
  progress: z.number().optional(),
});
const AuthResponseSchema = z.object({
  ok: z.boolean(),
  tokenPath: z.string(),
});

type Channel = z.infer<typeof ChannelSchema>;

export function UploadButton({ exportId }: UploadButtonProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [studioUrl, setStudioUrl] = useState<string | null>(null);

  const selectedChannel = channels.find((channel) => channel.id === selectedChannelId) ?? null;

  async function loadChannels(): Promise<void> {
    setLoadingChannels(true);
    setError(null);
    try {
      const res = await fetch("/api/youtube/channels", { cache: "no-store" });
      const raw: unknown = await res.json();
      if (!res.ok) {
        const body = z.object({ error: z.string().optional() }).safeParse(raw);
        throw new Error(body.success ? body.data.error ?? `channels failed: ${res.status}` : `channels failed: ${res.status}`);
      }
      const parsed = z.array(ChannelSchema).parse(raw);
      setChannels(parsed);
      setSelectedChannelId((prev) => prev || (parsed[0]?.id ?? ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "채널 목록 로드 실패");
    } finally {
      setLoadingChannels(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => void loadChannels());
  }, []);

  async function handleAuth(): Promise<void> {
    if (!selectedChannel) return;
    setAuthenticating(true);
    setError(null);
    try {
      const res = await fetch(`/api/youtube/auth/${selectedChannel.id}`, { method: "POST" });
      const raw: unknown = await res.json();
      if (!res.ok) {
        const body = z.object({ error: z.string().optional() }).safeParse(raw);
        throw new Error(body.success ? body.data.error ?? `auth failed: ${res.status}` : `auth failed: ${res.status}`);
      }
      AuthResponseSchema.parse(raw);
      await loadChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : "인증 실패");
    } finally {
      setAuthenticating(false);
    }
  }

  async function handleUpload(): Promise<void> {
    if (!selectedChannel) return;
    if (!selectedChannel.authorized) {
      setError("선택한 채널 인증이 필요합니다");
      return;
    }
    setUploading(true);
    setError(null);
    setStudioUrl(null);
    try {
      const res = await fetch("/api/youtube/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exportId, channelId: selectedChannel.id }),
      });
      const raw: unknown = await res.json();
      if (!res.ok) {
        const body = z.object({ error: z.string().optional() }).safeParse(raw);
        throw new Error(body.success ? body.data.error ?? `upload failed: ${res.status}` : `upload failed: ${res.status}`);
      }
      const parsed = UploadResponseSchema.parse(raw);
      setStudioUrl(parsed.studioUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "YouTube 업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  if (loadingChannels) {
    return <p className="text-[11px] text-[var(--vm-subtle)]">YouTube 채널 로드 중...</p>;
  }

  if (channels.length === 0) {
    return (
      <div className="flex flex-col gap-1 text-[11px] text-[var(--vm-subtle)]">
        <span>YouTube 채널이 등록되지 않았습니다.</span>
        {error && <span className="text-[var(--vm-error)]">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <select
        value={selectedChannelId}
        onChange={(e) => {
          setSelectedChannelId(e.target.value);
          setStudioUrl(null);
          setError(null);
        }}
        disabled={uploading || authenticating}
        className="vm-input"
      >
        {channels.map((channel) => (
          <option key={channel.id} value={channel.id}>
            {channel.display_name}
          </option>
        ))}
      </select>

      {selectedChannel && !selectedChannel.authorized ? (
        <button
          onClick={() => void handleAuth()}
          disabled={authenticating}
          className="vm-button-secondary disabled:opacity-40"
        >
          {authenticating ? "인증 중..." : "인증 필요"}
        </button>
      ) : (
        <button
          onClick={() => void handleUpload()}
          disabled={uploading || !selectedChannel}
          className="vm-button-secondary text-[var(--vm-cyan)] disabled:opacity-40"
        >
          {uploading ? "YouTube 업로드 중..." : "YouTube 업로드"}
        </button>
      )}

      {uploading && (
        <div className="h-1 w-full overflow-hidden bg-[#202020]">
          <div className="h-full w-1/2 animate-pulse bg-[var(--vm-cyan)]" />
        </div>
      )}

      {studioUrl && (
        <a
          href={studioUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-[var(--vm-cyan)] underline"
        >
          비공개 업로드됨 → Studio에서 확인
        </a>
      )}

      {error && <p className="text-[11px] text-[var(--vm-error)]">{error}</p>}
    </div>
  );
}
