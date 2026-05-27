export function buildHashtagPrompt(description: string): string {
  return `다음 유튜브 플레이리스트 설명에 맞는 해시태그 5개를 JSON 배열로 생성하세요.

플레이리스트 설명: ${description}

해시태그 구성:
- 대분류 1개 (장르·분위기 대표 태그)
- 중분류 1개 (세부 감성 또는 용도)
- 소분류 3개 (구체적 상황·키워드)

응답 형식: ["#대분류", "#중분류", "#소분류1", "#소분류2", "#소분류3"]

JSON 배열만 반환하세요. 설명 없이 배열만.`;
}
