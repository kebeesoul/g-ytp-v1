"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { YtmpJobSchema, YtmpTrackSchema } from "@/lib/ytmp3/schema";

const StatusResponseSchema = z.object({
  job: YtmpJobSchema,
  tracks: z.array(YtmpTrackSchema),
  waitingForRender: z.boolean(),
});

type StatusResponse = z.infer<typeof StatusResponseSchema>;

interface ExtractQueueProps {
  jobIds: string[];
  onJobDone: () => void;
}

export function ExtractQueue({ jobIds, onJobDone }: ExtractQueueProps) {
  const [statuses, setStatuses] = useState<Record<string, StatusResponse>>({});
  const [reportedDone, setReportedDone] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (jobIds.length === 0) return;
    let cancelled = false;

    async function load(): Promise<void> {
      const next: Record<string, StatusResponse> = {};
      for (const jobId of jobIds) {
        const res = await fetch(`/api/ytmp3/status/${jobId}`, { cache: "no-store" });
        const raw: unknown = await res.json();
        if (!res.ok) continue;
        next[jobId] = StatusResponseSchema.parse(raw);
      }
      if (!cancelled) {
        setStatuses(next);
        for (const [jobId, status] of Object.entries(next)) {
          if (status.job.status === "done" && !reportedDone.has(jobId)) {
            setReportedDone((prev) => new Set(prev).add(jobId));
            onJobDone();
          }
        }
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [jobIds, onJobDone, reportedDone]);

  if (jobIds.length === 0) return null;

  return (
    <section className="vm-panel vm-panel-pad flex flex-col gap-3">
      <span className="vm-label">Extract Queue</span>
      <div className="flex flex-col gap-2">
        {jobIds.map((jobId) => {
          const status = statuses[jobId];
          if (!status) {
            return <p key={jobId} className="text-xs text-[var(--vm-subtle)]">상태 로드 중...</p>;
          }
          const job = status.job;
          const total = job.total_count ?? 0;
          const done = job.done_count ?? 0;
          return (
            <div key={jobId} className="flex flex-col gap-1 border border-[var(--vm-border)] px-3 py-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white">{job.url_type === "playlist" ? "재생목록" : "단일 영상"}</span>
                <span className="text-[var(--vm-subtle)]">{job.status}</span>
              </div>
              {status.waitingForRender && (
                <p className="text-[11px] text-[var(--vm-amber)]">렌더 진행 중 — 대기 중</p>
              )}
              {job.status === "extracting" && (
                <p className="text-[11px] text-[var(--vm-subtle)]">extracting {done}/{total}</p>
              )}
              {job.status === "error" && job.error_msg && (
                <p className="text-[11px] text-[var(--vm-error)]">{job.error_msg}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
