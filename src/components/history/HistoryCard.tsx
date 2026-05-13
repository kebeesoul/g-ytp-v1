"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { ProjectRecord } from "@/lib/schema";
import { getPublicUrl } from "@/lib/supabase/storage";

interface HistoryCardProps {
  record: ProjectRecord;
  onDeleted: (id: string) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function HistoryCard({ record, onDeleted }: HistoryCardProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const thumbUrl = record.thumbnail_path ? getPublicUrl(record.thumbnail_path) : null;

  async function handleDelete(): Promise<void> {
    if (!window.confirm(`"${record.title}" 프로젝트를 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/project/${record.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `삭제 실패: ${res.status}`);
      }
      onDeleted(record.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col rounded-lg border border-gray-700 bg-gray-900 overflow-hidden">
      <div className="relative w-full aspect-video bg-gray-800">
        {thumbUrl ? (
          <Image
            src={thumbUrl}
            alt={record.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-600 text-sm">
            썸네일 없음
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 p-3">
        <p className="font-medium text-sm text-white truncate">{record.title}</p>
        <p className="text-xs text-gray-400">{formatDate(record.exported_at)}</p>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={() => router.push(`/editor?from=${record.id}`)}
            className="flex-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
          >
            편집
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 rounded bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-200 hover:bg-red-700 disabled:opacity-40"
          >
            {deleting ? "삭제 중..." : "삭제"}
          </button>
        </div>
      </div>
    </div>
  );
}
