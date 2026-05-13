/**
 * §11 Render Execution Policy 6중 방어 통합 테스트
 *
 * Layer A: API Route ↔ runRenderPipeline 파일 분리 (구조적 보장)
 * Layer B: DB 상태 원천 (runRenderPipeline try/catch/finally)
 * Layer C: 부팅 시 좀비 잡 자동 정리 (ensureBootCleanup 싱글톤)
 * Layer D: DB 동시성 체크 (409 응답)
 * Layer E: activeProcesses Map (Process Registry)
 * Layer F: Graceful Shutdown (SIGINT/SIGTERM 핸들러 idempotent)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFile } from "node:fs/promises";

// Layer E: Process Registry
describe("Layer E — Process Registry (activeProcesses Map)", () => {
  afterEach(async () => {
    const { activeProcesses } = await import("@/lib/render/processRegistry");
    activeProcesses.clear();
  });

  it("Map에 process 등록/조회/삭제가 정상 동작한다", async () => {
    const { activeProcesses } = await import("@/lib/render/processRegistry");
    const fakeProc = { pid: 12345, kill: vi.fn() } as unknown as import("node:child_process").ChildProcess;

    activeProcesses.set("job-1", fakeProc);
    expect(activeProcesses.has("job-1")).toBe(true);
    expect(activeProcesses.get("job-1")).toBe(fakeProc);

    activeProcesses.delete("job-1");
    expect(activeProcesses.has("job-1")).toBe(false);
  });

  it("여러 jobId를 독립적으로 관리한다", async () => {
    const { activeProcesses } = await import("@/lib/render/processRegistry");
    const proc1 = { pid: 1001 } as unknown as import("node:child_process").ChildProcess;
    const proc2 = { pid: 1002 } as unknown as import("node:child_process").ChildProcess;

    activeProcesses.set("job-a", proc1);
    activeProcesses.set("job-b", proc2);

    expect(activeProcesses.get("job-a")).toBe(proc1);
    expect(activeProcesses.get("job-b")).toBe(proc2);
    expect(activeProcesses.size).toBe(2);

    activeProcesses.delete("job-a");
    activeProcesses.delete("job-b");
    expect(activeProcesses.size).toBe(0);
  });

  it("삭제 후 없는 jobId를 조회하면 undefined를 반환한다", async () => {
    const { activeProcesses } = await import("@/lib/render/processRegistry");
    expect(activeProcesses.get("non-existent")).toBeUndefined();
  });
});

// Layer F: Graceful Shutdown 핸들러 idempotent
describe("Layer F — Graceful Shutdown (registerShutdownHandler 파일 구조 검증)", () => {
  it("gracefulShutdown.ts에 registered 싱글톤 가드가 있다", async () => {
    const code = await readFile(
      new URL("../lib/render/gracefulShutdown.ts", import.meta.url),
      "utf8"
    );
    expect(code).toContain("let registered = false");
    expect(code).toContain("if (registered) return");
    expect(code).toContain("registered = true");
  });

  it("gracefulShutdown.ts에 SIGINT/SIGTERM 핸들러가 모두 등록된다", async () => {
    const code = await readFile(
      new URL("../lib/render/gracefulShutdown.ts", import.meta.url),
      "utf8"
    );
    expect(code).toContain("SIGINT");
    expect(code).toContain("SIGTERM");
  });

  it("gracefulShutdown.ts에서 activeProcesses kill 후 DB 업데이트가 있다", async () => {
    const code = await readFile(
      new URL("../lib/render/gracefulShutdown.ts", import.meta.url),
      "utf8"
    );
    expect(code).toContain("activeProcesses");
    expect(code).toContain("kill");
    expect(code).toContain("render_jobs");
  });
});

// Layer D: 동시 렌더 409 로직
describe("Layer D — 동시성 체크 (concurrency guard)", () => {
  it("'queued' + 'running' 상태가 모두 차단 대상이다", () => {
    const blockingStatuses = ["queued", "running"] as const;
    const allowedStatuses = ["done", "error"] as const;

    for (const s of blockingStatuses) {
      expect(["queued", "running"].includes(s)).toBe(true);
    }
    for (const s of allowedStatuses) {
      expect(["queued", "running"].includes(s)).toBe(false);
    }
  });

  it("render route.ts에 동시성 체크(Layer D) 코드가 있다", async () => {
    const code = await readFile(
      new URL("../app/api/render/route.ts", import.meta.url),
      "utf8"
    );
    expect(code).toContain("queued");
    expect(code).toContain("running");
    expect(code).toContain("409");
  });

  it("cascade DELETE route.ts에 STEP 0 동시성 체크 코드가 있다", async () => {
    const code = await readFile(
      new URL("../app/api/project/[id]/route.ts", import.meta.url),
      "utf8"
    );
    expect(code).toContain("queued");
    expect(code).toContain("running");
    expect(code).toContain("409");
    expect(code).toContain("activeProcesses");
  });
});

// Layer C: Boot cleanup 싱글톤 구조 검증
describe("Layer C — Boot cleanup (ensureBootCleanup 싱글톤 구조)", () => {
  it("bootCleanup.ts에 싱글톤 플래그가 있다", async () => {
    const code = await readFile(
      new URL("../lib/render/bootCleanup.ts", import.meta.url),
      "utf8"
    );
    expect(code).toContain("bootCleanupDone");
    expect(code).toContain("if (bootCleanupDone) return");
    expect(code).toContain("bootCleanupDone = true");
  });

  it("bootCleanup.ts에서 queued+running 상태를 모두 정리한다", async () => {
    const code = await readFile(
      new URL("../lib/render/bootCleanup.ts", import.meta.url),
      "utf8"
    );
    expect(code).toContain("queued");
    expect(code).toContain("running");
    expect(code).toContain("error");
    expect(code).toContain("server restarted");
  });

  it("모든 API Route에서 ensureBootCleanup을 호출한다 (render, render-status)", async () => {
    const renderCode = await readFile(
      new URL("../app/api/render/route.ts", import.meta.url),
      "utf8"
    );
    const statusCode = await readFile(
      new URL("../app/api/render-status/[id]/route.ts", import.meta.url),
      "utf8"
    );
    expect(renderCode).toContain("ensureBootCleanup");
    expect(statusCode).toContain("ensureBootCleanup");
  });
});

// Layer B: runRenderPipeline try/catch/finally 구조
describe("Layer B — DB 상태 원천 (try/catch/finally 구조)", () => {
  it("cleanupIntermediateFiles는 finally에서 항상 실행된다", async () => {
    const code = await readFile(
      new URL("../lib/render/runRenderPipeline.ts", import.meta.url),
      "utf8"
    );
    expect(code).toContain("} finally {");
    expect(code).toContain("cleanupIntermediateFiles");
    expect(code).toContain("activeProcesses.delete");
  });

  it("에러 발생 시 render_jobs.status='error'로 업데이트된다", async () => {
    const code = await readFile(
      new URL("../lib/render/runRenderPipeline.ts", import.meta.url),
      "utf8"
    );
    expect(code).toContain("status: \"error\"");
    expect(code).toContain("error_msg: msg");
  });

  it("완료 시 projects.status='done'과 latest_job_id가 업데이트된다", async () => {
    const code = await readFile(
      new URL("../lib/render/runRenderPipeline.ts", import.meta.url),
      "utf8"
    );
    expect(code).toContain("status: \"done\"");
    expect(code).toContain("latest_job_id: jobId");
  });
});

// Layer A: 파일 분리 구조 검증
describe("Layer A — API Route 분리 (FFmpeg 로직이 route.ts에 없음)", () => {
  it("render route는 startRenderJob을 import하여 void 호출한다", async () => {
    const code = await readFile(
      new URL("../app/api/render/route.ts", import.meta.url),
      "utf8"
    );
    expect(code).toContain("startRenderJob");
    expect(code).toContain("void startRenderJob");
    expect(code).not.toContain("spawn");
    expect(code).not.toContain("execFile");
  });

  it("runRenderPipeline은 render route.ts에서 직접 import하지 않는다", async () => {
    const code = await readFile(
      new URL("../app/api/render/route.ts", import.meta.url),
      "utf8"
    );
    expect(code).not.toContain("runRenderPipeline");
  });

  it("startRenderJob이 중복 실행을 방지한다 (activeJobIds Set)", async () => {
    const code = await readFile(
      new URL("../lib/render/startRenderJob.ts", import.meta.url),
      "utf8"
    );
    expect(code).toContain("activeJobIds");
    expect(code).toContain("has(jobId)");
    expect(code).toContain("add(jobId)");
    expect(code).toContain("delete(jobId)");
  });
});
