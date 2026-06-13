"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import { detectYtmpUrlType } from "@/lib/ytmp3/schema";

const MAX_URLS = 20;

const ExtractResponseSchema = z.object({
  jobId: z.string().uuid(),
});

interface YtmpExtractorProps {
  onStarted: (jobId: string) => void;
}

export function YtmpExtractor({ onStarted }: YtmpExtractorProps) {
  const [urls, setUrls] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => urls.map((url) => {
    try {
      return { url, urlType: url.trim() ? detectYtmpUrlType(url.trim()) : null };
    } catch {
      return { url, urlType: null };
    }
  }), [urls]);

  const validUrls = rows
    .map((row) => row.url.trim())
    .filter((url) => {
      try {
        z.string().url().parse(url);
        return true;
      } catch {
        return false;
      }
    });

  function updateUrl(index: number, value: string): void {
    setUrls((prev) => prev.map((url, i) => (i === index ? value : url)));
  }

  function addUrlRow(): void {
    setUrls((prev) => (prev.length >= MAX_URLS ? prev : [...prev, ""]));
  }

  function removeUrlRow(index: number): void {
    setUrls((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [""];
    });
  }

  async function handleSubmit(): Promise<void> {
    const targets = Array.from(new Set(validUrls)).slice(0, MAX_URLS);
    if (targets.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      for (const url of targets) {
        const res = await fetch("/api/ytmp3/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const raw: unknown = await res.json();
        if (!res.ok) {
          const body = z.object({ error: z.string().optional() }).safeParse(raw);
          throw new Error(body.success ? body.data.error ?? `extract failed: ${res.status}` : `extract failed: ${res.status}`);
        }
        const parsed = ExtractResponseSchema.parse(raw);
        onStarted(parsed.jobId);
      }
      setUrls([""]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "추출 요청 실패");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="vm-panel vm-panel-pad flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <span className="vm-label">Source URL</span>
          <span className="text-[11px] text-[var(--vm-subtle)]">{validUrls.length}/{MAX_URLS}</span>
        </div>
        <div className="max-h-72 overflow-y-auto border border-[var(--vm-border)]">
          <div className="grid grid-cols-[40px_minmax(0,1fr)_86px_44px] border-b border-[var(--vm-border)] bg-[#0b0b0b] px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-[var(--vm-muted)]">
            <span>#</span>
            <span>URL</span>
            <span>Type</span>
            <span />
          </div>
          {rows.map((row, index) => (
            <div key={index} className="grid grid-cols-[40px_minmax(0,1fr)_86px_44px] items-center gap-2 border-b border-[var(--vm-border)] px-3 py-2 last:border-b-0">
              <span className="text-xs text-[var(--vm-subtle)]">{index + 1}</span>
              <input
                value={row.url}
                onChange={(e) => updateUrl(index, e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="vm-input min-w-0"
              />
              <span className="text-[11px] text-[var(--vm-subtle)]">
                {row.urlType ? (row.urlType === "playlist" ? "재생목록" : "단일") : "대기"}
              </span>
              <button
                onClick={() => removeUrlRow(index)}
                disabled={urls.length === 1}
                className="vm-button-secondary px-2 disabled:opacity-30"
              >
                -
              </button>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={addUrlRow}
            disabled={urls.length >= MAX_URLS}
            className="vm-button-secondary disabled:opacity-40"
          >
            URL 추가
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={submitting || validUrls.length === 0}
            className="vm-button-primary disabled:opacity-40"
          >
            {submitting ? "추출 요청 중..." : "추출"}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-[var(--vm-error)]">{error}</p>}
    </section>
  );
}
