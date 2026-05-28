import { describe, expect, it } from "vitest";
import { GEMINI_MODEL, cleanGeminiJsonText, hasGeminiApiKey } from "@/lib/gemini";
import { buildHashtagPrompt } from "@/lib/hashtagRecommend/buildPrompt";

describe("Hashtag recommendation prompt", () => {
  it("uses Gemini 2.5 and treats placeholder keys as unconfigured", () => {
    expect(GEMINI_MODEL).toBe("gemini-2.5-flash");
    expect(hasGeminiApiKey(undefined)).toBe(false);
    expect(hasGeminiApiKey("여기에_Gemini_API_키_입력")).toBe(false);
    expect(hasGeminiApiKey("real-key")).toBe(true);
  });

  it("asks for exactly five structured hashtags", () => {
    const prompt = buildHashtagPrompt("집중은 높이고 산만함은 줄여주는 작업·공부 플리");

    expect(prompt).toContain("대분류 1개");
    expect(prompt).toContain("중분류 1개");
    expect(prompt).toContain("소분류 3개");
    expect(prompt).toContain("[\"#대분류\", \"#중분류\", \"#소분류1\", \"#소분류2\", \"#소분류3\"]");
  });

  it("cleans fenced Gemini JSON output", () => {
    expect(cleanGeminiJsonText("```json\n[\"#a\"]\n```")).toBe("[\"#a\"]");
  });
});
