export const TITLE_TONES = {
  "웃긴": {
    label: "웃긴",
    description:
      "가볍게 피식하게 만드는 말맛. 과한 밈보다 상황 농담, 직장인/새벽/공부/매장 같은 생활 장면을 재치 있게 비튼다.",
  },
  "감성적인": {
    label: "감성적인",
    description:
      "새벽, 여운, 고백, 후회, 계절감처럼 감정선이 남는 어조. 시적이지만 과하게 추상적이지 않게 장면을 선명하게 잡는다.",
  },
  "힙한": {
    label: "힙한",
    description:
      "편집샵, 성수동, 뉴욕, 쇼룸, 그루브처럼 감도 높은 공간감과 자신감. 한국어와 영어를 자연스럽게 섞고 타이포그래피를 적극 활용한다.",
  },
  "상업적인": {
    label: "상업적인",
    description:
      "검색 키워드와 클릭 후킹을 강하게 살리는 제목. 장르, 용도, 분위기를 분명히 넣되 광고 문구처럼 뻔하지 않게 만든다.",
  },
} as const;

export type TitleTone = keyof typeof TITLE_TONES;
export const TITLE_TONE_KEYS = Object.keys(TITLE_TONES) as TitleTone[];
