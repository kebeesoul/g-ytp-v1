import type { CategoryKey } from "./categories";
import { CATEGORIES } from "./categories";
import { TITLE_EXAMPLES } from "./examples";

type Track = { artist: string; title: string };

type BuildTitlePromptParams = {
  category: CategoryKey;
  tone: string;
  excludedTitles: string[];
  tracks: Track[];
  preferredTitles: string[];
};

export function buildTitlePrompt({
  category,
  tone,
  excludedTitles,
  tracks,
  preferredTitles,
}: BuildTitlePromptParams): string {
  const trackList = tracks.map((t) => `${t.artist} - ${t.title}`).join("\n");
  const excluded = excludedTitles.map((t) => `- ${t}`).join("\n");
  const examples = TITLE_EXAMPLES[category].join("\n");
  const preferred = preferredTitles.join("\n");
  const categoryDesc = CATEGORIES[category].description;

  return `유튜브 플레이리스트 제목 3개를 추천해주세요.

카테고리: ${category}
카테고리 설명: ${categoryDesc}
요청 톤: ${tone}

수록 트랙:
${trackList}

${preferredTitles.length > 0 ? `사용자가 이전에 마음에 들어 선택한 제목 (이 스타일을 참고하세요):
${preferred}

` : ""}스타일 예시 (그대로 쓰지 말고 스타일만 참고):
${examples}

${excludedTitles.length > 0 ? `이미 사용한 제목 (완전히 동일한 제목은 절대 금지):
${excluded}

` : ""}규칙:
- "Playlist" 표기는 일반 ASCII만 쓰지 말고 𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 처럼 볼드 유니코드를 사용할 것
- 꺾쇠, 대괄호, 세로선, 중점, 슬래시, 이모지 사용 금지
- 너무 얌전하면 실패 — 개성 있고 클릭하고 싶은 제목
- JSON 배열 형태로만 응답하세요

응답 형식: ["제목1", "제목2", "제목3"]`;
}
