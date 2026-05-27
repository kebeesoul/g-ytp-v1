import type { CategoryKey } from "./categories";

// Seeded examples shown to Gemini as style reference and excluded from final output.
// Uses unicode bold 𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 — distinct from plain ASCII "Playlist" that Gemini outputs.
export const TITLE_EXAMPLES: Record<CategoryKey, string[]> = {
  감성힙합: [
    "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 마음이 먼저 퇴근하는 감성힙합",
    "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 새벽 3시에 듣는 감성힙합",
    "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 비 오는 날 창문 옆 감성힙합",
  ],
  그루브힙합: [
    "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 몸이 먼저 반응하는 그루브힙합",
    "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 걸을 때 더 멋있어지는 그루브",
    "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 리듬이 발걸음을 잡는 그루브 믹스",
  ],
  편집샵: [
    "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 편집샵 BGM처럼 세련된 플리",
    "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 쇼룸에서 흘러나올 것 같은 음악",
    "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 감각 있는 공간의 배경음악",
  ],
  이지리스닝: [
    "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 집중은 높이고 산만함은 줄여주는 플리",
    "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 노트북 열자마자 몰입되는 음악",
    "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 카페에서 혼자 작업할 때 딱 맞는 BGM",
  ],
};
