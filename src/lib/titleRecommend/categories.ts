export const CATEGORIES = {
  "감성힙합": {
    label: "감성힙합",
    description:
      "새벽, 감정, 고백, 그리움이 담긴 분위기. 한국어 중심이며 영어 단어를 자연스럽게 혼용한다. 시적이고 내면적인 어조. '느좋', '분위기', '인스타 감성' 같은 키워드가 자주 등장하며 감정선이 짙다.",
  },
  "그루브힙합": {
    label: "그루브힙합",
    description:
      "리듬감, 에너지, 자신감이 느껴지는 분위기. '두둠칫', '그루브', '재즈합' 같은 키워드. 영어를 자연스럽게 섞으며 짧고 강한 어조. 고개 끄덕이게 만드는 바이브.",
  },
  "편집샵": {
    label: "편집샵",
    description:
      "미니멀하고 무드 있는 공간감. 성수동·편집샵·트렌디·세련미 키워드. 한국어·영어를 자유롭게 혼용한다. 감도 높고 절제된 느낌이며 매장 BGM 느낌을 줌.",
  },
  "이지리스닝": {
    label: "이지리스닝",
    description:
      "카페, 공부, 집중, 힐링, 재택근무 분위기. 편안하고 따뜻한 어조. 한국어 자연스러운 문장 중심. '집중력', '작업용', '카페 BGM' 등 실용적 키워드 포함 가능.",
  },
} as const;

export type Category = keyof typeof CATEGORIES;
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];
