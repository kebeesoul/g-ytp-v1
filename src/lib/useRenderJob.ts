"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActiveRenderSchema, type ProjectSnapshot } from "@/lib/schema";

const LS_KEY = "gytpv1:active-render";
const POLL_INTERVAL_MS = 5000;  // §14: 폴링 간격 정확히 5초

export interface JobStatus {
  id: string;
  status: "queued" | "running" | "done" | "error";
  progress: number;
  eta_sec: number | null;
  error_msg: string | null;
  output_path: string | null;
}

export interface UseRenderJobResult {
  jobId: string | null;
  status: JobStatus | null;
  submitting: boolean;
  cancelling: boolean;
  error: string | null;
  startRender: (snapshot: ProjectSnapshot, exportId: string) => Promise<void>;
  cancelRender: () => Promise<void>;
  clear: () => void;
}

// localStorage A안 + 5초 폴링 + 페이지 복귀 시 hydrate
export function useRenderJob(): UseRenderJobResult {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async (id: string): Promise<JobStatus | null> => {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(`/api/render-status/${id}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (res.status === 404) {
        // DB에 없음 → localStorage 정리 (§9.1 매트릭스 마지막 행)
        localStorage.removeItem(LS_KEY);
        setJobId(null);
        setStatus(null);
        return null;
      }
      if (!res.ok) return null;
      const data = (await res.json()) as JobStatus;
      setStatus(data);
      return data;
    } catch {
      return null;
    } finally {
      clearTimeout(tid);
    }
  }, []);

  // 마운트 시 localStorage hydrate (§9.1 — 페이지 이탈/복귀)
  useEffect(() => {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    try {
      const parsed = ActiveRenderSchema.parse(JSON.parse(raw));
      queueMicrotask(() => setJobId(parsed.jobId));
      queueMicrotask(() => void fetchStatus(parsed.jobId));
    } catch {
      localStorage.removeItem(LS_KEY);
    }
  }, [fetchStatus]);

  // 폴링 — status가 queued/running일 때만 5초마다
  // status?.status (string primitive)를 dep으로 써서 같은 상태값이면 interval 재생성 안 함
  useEffect(() => {
    if (!jobId || !status) return;
    if (status.status === "done" || status.status === "error") {
      localStorage.removeItem(LS_KEY);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    pollRef.current = setInterval(() => {
      void fetchStatus(jobId);
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, status?.status, fetchStatus]);

  const startRender = useCallback(
    async (snapshot: ProjectSnapshot, exportId: string): Promise<void> => {
      setError(null);
      setSubmitting(true);
      try {
        const res = await fetch("/api/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshot, exportId }),
        });
        const body = (await res.json()) as { jobId?: string; exportId?: string; error?: string };
        if (!res.ok || !body.jobId) {
          throw new Error(body.error ?? `render failed: ${res.status}`);
        }

        // A안: jobId 수신 후에만 localStorage 저장 (§14, §17.4)
        localStorage.setItem(
          LS_KEY,
          JSON.stringify({ exportId, jobId: body.jobId })
        );

        setJobId(body.jobId);
        setStatus({
          id: body.jobId,
          status: "queued",
          progress: 0,
          eta_sec: null,
          error_msg: null,
          output_path: null,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "render request failed");
      } finally {
        setSubmitting(false);
      }
    },
    []
  );

  const clear = useCallback(() => {
    localStorage.removeItem(LS_KEY);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setJobId(null);
    setStatus(null);
    setError(null);
  }, []);

  const cancelRender = useCallback(async (): Promise<void> => {
    if (!jobId) return;
    setCancelling(true);
    try {
      await fetch(`/api/render-cancel/${jobId}`, { method: "POST" });
    } finally {
      setCancelling(false);
      clear();
    }
  }, [jobId, clear]);

  return { jobId, status, submitting, cancelling, error, startRender, cancelRender, clear };
}
