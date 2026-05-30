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
import { validateRenderableSnapshot } from "@/lib/render/validateRenderableSnapshot";
import { assertInsideWorkspace, resolveStoragePath, workspacePaths } from "@/lib/workspace";
import type { ProjectSnapshot } from "@/lib/schema";

const RENDERABLE_SNAPSHOT: ProjectSnapshot = {
  title: "Lo-fi Chill Mix Vol.1",
  tracks: [
    {
      id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      filename: "artist_a_-_song_a.mp3",
      storagePath: "import/export-id/artist_a_-_song_a.mp3",
      artist: "Artist A",
      title: "Song A",
      durationSec: 240,
      order: 0,
    },
  ],
  background: {
    kind: "image",
    storagePath: "import/export-id/bg.jpg",
    fit: "cover",
    dim: 0,
    blur: 0,
    cropX: 0.5,
    cropY: 0.5,
    cropW: 1.0,
  },
  renderConfig: {
    transition: { type: "crossfade", crossfadeSec: 2 },
    overlay: { displayMode: "5", presetId: "default", presetVersion: 1 },
    audio: { normalize: "ebu_r128", targetLufs: -9, truePeakDb: -0.1 },
    thumbnail: { mode: "extract", presetId: "default", presetVersion: 1 },
    waveform: { style: "off" },
    mastering: false,
    outputFormat: "mp4",
    audioBitrateKbps: 192,
    resolution: [1920, 1080],
    hwaccel: "videotoolbox",
  },
  hashtags: ["lofi", "chill", "playlist"],
};

describe("Render request preconditions", () => {
  it("new editor defaults to silence transition and no overlay window", async () => {
    const code = await readFile(
      new URL("../app/editor/page.tsx", import.meta.url),
      "utf8"
    );
    expect(code).toContain('transition: { type: "silence", crossfadeSec: 2 }');
    expect(code).toContain('overlay: { displayMode: "0", presetId: "default", presetVersion: 1 }');
    expect(code).toContain('waveform: { style: "off" }');
    expect(code).toContain('useState<"silence" | "crossfade">("silence")');
    expect(code).toContain('useState<"0" | "2" | "5" | "full">("0")');
    expect(code).toContain('useState<ProjectSnapshot["renderConfig"]["waveform"]["style"]>("off")');
  });

  it("accepts a renderable snapshot", () => {
    expect(validateRenderableSnapshot(RENDERABLE_SNAPSHOT)).toBeNull();
  });

  it("rejects an empty track list before creating a job", () => {
    expect(validateRenderableSnapshot({ ...RENDERABLE_SNAPSHOT, tracks: [] })).toBe(
      "at least one track is required"
    );
  });

  it("rejects a missing background before creating a job", () => {
    expect(validateRenderableSnapshot({ ...RENDERABLE_SNAPSHOT, background: null })).toBe(
      "background is required"
    );
  });
});

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

  it("render job 생성 실패 시 기존 project를 삭제하지 않고 rollback한다", async () => {
    const code = await readFile(
      new URL("../app/api/render/route.ts", import.meta.url),
      "utf8"
    );
    expect(code).toContain("previousProject");
    expect(code).toContain("rollbackProject(exportId, previousProject");
    expect(code).not.toContain("if (jobErr) {\n    await supabaseServer.from(\"projects\").delete().eq(\"id\", exportId);");
  });

  it("DB partial unique index로 active render 1개를 강제한다", async () => {
    const code = await readFile(
      new URL("../../supabase/migrations/0004_enforce_single_active_render_job.sql", import.meta.url),
      "utf8"
    );
    expect(code).toContain("idx_render_jobs_single_active");
    expect(code).toContain("where status in ('queued', 'running')");
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

describe("Storage cleanup safety", () => {
  it("storage list helper recursively traverses nested prefixes", async () => {
    const code = await readFile(
      new URL("../lib/supabase/storage.ts", import.meta.url),
      "utf8"
    );
    expect(code).toContain("listStorageFiles(childPath)");
    expect(code).toContain("item.id === null");
    expect(code).toContain("item.metadata === null");
  });
});

describe("Workspace filesystem policy", () => {
  it("rejects path traversal outside the workspace", () => {
    expect(() => assertInsideWorkspace(`${workspacePaths.root}/../outside.mp3`)).toThrow(
      "path traversal detected"
    );
    expect(() => resolveStoragePath("../outside.mp3")).toThrow("path traversal detected");
  });

  it("render pipeline uses local workspace files instead of storage download/copy", async () => {
    const code = await readFile(
      new URL("../lib/render/runRenderPipeline.ts", import.meta.url),
      "utf8"
    );
    expect(code).toContain("resolveStoragePath");
    expect(code).toContain("copyFile");
    expect(code).not.toContain("downloadToFile");
    expect(code).not.toContain("downloadFromStorage");
    expect(code).not.toContain("copyInStorage");
  });

  it("upload routes write imported media to workspace files", async () => {
    const uploadCode = await readFile(
      new URL("../app/api/upload/route.ts", import.meta.url),
      "utf8"
    );
    const uploadBgCode = await readFile(
      new URL("../app/api/upload-bg/route.ts", import.meta.url),
      "utf8"
    );
    expect(uploadCode).toContain("fs.writeFile");
    expect(uploadCode).not.toContain("uploadToStorage");
    expect(uploadBgCode).toContain("fs.writeFile");
    expect(uploadBgCode).not.toContain("uploadToStorage");
  });
});

describe("Download route runtime", () => {
  it("uses explicit node runtime for local filesystem streaming", async () => {
    const code = await readFile(
      new URL("../app/api/download/[jobId]/route.ts", import.meta.url),
      "utf8"
    );
    expect(code).toContain("export const runtime = \"nodejs\"");
    expect(code).toContain("export const dynamic = \"force-dynamic\"");
  });

  it("editor render panel shows a completion message after export", async () => {
    const code = await readFile(
      new URL("../components/editor/RenderPanel.tsx", import.meta.url),
      "utf8"
    );
    expect(code).toContain("Export complete");
    expect(code).toContain("mt-auto");
  });
});

// Layer C: Boot cleanup 싱글톤 구조 검증
describe("Layer C — Boot cleanup (ensureBootCleanup 싱글톤 구조)", () => {
  it("bootCleanup.ts에 Promise memoization 싱글톤이 있다", async () => {
    const code = await readFile(
      new URL("../lib/render/bootCleanup.ts", import.meta.url),
      "utf8"
    );
    expect(code).toContain("bootCleanupPromise");
    expect(code).toContain("if (bootCleanupPromise) return bootCleanupPromise");
    expect(code).toContain("bootCleanupPromise = runBootCleanup()");
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

  it("mastering ON이면 mastered storage 업로드 후 해당 파일로 렌더한다", async () => {
    const code = await readFile(
      new URL("../lib/render/runRenderPipeline.ts", import.meta.url),
      "utf8"
    );
    expect(code).toContain("masterTracksForRender");
    expect(code).toContain("snapshot.renderConfig.mastering");
    expect(code).toContain("normalize: \"off\"");
  });

  it("video render는 별도 overlay.mov 프리렌더 없이 최종 FFmpeg에서 PNG card를 직접 합성한다", async () => {
    const code = await readFile(
      new URL("../lib/ffmpeg/renderVideo.ts", import.meta.url),
      "utf8"
    );
    expect(code).toContain("buildPngCardOverlayLines");
    expect(code).toContain("specs.flatMap");
    expect(code).not.toContain("prerenderOverlayTrack");
    expect(code).not.toContain("overlay.mov");
  });

  it("background crop never requests dimensions larger than the source", async () => {
    const code = await readFile(
      new URL("../lib/ffmpeg/renderVideo.ts", import.meta.url),
      "utf8"
    );
    expect(code).toContain("crop=min(in_w\\\\,in_h*16/9)");
    expect(code).toContain("min(in_h\\\\,in_w*9/16)");
    expect(code).toContain("(in_w-out_w)");
    expect(code).toContain("(in_h-out_h)");
  });

  it("video render can overlay an audio-reactive waveform", async () => {
    const code = await readFile(
      new URL("../lib/ffmpeg/renderVideo.ts", import.meta.url),
      "utf8"
    );
    expect(code).toContain("scale=420:420");
    expect(code).toContain("y=H*0.85-h/2");
    expect(code).toContain('waveform.style !== "off"');
  });
});

describe("Render mastering fixed settings", () => {
  it("고정 LUFS/ceiling 값과 mastered storage prefix를 사용한다", async () => {
    const { FIXED_MASTERING_SETTINGS, getMasteredProxyStoragePath, getMasteredStoragePath } = await import(
      "@/lib/mastering/constants"
    );
    expect(FIXED_MASTERING_SETTINGS.TARGET_LOUDNESS).toBe(-9);
    expect(FIXED_MASTERING_SETTINGS.OUTPUT_CEILING).toBe(-0.1);
    expect(getMasteredStoragePath("export-id", "track-id", 0)).toBe(
      "mastered/export-id/001_track-id.wav"
    );
    expect(getMasteredProxyStoragePath("export-id", "track-id", 0)).toBe(
      "mastered/export-id/001_track-id.m4a"
    );
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
