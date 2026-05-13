/**
 * §3.2 History 복원 정확성 — 복원 보장 표 8개 항목 케이스별 검증
 *
 * 복원 항목:
 * 1. 플레이리스트 제목 (snapshot.title)
 * 2. 트랙 순서 (snapshot.tracks[].order)
 * 3. 트랙 아티스트명/곡명 (snapshot.tracks[].artist / title)
 * 4. 음원 파일 storagePath (snapshot.tracks[].storagePath)
 * 5. 배경 이미지/영상 (snapshot.background.storagePath)
 * 6. Transition 설정 (snapshot.renderConfig.transition)
 * 7. Overlay 표시 모드 (snapshot.renderConfig.overlay.displayMode)
 * 8. 해시태그 (snapshot.hashtags)
 */
import { describe, it, expect } from "vitest";
import {
  ProjectSnapshotSchema,
  ProjectRecordSchema,
  type ProjectSnapshot,
} from "@/lib/schema";

// Zod v4 UUID는 variant bits 필요 — 4th group은 [89abAB] 시작
const TRACK_ID_A = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const TRACK_ID_B = "f47ac10b-58cc-4372-a567-0e02b2c3d480";
const RECORD_ID  = "f47ac10b-58cc-4372-a567-0e02b2c3d481";
const JOB_ID     = "f47ac10b-58cc-4372-a567-0e02b2c3d482";

const BASE_SNAPSHOT: ProjectSnapshot = {
  title: "Lo-fi Chill Mix Vol.1",
  tracks: [
    {
      id: TRACK_ID_A,
      filename: "artist_a_-_song_a.mp3",
      storagePath: "import/export-id/artist_a_-_song_a.mp3",
      artist: "Artist A",
      title: "Song A",
      durationSec: 240,
      order: 0,
    },
    {
      id: TRACK_ID_B,
      filename: "artist_b_-_song_b.mp3",
      storagePath: "import/export-id/artist_b_-_song_b.mp3",
      artist: "Artist B",
      title: "Song B (Edited Title)",
      durationSec: 180,
      order: 1,
    },
  ],
  background: {
    kind: "image",
    storagePath: "import/export-id/bg.jpg",
    fit: "cover",
    dim: 0.25,
    blur: 0,
    cropPosition: "center",
  },
  renderConfig: {
    transition: { type: "crossfade", crossfadeSec: 2 },
    overlay: { displayMode: "5", presetId: "default", presetVersion: 1 },
    audio: { normalize: "ebu_r128", targetLufs: -14, truePeakDb: -1 },
    thumbnail: { mode: "extract", presetId: "default", presetVersion: 1 },
    outputFormat: "mp4",
    audioBitrateKbps: 192,
    resolution: [1920, 1080],
    hwaccel: "videotoolbox",
  },
  hashtags: ["lofi", "chill", "playlist"],
};

describe("§3.2 복원 보장 — 8개 항목 스키마 검증", () => {
  it("완전한 snapshot이 ProjectSnapshotSchema를 통과한다", () => {
    const r = ProjectSnapshotSchema.safeParse(BASE_SNAPSHOT);
    expect(r.success).toBe(true);
  });

  // 1. 플레이리스트 제목
  it("항목 1: title이 비어 있으면 검증 실패", () => {
    const r = ProjectSnapshotSchema.safeParse({ ...BASE_SNAPSHOT, title: "" });
    expect(r.success).toBe(false);
  });

  it("항목 1: title이 유지된다 (round-trip)", () => {
    const r = ProjectSnapshotSchema.parse(BASE_SNAPSHOT);
    expect(r.title).toBe("Lo-fi Chill Mix Vol.1");
  });

  // 2. 트랙 순서
  it("항목 2: tracks[].order가 정수임을 검증", () => {
    const badTrack = { ...BASE_SNAPSHOT.tracks[0], order: 1.5 };
    const r = ProjectSnapshotSchema.safeParse({ ...BASE_SNAPSHOT, tracks: [badTrack] });
    expect(r.success).toBe(false);
  });

  it("항목 2: 트랙 순서 정렬 후에도 order 값이 정확히 유지된다", () => {
    const snapshot = ProjectSnapshotSchema.parse(BASE_SNAPSHOT);
    const sorted = [...snapshot.tracks].sort((a, b) => a.order - b.order);
    expect(sorted[0].order).toBe(0);
    expect(sorted[1].order).toBe(1);
  });

  // 3. 아티스트명/곡명 (편집된 값 포함)
  it("항목 3: artist와 title이 정확히 보존된다", () => {
    const snapshot = ProjectSnapshotSchema.parse(BASE_SNAPSHOT);
    expect(snapshot.tracks[0].artist).toBe("Artist A");
    expect(snapshot.tracks[1].title).toBe("Song B (Edited Title)");
  });

  // 4. 음원 storagePath
  it("항목 4: storagePath가 정확히 보존된다", () => {
    const snapshot = ProjectSnapshotSchema.parse(BASE_SNAPSHOT);
    expect(snapshot.tracks[0].storagePath).toBe("import/export-id/artist_a_-_song_a.mp3");
  });

  // 5. 배경 이미지/영상
  it("항목 5: background.storagePath가 보존된다", () => {
    const snapshot = ProjectSnapshotSchema.parse(BASE_SNAPSHOT);
    expect(snapshot.background?.storagePath).toBe("import/export-id/bg.jpg");
  });

  it("항목 5: background가 null일 수 있다", () => {
    const r = ProjectSnapshotSchema.safeParse({ ...BASE_SNAPSHOT, background: null });
    expect(r.success).toBe(true);
  });

  it("항목 5: 비디오 배경도 보존된다", () => {
    const videoBg = { kind: "video" as const, storagePath: "import/export-id/bg.mp4", durationSec: 120, fit: "cover" as const, dim: 0.25, blur: 0, cropPosition: "center" as const };
    const r = ProjectSnapshotSchema.safeParse({ ...BASE_SNAPSHOT, background: videoBg });
    expect(r.success).toBe(true);
    expect(r.data?.background?.kind).toBe("video");
  });

  // 6. Transition 설정
  it("항목 6: transition.type='crossfade'가 보존된다", () => {
    const snapshot = ProjectSnapshotSchema.parse(BASE_SNAPSHOT);
    expect(snapshot.renderConfig.transition.type).toBe("crossfade");
    expect(snapshot.renderConfig.transition.crossfadeSec).toBe(2);
  });

  it("항목 6: transition.type='silence'도 보존된다", () => {
    const r = ProjectSnapshotSchema.safeParse({
      ...BASE_SNAPSHOT,
      renderConfig: { ...BASE_SNAPSHOT.renderConfig, transition: { type: "silence", crossfadeSec: 2 } },
    });
    expect(r.success).toBe(true);
    expect(r.data?.renderConfig.transition.type).toBe("silence");
  });

  // 7. Overlay 표시 모드
  it("항목 7: overlay.displayMode='5'가 보존된다", () => {
    const snapshot = ProjectSnapshotSchema.parse(BASE_SNAPSHOT);
    expect(snapshot.renderConfig.overlay.displayMode).toBe("5");
  });

  it("항목 7: 모든 displayMode 값이 유효하다 (0, 2, 5, full)", () => {
    for (const mode of ["0", "2", "5", "full"] as const) {
      const r = ProjectSnapshotSchema.safeParse({
        ...BASE_SNAPSHOT,
        renderConfig: {
          ...BASE_SNAPSHOT.renderConfig,
          overlay: { ...BASE_SNAPSHOT.renderConfig.overlay, displayMode: mode },
        },
      });
      expect(r.success, `displayMode=${mode} should be valid`).toBe(true);
    }
  });

  // 8. 해시태그
  it("항목 8: hashtags 배열이 정확히 보존된다", () => {
    const snapshot = ProjectSnapshotSchema.parse(BASE_SNAPSHOT);
    expect(snapshot.hashtags).toEqual(["lofi", "chill", "playlist"]);
  });

  it("항목 8: 빈 hashtags 배열도 유효하다", () => {
    const r = ProjectSnapshotSchema.safeParse({ ...BASE_SNAPSHOT, hashtags: [] });
    expect(r.success).toBe(true);
  });
});

describe("§3.2 ProjectRecord 포함 검증 (GET /api/project/[id] 응답 형식)", () => {
  const RECORD_RAW = {
    id: RECORD_ID,
    title: "Lo-fi Chill Mix Vol.1",
    snapshot: BASE_SNAPSHOT,
    status: "done",
    thumbnail_path: "import/export-id/thumbnail.jpg",
    export_folder: "export/export-id/",
    latest_job_id: JOB_ID,
    exported_at: "2026-05-13T10:00:00.000Z",
    created_at: "2026-05-13T09:00:00.000Z",
  };

  it("유효한 ProjectRecord 파싱 성공", () => {
    const r = ProjectRecordSchema.safeParse(RECORD_RAW);
    expect(r.success).toBe(true);
  });

  it("status='done'인 레코드에서 snapshot을 추출할 수 있다", () => {
    const record = ProjectRecordSchema.parse(RECORD_RAW);
    expect(record.status).toBe("done");
    expect(record.snapshot.title).toBe("Lo-fi Chill Mix Vol.1");
    expect(record.snapshot.tracks).toHaveLength(2);
  });

  it("thumbnail_path가 null일 수 있다", () => {
    const r = ProjectRecordSchema.safeParse({ ...RECORD_RAW, thumbnail_path: null });
    expect(r.success).toBe(true);
  });
});
