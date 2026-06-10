export const GEMINI_MODEL = "gemini-2.5-flash";

const PLACEHOLDER_KEY = "여기에_Gemini_API_키_입력";

// Returns false for undefined or the placeholder key from .env.local.example.
export function hasGeminiApiKey(key: string | undefined): key is string {
  if (!key || key === PLACEHOLDER_KEY) return false;
  return true;
}

// Strips ```json ... ``` fences from Gemini output before JSON.parse.
export function cleanGeminiJsonText(text: string): string {
  return text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
}
