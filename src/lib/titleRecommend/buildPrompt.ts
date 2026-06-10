import type { Category } from "./categories";
import { CATEGORIES } from "./categories";
import { TITLE_EXAMPLES } from "./examples";
import type { TitleTone } from "./tones";
import { TITLE_TONES } from "./tones";

export interface TitlePromptTrack {
  artist: string;
  title: string;
}

export interface BuildTitlePromptOptions {
  category: Category;
  tone: TitleTone;
  excludedTitles: string[];
  tracks: TitlePromptTrack[];
  preferredTitles: string[];
}

function sampleN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

export function buildTitlePrompt(options: BuildTitlePromptOptions): string {
  const { category, tone, excludedTitles, tracks, preferredTitles } = options;
  const { description } = CATEGORIES[category];
  const toneDescription = TITLE_TONES[tone].description;
  const examples = sampleN(TITLE_EXAMPLES[category], 15);

  const excludeSection =
    excludedTitles.length > 0
      ? `\n아래 제목은 이미 사용했으니 제외해주세요:\n${excludedTitles.map((t) => `- ${t}`).join("\n")}\n`
      : "";
  const trackSection =
    tracks.length > 0
      ? `\n현재 플레이리스트 트랙 정보입니다. 제목에 직접 나열하지 않아도 되지만, 무드와 키워드를 추론하는 데 반드시 참고하세요:\n${tracks.map((track, i) => `- ${i + 1}. ${track.artist ? `${track.artist} - ` : ""}${track.title}`).join("\n")}\n`
      : "";
  const preferenceSection =
    preferredTitles.length > 0
      ? `\n사용자가 이전에 마음에 들어 선택한 제목입니다. 복사하지 말고, 이 채널이 좋아하는 말맛과 밀도만 참고하세요:\n${preferredTitles.slice(-12).map((t) => `- ${t}`).join("\n")}\n`
      : "";

  return `당신은 한국 YouTube 음악 플레이리스트 채널의 영상 제목 전문가입니다.
목표는 평범한 검색형 제목이 아니라, 클릭하고 싶게 만드는 "채널 감도 높은 제목"입니다.

카테고리: ${category}
카테고리 특성: ${description}
요청 톤: ${tone}
톤 설명: ${toneDescription}
${trackSection}${preferenceSection}

아래는 이 채널에서 실제로 사용된 제목 예시입니다.
이 예시들은 문장 구조, 위트, 타이포그래피, 특수문자, 이모지, 장르 태그의 밀도를 학습하기 위한 레퍼런스입니다.
절대 그대로 복사하지 말고, 같은 감도의 새 제목으로 재조합하세요:
${examples.map((e) => `- ${e}`).join("\n")}
${excludeSection}
위 예시들의 언어 톤, 구조, 분위기를 참고해서 서로 다른 새 플레이리스트 제목 후보 6개를 추천해주세요.

품질 기준:
- 첫 8~14글자 안에 후킹되는 상황, 농담, 감정, 공간감 중 하나가 있어야 합니다
- "Playlist" 표기는 일반 ASCII만 쓰지 말고 𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭, ᴘʟΑʏʟɪꜱᴛ, 𝑷𝒍𝒂𝒚𝒍𝒊𝒔𝒕, [playlist] 같은 변형을 자유롭게 쓰세요
- 꺾쇠, 대괄호, 세로선, 중점, 슬래시, 이모지, 영문 혼용을 자연스럽게 사용해도 됩니다
- 제목은 너무 얌전하면 실패입니다. "내가 눌러보고 싶은 한 줄"처럼 약간의 과장, 장면, 말맛이 있어야 합니다
- 검색 키워드도 살리되, 제목 전체가 SEO 문구처럼 밋밋하면 안 됩니다
- 요청 톤 "${tone}"이 제목의 첫인상에서 느껴져야 합니다
- 트랙 정보가 있으면 아티스트명/곡명을 그대로 늘어놓기보다, 공통된 무드와 상황을 제목으로 압축하세요
- 선호 제목이 있으면 같은 제목을 반복하지 말고, 그 제목들이 가진 문장 리듬과 과감함을 이어가세요
- 6개 후보는 후킹 문장, 상황, 핵심 키워드, 문장 구조가 서로 겹치지 않아야 합니다

규칙:
- 예시 제목을 그대로 복사하거나 단어만 바꾼 제목은 안 됩니다
- 위 예시 25개와 완전히 동일한 제목은 절대 금지입니다
- 예시의 톤과 구조만 참고하고 핵심 문장, 상황, 키워드는 새롭게 변형하세요
- "작업용 플레이리스트", "감성힙합 플리"처럼 너무 일반적인 제목만 단독으로 쓰지 마세요
- JSON 배열 형태로만 응답하세요
- 다른 설명 없이 배열만: ["제목1", "제목2", "제목3", "제목4", "제목5", "제목6"]
- 각 제목은 35~85자 권장. 짧아도 되지만 위트와 정보량을 우선하세요`;
}
