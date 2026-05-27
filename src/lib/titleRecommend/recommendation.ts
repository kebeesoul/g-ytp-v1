import type { CategoryKey } from "./categories";
import { TITLE_EXAMPLES } from "./examples";

const UNICODE_PLAYLIST = "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭";

// Fallback titles per category — NOT exact matches to TITLE_EXAMPLES.
const FALLBACK_TITLES: Record<CategoryKey, string[]> = {
  감성힙합: [
    `${UNICODE_PLAYLIST} 혼자 듣는 새벽 감성힙합`,
    `${UNICODE_PLAYLIST} 감정이 쌓이는 날 듣는 힙합`,
    `${UNICODE_PLAYLIST} 오늘 하루 버틴 사람을 위한 플리`,
    `${UNICODE_PLAYLIST} 말하지 못한 감정을 담은 힙합`,
    `${UNICODE_PLAYLIST} 잠들기 전 한 번 더 듣는 감성 플리`,
  ],
  그루브힙합: [
    `${UNICODE_PLAYLIST} 발걸음이 가벼워지는 그루브 플리`,
    `${UNICODE_PLAYLIST} 에너지 충전 그루브힙합 믹스`,
    `${UNICODE_PLAYLIST} 오늘 컨디션 최고일 때 듣는 그루브`,
    `${UNICODE_PLAYLIST} 출근길을 힙하게 만드는 그루브`,
    `${UNICODE_PLAYLIST} 기분 업 그루브 힙합 플리`,
  ],
  편집샵: [
    `${UNICODE_PLAYLIST} 감도 높은 공간을 위한 BGM`,
    `${UNICODE_PLAYLIST} 브랜드 무드를 완성하는 음악`,
    `${UNICODE_PLAYLIST} 세련된 취향의 배경음악`,
    `${UNICODE_PLAYLIST} 아무 편집샵에나 깔아도 어울리는 플리`,
    `${UNICODE_PLAYLIST} 공간을 완성하는 감각적인 음악`,
  ],
  이지리스닝: [
    `${UNICODE_PLAYLIST} 집중력이 알아서 올라가는 작업 플리`,
    `${UNICODE_PLAYLIST} 조용히 몰입되는 이지리스닝`,
    `${UNICODE_PLAYLIST} 산만함 제로 작업 BGM`,
    `${UNICODE_PLAYLIST} 뇌가 쉬면서 일하는 음악`,
    `${UNICODE_PLAYLIST} 오늘 마감 반드시 지키는 플리`,
  ],
};

// Returns true if title exactly matches one of the seeded examples for the category.
export function isExampleTitle(category: CategoryKey, title: string): boolean {
  return TITLE_EXAMPLES[category].includes(title);
}

// Returns 3 fallback titles for the category, excluding any exact examples and already-used titles.
export function fallbackTitles(category: CategoryKey, excludedTitles: string[]): string[] {
  const excluded = new Set([...excludedTitles, ...TITLE_EXAMPLES[category]]);
  return FALLBACK_TITLES[category].filter((t) => !excluded.has(t)).slice(0, 3);
}

// Replaces plain ASCII "Playlist " prefix with unicode bold variant.
function stylizePlaylistPrefix(title: string): string {
  if (title.startsWith("Playlist ")) {
    return `${UNICODE_PLAYLIST} ${title.slice("Playlist ".length)}`;
  }
  return title;
}

// Filters out exact example matches, stylizes "Playlist " prefix, fills to 3 with fallback.
export function sanitizeRecommendedTitles(
  category: CategoryKey,
  titles: string[],
  excludedTitles: string[]
): string[] {
  const excluded = new Set(excludedTitles);

  // Step 1: remove exact example matches and excluded titles
  const filtered = titles.filter((t) => !isExampleTitle(category, t) && !excluded.has(t));

  // Step 2: stylize "Playlist " prefix
  const stylized = filtered.map(stylizePlaylistPrefix);

  // Step 3: remove any that became exact examples after stylization
  const clean = stylized.filter((t) => !isExampleTitle(category, t));

  // Step 4: fill to 3 if needed
  if (clean.length >= 3) return clean.slice(0, 3);

  const usedTitles = new Set([...clean, ...TITLE_EXAMPLES[category], ...excludedTitles]);
  const fallback = FALLBACK_TITLES[category]
    .filter((t) => !usedTitles.has(t))
    .slice(0, 3 - clean.length);

  return [...clean, ...fallback];
}
