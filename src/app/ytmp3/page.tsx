"use client";

import { useState } from "react";
import { ExtractedTrackList } from "@/components/ytmp3/ExtractedTrackList";
import { ExtractQueue } from "@/components/ytmp3/ExtractQueue";
import { YtmpExtractor } from "@/components/ytmp3/YtmpExtractor";

export default function Ytmp3Page() {
  const [jobIds, setJobIds] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <section className="flex flex-col gap-2">
        <span className="vm-label">YTMP3</span>
        <h1 className="text-2xl font-semibold text-white">YouTube to mp3</h1>
        <p className="max-w-2xl text-sm text-[var(--vm-subtle)]">렌더 진행 중에는 추출이 대기 상태로 유지됩니다.</p>
      </section>

      <YtmpExtractor
        onStarted={(jobId) => {
          setJobIds((prev) => [jobId, ...prev.filter((id) => id !== jobId)]);
        }}
      />
      <ExtractQueue
        jobIds={jobIds}
        onJobDone={() => setRefreshKey((key) => key + 1)}
      />
      <ExtractedTrackList refreshKey={refreshKey} />
    </div>
  );
}
