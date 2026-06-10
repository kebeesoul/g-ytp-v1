import { describe, expect, it } from "vitest";
import { buildTitlePrompt } from "@/lib/titleRecommend/buildPrompt";
import { CATEGORIES, CATEGORY_KEYS } from "@/lib/titleRecommend/categories";
import { TITLE_TONE_KEYS } from "@/lib/titleRecommend/tones";
import { fallbackTitles, isExampleTitle, sanitizeRecommendedTitles } from "@/lib/titleRecommend/recommendation";
import { TITLE_EXAMPLES } from "@/lib/titleRecommend/examples";

describe("TitleRecommend prompt", () => {
  it("defines the supported title recommendation categories", () => {
    expect(CATEGORY_KEYS).toEqual(["감성힙합", "그루브힙합", "편집샵", "이지리스닝"]);
    expect(TITLE_TONE_KEYS).toEqual(["웃긴", "감성적인", "힙한", "상업적인"]);
    for (const category of CATEGORY_KEYS) {
      expect(CATEGORIES[category].label).toBe(category);
      expect(CATEGORIES[category].description.length).toBeGreaterThan(20);
    }
  });

  it("includes the category, JSON-only rule, and excluded titles", () => {
    const prompt = buildTitlePrompt({
      category: "감성힙합",
      tone: "웃긴",
      excludedTitles: ["이미 쓴 제목"],
      tracks: [{ artist: "릴러말즈", title: "비요뜨 먹을 때" }],
      preferredTitles: ["𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 마음이 먼저 퇴근하는 감성힙합"],
    });

    expect(prompt).toContain("카테고리: 감성힙합");
    expect(prompt).toContain("요청 톤: 웃긴");
    expect(prompt).toContain("릴러말즈 - 비요뜨 먹을 때");
    expect(prompt).toContain("사용자가 이전에 마음에 들어 선택한 제목");
    expect(prompt).toContain("마음이 먼저 퇴근하는 감성힙합");
    expect(prompt).toContain("JSON 배열 형태로만 응답하세요");
    expect(prompt).toContain("- 이미 쓴 제목");
    expect(prompt).toContain("완전히 동일한 제목은 절대 금지");
    expect(prompt).toContain('"Playlist" 표기는 일반 ASCII만 쓰지 말고');
    expect(prompt).toContain("꺾쇠, 대괄호, 세로선, 중점, 슬래시, 이모지");
    expect(prompt).toContain("너무 얌전하면 실패");
    expect(prompt).toContain("서로 다른 새 플레이리스트 제목 후보 6개");
    expect(prompt).toContain("[\"제목1\", \"제목2\", \"제목3\", \"제목4\", \"제목5\", \"제목6\"]");
  });

  it("never returns exact seeded examples from fallback", () => {
    const titles = fallbackTitles("감성힙합", []);

    expect(titles).toHaveLength(3);
    for (const title of titles) {
      expect(isExampleTitle("감성힙합", title)).toBe(false);
    }
  });

  it("filters Gemini titles that exactly match seeded examples", () => {
    const titles = sanitizeRecommendedTitles(
      "그루브힙합",
      [TITLE_EXAMPLES["그루브힙합"][0], "Playlist 오늘 리듬감 살리는 그루브 플리", TITLE_EXAMPLES["그루브힙합"][1]],
      []
    );

    expect(titles).toHaveLength(3);
    expect(titles.some((title) => title.includes("오늘 리듬감 살리는 그루브 플리"))).toBe(true);
    expect(titles).not.toContain("Playlist 오늘 리듬감 살리는 그루브 플리");
    for (const title of titles) {
      expect(isExampleTitle("그루브힙합", title)).toBe(false);
    }
  });

  it("stylizes plain Playlist prefixes from Gemini results", () => {
    const titles = sanitizeRecommendedTitles(
      "이지리스닝",
      [
        "Playlist 집중이 먼저 앉아버리는 카페 BGM",
        "Playlist 오늘은 딴짓 줄이는 작업 플리",
        "Playlist 노트북 열자마자 몰입되는 음악",
      ],
      []
    );

    expect(titles).toHaveLength(3);
    for (const title of titles) {
      expect(title.startsWith("Playlist ")).toBe(false);
      expect(title.startsWith("Playlist |")).toBe(false);
      expect(title.startsWith("[playlist] |")).toBe(false);
    }
  });

  it("returns three unseen fallback titles across repeated recommendations", () => {
    const excluded: string[] = [];

    for (let retry = 0; retry < 10; retry += 1) {
      const titles = fallbackTitles("편집샵", excluded);
      expect(titles).toHaveLength(3);
      expect(new Set(titles.map((title) => title.normalize("NFKC"))).size).toBe(3);
      for (const title of titles) {
        expect(excluded.map((item) => item.normalize("NFKC"))).not.toContain(
          title.normalize("NFKC")
        );
      }
      excluded.push(...titles);
    }
  });

  it("does not repeat the same generated fallback hook within one result", () => {
    const firstEight = Array.from({ length: 3 }, () =>
      fallbackTitles("그루브힙합", [])
    ).flat();
    const titles = fallbackTitles("그루브힙합", firstEight);

    expect(titles).toHaveLength(3);
    const titleBodies = titles.map((title) => title.split("|")[0]);
    expect(new Set(titleBodies).size).toBe(3);
  });

  it("fills filtered Gemini results with three unseen titles", () => {
    const excluded = fallbackTitles("이지리스닝", []);
    const titles = sanitizeRecommendedTitles(
      "이지리스닝",
      [
        excluded[0],
        excluded[0],
        TITLE_EXAMPLES["이지리스닝"][0],
        "Playlist 마감 전에 집중력을 다시 켜는 카페 음악",
      ],
      excluded
    );

    expect(titles).toHaveLength(3);
    expect(new Set(titles.map((title) => title.normalize("NFKC"))).size).toBe(3);
    for (const title of titles) {
      expect(excluded.map((item) => item.normalize("NFKC"))).not.toContain(
        title.normalize("NFKC")
      );
    }
  });
});
