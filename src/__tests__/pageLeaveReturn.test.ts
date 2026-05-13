/**
 * §9.1 페이지 이탈/복귀 시나리오 매트릭스 6케이스 검증
 *
 * 시나리오:
 * 1. 신규 진입 (localStorage 없음) → 빈 Editor
 * 2. 렌더 중 복귀 (localStorage 있음, status='running') → 폴링 재개
 * 3. 렌더 완료 후 복귀 (status='done') → 다운로드, LS 정리
 * 4. 에러 후 복귀 (status='error') → 에러 표시, LS 정리
 * 5. 서버 재시작 후 복귀 (status='running', in-memory 없음) → 좀비 감지 → error
 * 6. localStorage 있지만 DB에 없음 (404) → LS 정리, 빈 Editor
 */
import { describe, it, expect } from "vitest";
import { ActiveRenderSchema } from "@/lib/schema";
import { classifyRenderStatus, type RenderStatusResponse } from "@/lib/render/classifyRenderStatus";

// Zod v4 UUID는 variant bits 필요 ([89abAB] 시작)
const VALID_LS = {
  exportId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  jobId:    "f47ac10b-58cc-4372-a567-0e02b2c3d480",
};

const JOB_ID = VALID_LS.jobId;

const BASE_STATUS: RenderStatusResponse = {
  id: JOB_ID,
  status: "running",
  progress: 0.3,
  eta_sec: 60,
  error_msg: null,
  output_path: null,
};

// ActiveRenderSchema 검증
describe("ActiveRenderSchema", () => {
  it("valid localStorage 포맷 파싱 성공", () => {
    const r = ActiveRenderSchema.safeParse(VALID_LS);
    expect(r.success).toBe(true);
  });

  it("jobId 누락 시 파싱 실패", () => {
    const r = ActiveRenderSchema.safeParse({ exportId: VALID_LS.exportId });
    expect(r.success).toBe(false);
  });

  it("UUID 형식 아닐 때 파싱 실패", () => {
    const r = ActiveRenderSchema.safeParse({ exportId: "not-a-uuid", jobId: "also-not" });
    expect(r.success).toBe(false);
  });

  it("빈 객체 파싱 실패", () => {
    const r = ActiveRenderSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

// §9.1 6케이스
describe("§9.1 페이지 이탈/복귀 시나리오 매트릭스", () => {
  it("케이스 1: localStorage 없음 → no_ls (빈 Editor)", () => {
    const result = classifyRenderStatus(false, null, null, false);
    expect(result).toBe("no_ls");
  });

  it("케이스 2: localStorage 있음 + status='running' + in-memory 있음 → running (폴링 재개)", () => {
    const result = classifyRenderStatus(true, 200, { ...BASE_STATUS, status: "running" }, true);
    expect(result).toBe("running");
  });

  it("케이스 2b: localStorage 있음 + status='queued' + in-memory 있음 → running (폴링 재개)", () => {
    const result = classifyRenderStatus(true, 200, { ...BASE_STATUS, status: "queued" }, true);
    expect(result).toBe("running");
  });

  it("케이스 3: localStorage 있음 + status='done' → done (다운로드, LS 정리)", () => {
    const result = classifyRenderStatus(true, 200, { ...BASE_STATUS, status: "done", progress: 1, eta_sec: null, output_path: "/tmp/final.mp4" }, true);
    expect(result).toBe("done");
  });

  it("케이스 4: localStorage 있음 + status='error' → error (에러 표시, LS 정리)", () => {
    const result = classifyRenderStatus(true, 200, { ...BASE_STATUS, status: "error", error_msg: "ffmpeg failed" }, true);
    expect(result).toBe("error");
  });

  it("케이스 5: localStorage 있음 + status='running' + in-memory 없음 → zombie (서버 재시작)", () => {
    const result = classifyRenderStatus(true, 200, { ...BASE_STATUS, status: "running" }, false);
    expect(result).toBe("zombie");
  });

  it("케이스 6: localStorage 있음 + DB 404 → not_found (LS 정리, 빈 Editor)", () => {
    const result = classifyRenderStatus(true, 404, null, false);
    expect(result).toBe("not_found");
  });
});
