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

const GENERATED_FALLBACK_PARTS: Record<
  Category,
  { hooks: string[]; tails: string[] }
> = {
  "감성힙합": {
    hooks: [
      "괜찮은 척하다 첫 곡에서 다 들킴",
      "새벽 감정은 왜 셔플도 눈치가 빠른지",
      "답장 대신 재생 버튼을 눌러버린 밤",
      "잊으려 틀었는데 기억만 선명해지는 중",
      "오늘 분위기, 솔직히 마음보다 위험함",
      "말 안 해도 첫 소절이 다 설명해주는 밤",
    ],
    tails: [
      "국내 감성힙합·R&B 느좋 셀렉션 🖤",
      "인디 R&B와 새벽 감정선 사이",
      "이어폰 속에서만 솔직해지는 노래들",
      "120분 국내 힙합·R&B 무드",
      "인스타보다 오래 남는 감성 플리",
      "고백과 후회 사이에 놓인 트랙들",
    ],
  },
  "그루브힙합": {
    hooks: [
      "할 일은 그대로인데 고개부터 끄덕이는 중",
      "첫 박자에 사무실이 브루클린으로 바뀜",
      "앉아서 듣는데 걸음걸이만 힙해지는 플리",
      "커피보다 먼저 텐션을 올려버린 비트",
      "조용히 일하려다 리듬만 크게 타는 중",
      "월요일 표정에 그루브 한 스푼 추가",
    ],
    tails: [
      "Groove Hip-hop·Jazzhop Mix 😎",
      "카페·작업용 Chill Groove BGM",
      "고개가 먼저 반응하는 재즈합 셀렉션",
      "뉴욕 무드 R&B·힙합 플레이리스트",
      "집중과 둠칫 사이의 Work Mix",
      "하루 종일 흐름 살리는 스무스 비트",
    ],
  },
  "편집샵": {
    hooks: [
      "옷보다 음악 어디 거냐고 먼저 묻는 매장",
      "문 열자마자 공간 가격이 올라가는 선곡",
      "조명보다 분위기를 더 잘 잡는 팝송들",
      "팝업은 끝나도 이 플리는 계속 저장됨",
      "성수동 안 가도 방 안의 감도는 충분함",
      "손님 발걸음을 한 번 더 붙잡는 첫 곡",
    ],
    tails: [
      "Trendy Shop·Lounge BGM 🛍️",
      "편집샵 감성 R&B·소프트 하우스",
      "하루 종일 질리지 않는 매장음악",
      "쇼룸을 완성하는 세련된 팝 셀렉션",
      "감도 높은 공간을 위한 All-day Mix",
      "카페·팝업스토어용 Trendy Playlist",
    ],
  },
  "이지리스닝": {
    hooks: [
      "집중하려고 틀었는데 마음까지 정리됨",
      "노트북 여는 소리와 가장 잘 어울리는 음악",
      "딴짓하던 손이 조용히 할 일을 시작함",
      "마감은 가까운데 이상하게 마음은 평온함",
      "커피가 식어도 흐름은 끊기지 않는 선곡",
      "오늘 할 일을 천천히 전부 끝내는 리듬",
    ],
    tails: [
      "Study·Work Focus BGM ✍🏻",
      "카페 재즈와 편안한 이지리스닝",
      "재택근무 집중력을 위한 Chill Mix",
      "공부·작업·휴식 사이의 잔잔한 플리",
      "오래 틀어두기 좋은 Soft Focus Music",
      "산만함을 낮추는 카페 플레이리스트",
    ],
  },
};

export function normalizeTitleForCompare(title: string): string {
  const normalized = title.normalize("NFKC").toLowerCase();
  const withoutPlaylistMark = PLAYLIST_MARKS.reduce(
    (value, mark) =>
      value.replace(mark.normalize("NFKC").toLowerCase(), ""),
    normalized
  );

  return withoutPlaylistMark
    .replace(/playlist/gi, "")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
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
  const { hooks, tails } = GENERATED_FALLBACK_PARTS[category];
  const usedHooks = new Set(
    hooks.filter((hook) =>
      excluded.some((title) =>
        normalizeTitleForCompare(title).includes(normalizeTitleForCompare(hook))
      )
    )
  );
  const usedTails = new Set(
    tails.filter((tail) =>
      excluded.some((title) =>
        normalizeTitleForCompare(title).includes(normalizeTitleForCompare(tail))
      )
    )
  );
  const generated = hooks.flatMap((hook, hookIndex) =>
    tails.map(
      (tail, tailIndex) => ({
        title: `${PLAYLIST_MARKS[(hookIndex + tailIndex) % PLAYLIST_MARKS.length]} ${hook} | ${tail}`,
        hook,
        tail,
      })
    )
  );
  const fixedPool = FALLBACK_VARIANTS[category]
    .filter((title) => !blocked.has(normalizeTitleForCompare(title)))
    .sort(() => Math.random() - 0.5);
  const generatedPool = generated
    .filter(({ title }) => !blocked.has(normalizeTitleForCompare(title)))
    .sort((a, b) => {
      const score = (candidate: typeof a) =>
        (usedHooks.has(candidate.hook) ? 0 : 2) +
        (usedTails.has(candidate.tail) ? 0 : 1);
      return score(b) - score(a) || Math.random() - 0.5;
    });
  const selected = fixedPool.slice(0, 3);
  const selectedHooks = new Set<string>();
  const selectedTails = new Set<string>();

  for (const candidate of generatedPool) {
    if (selected.length >= 3) break;
    if (
      selectedHooks.has(candidate.hook) ||
      selectedTails.has(candidate.tail)
    ) {
      continue;
    }
    selected.push(candidate.title);
    selectedHooks.add(candidate.hook);
    selectedTails.add(candidate.tail);
  }

  for (const candidate of generatedPool) {
    if (selected.length >= 3) break;
    if (!selected.includes(candidate.title)) selected.push(candidate.title);
  }

  return selected.slice(0, 3).map(stylizePlainPlaylist);
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
