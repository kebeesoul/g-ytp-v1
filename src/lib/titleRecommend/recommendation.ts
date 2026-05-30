import type { Category } from "./categories";
import { TITLE_EXAMPLES } from "./examples";

const FALLBACK_VARIANTS: Record<Category, string[]> = {
  "감성힙합": [
    "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 첫 곡부터 말없이 저장..🖤 국내 감성힙합/R&B",
    "ᴘʟΑʏʟɪꜱᴛ 새벽 두 시, 답장 대신 틀어두는 느좋 R&B 플리",
    "[playlist] 오늘 감정선 좀 위험한데? | 국내 감성힙합·인디 R&B",
    "𝑷𝒍𝒂𝒚𝒍𝒊𝒔𝒕 너 생각 안 하려고 틀었는데 더 생각나는 노래들",
    "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 분위기 하나로 설득되는 국내 감성힙합 모음 💿",
    "Playlist | 이 정도면 고백보다 더 진한 감성힙합·R&B",
    "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 인스타 감성 말고 진짜 마음 남는 플리 🎧",
    "ᴘλλʏʟɪꜱᴛ 헤어짐은 아닌데 왜 이렇게 아픈지 | 감성힙합",
  ],
  "그루브힙합": [
    "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 앉아있는데 어깨만 출근 거부함 😎 Groove Mix",
    "Playlist | 첫 박자에 이미 고개 끄덕인 그루브 힙합·재즈합",
    "𝙥𝙡𝙖𝙮𝙡𝙞𝙨𝒕 일은 하기 싫고 리듬은 타고 싶은 날 🎧",
    "ᴘʟΑʏʟɪꜱᴛ 둠칫은 작게, 감도는 크게 | Chill Groove BGM",
    "[playlist] 사무실에서 몰래 리듬 타기 좋은 재즈합·그루브",
    "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 뉴욕 가본 적 없지만 지금 브루클린인 척하는 플리",
    "𝑷𝒍𝒂𝒚𝒍𝒊𝒔𝒕 이 비트면 월요일도 살짝 괜찮아짐 ⚡",
    "Playlist 🎧 커피보다 먼저 텐션 올려주는 그루브 셀렉션",
  ],
  "편집샵": [
    "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 손님이 방금 노래 뭐냐고 물어보는 편집샵 BGM",
    "ᴘʟΑʏʟɪꜱᴛ 성수동 쇼룸 조명 아래서 더 비싸 보이는 팝송들",
    "[Playlist] 옷보다 먼저 분위기가 팔리는 매장음악 🛍️",
    "𝑷𝒍𝒂𝒚𝒍𝒊𝒔𝒕 내 방을 편집샵처럼 보이게 만드는 트렌디 팝",
    "Playlist | 팝업스토어에서 하루 종일 흘러도 질리지 않는 무드",
    "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 감각 있는 사장님들이 조용히 저장하는 숍 플리",
    "ᴘλλʏʟɪꜱᴛ 가격표보다 먼저 눈길 가는 세련된 매장 BGM",
    "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 공간이 갑자기 힙해지는 소프트 하우스·R&B",
  ],
  "이지리스닝": [
    "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 집중 안 되는 날, 책상에 앉게 만드는 음악 ✍🏻",
    "Playlist | 마감 두 시간 전부터 사람이 달라지는 Work BGM",
    "ᴘʟΑʏʟɪꜱᴛ 커피 식기 전에 몰입 모드 켜지는 카페 플리 ☕",
    "[playlist] 오늘은 딴짓 줄이고 천천히 끝내보는 공부·작업 BGM",
    "𝑷𝒍𝒂𝒚𝒍𝒊𝒔𝒕 노트북 열자마자 방이 조용한 카페가 되는 음악",
    "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭 산만함은 낮추고 집중력은 올리는 이지리스닝",
    "Playlist 🎧 재택근무 배경음악인데 기분까지 정리되는 플리",
    "ᴘλλʏʟɪꜱᴛ 할 일은 많은데 마음부터 차분해지는 집중 BGM",
  ],
};

const PLAYLIST_MARKS = [
  "𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭",
  "ᴘʟΑʏʟɪꜱᴛ",
  "𝑷𝒍𝒂𝒚𝒍𝒊𝒔𝒕",
  "[playlist]",
] as const;

export function normalizeTitleForCompare(title: string): string {
  return title
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isExampleTitle(category: Category, title: string): boolean {
  const normalized = normalizeTitleForCompare(title);
  return TITLE_EXAMPLES[category].some(
    (example) => normalizeTitleForCompare(example) === normalized
  );
}

function stylizePlainPlaylist(title: string): string {
  const trimmed = title.trim();
  if (!/^playlist\b/i.test(trimmed)) return trimmed;

  const mark = PLAYLIST_MARKS[Math.floor(Math.random() * PLAYLIST_MARKS.length)];
  return trimmed.replace(/^playlist\s*(?:[|｜]\s*)?/i, `${mark} `).trim();
}

export function fallbackTitles(category: Category, excluded: string[]): string[] {
  const blocked = new Set([
    ...excluded.map(normalizeTitleForCompare),
    ...TITLE_EXAMPLES[category].map(normalizeTitleForCompare),
  ]);
  const pool = FALLBACK_VARIANTS[category].filter(
    (title) => !blocked.has(normalizeTitleForCompare(title))
  );
  return [...pool]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map(stylizePlainPlaylist);
}

export function sanitizeRecommendedTitles(
  category: Category,
  titles: string[],
  excluded: string[]
): string[] {
  const blocked = new Set([
    ...excluded.map(normalizeTitleForCompare),
    ...TITLE_EXAMPLES[category].map(normalizeTitleForCompare),
  ]);
  const result: string[] = [];

  for (const title of titles) {
    const normalizedTitle = stylizePlainPlaylist(title.normalize("NFKC"));
    const comparable = normalizeTitleForCompare(normalizedTitle);
    if (!normalizedTitle || blocked.has(comparable)) continue;
    if (result.some((existing) => normalizeTitleForCompare(existing) === comparable)) continue;
    result.push(normalizedTitle);
  }

  if (result.length >= 3) return result.slice(0, 3);

  for (const title of fallbackTitles(category, [...excluded, ...result])) {
    if (result.length >= 3) break;
    result.push(stylizePlainPlaylist(title));
  }

  return result.slice(0, 3);
}
