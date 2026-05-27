export type CategoryKey = "감성힙합" | "그루브힙합" | "편집샵" | "이지리스닝";

export const CATEGORY_KEYS: CategoryKey[] = ["감성힙합", "그루브힙합", "편집샵", "이지리스닝"];

export const CATEGORIES: Record<CategoryKey, { label: string; description: string }> = {
  감성힙합: {
    label: "감성힙합",
    description: "감정선이 풍부하고 서정적인 힙합 음악을 담은 플레이리스트. 새벽·비·이별·그리움을 다룬다.",
  },
  그루브힙합: {
    label: "그루브힙합",
    description: "리듬감과 그루브가 강조된 힙합 플레이리스트. 몸이 먼저 반응하고 걸음이 빨라지는 음악.",
  },
  편집샵: {
    label: "편집샵",
    description: "편집샵·쇼룸·카페 공간에 어울리는 감각적이고 세련된 배경음악 플레이리스트.",
  },
  이지리스닝: {
    label: "이지리스닝",
    description: "부담 없이 편안하게 들을 수 있는 이지리스닝. 집중력·작업·공부에 어울리는 플레이리스트.",
  },
};
