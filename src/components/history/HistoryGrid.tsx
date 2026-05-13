"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { ProjectRecordSchema, type ProjectRecord } from "@/lib/schema";
import { HistoryCard } from "./HistoryCard";

export function HistoryGrid() {
  const [records, setRecords] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/project");
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error ?? `목록 로드 실패: ${res.status}`);
        }
        const raw: unknown = await res.json();
        const parsed = z.array(ProjectRecordSchema).parse(raw);
        if (!cancelled) {
          setRecords(parsed);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "목록 로드 실패");
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function handleDeleted(id: string) {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  }

  if (loading) {
    return <p className="text-sm text-gray-500">프로젝트 목록 로드 중...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (records.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        완료된 프로젝트가 없습니다. Export를 완료하면 여기에 표시됩니다.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {records.map((record) => (
        <HistoryCard key={record.id} record={record} onDeleted={handleDeleted} />
      ))}
    </div>
  );
}
