import { NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORY_KEYS } from "@/lib/titleRecommend/categories";
import { buildTitlePrompt } from "@/lib/titleRecommend/buildPrompt";
import type { Category } from "@/lib/titleRecommend/categories";
import { TITLE_TONE_KEYS } from "@/lib/titleRecommend/tones";
import type { TitleTone } from "@/lib/titleRecommend/tones";
import { cleanGeminiJsonText, GEMINI_MODEL, hasGeminiApiKey } from "@/lib/gemini";
import { fallbackTitles, sanitizeRecommendedTitles } from "@/lib/titleRecommend/recommendation";

const RequestSchema = z.object({
  category: z.enum(CATEGORY_KEYS as [Category, ...Category[]]),
  tone: z.enum(TITLE_TONE_KEYS as [TitleTone, ...TitleTone[]]).default("힙한"),
  excludedTitles: z.array(z.string()).default([]),
  tracks: z
    .array(
      z.object({
        artist: z.string().default(""),
        title: z.string().default(""),
      })
    )
    .default([]),
  preferredTitles: z.array(z.string()).default([]),
});

const GeminiResponseSchema = z.array(z.string()).min(3).max(8);
const RETRYABLE_GEMINI_STATUSES = new Set([429, 500, 502, 503, 504]);
const TITLE_GEMINI_MODELS = [GEMINI_MODEL, "gemini-2.5-flash-lite"] as const;

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ thought?: boolean; text?: string }> };
  }>;
};

async function requestGeminiTitles(
  apiKey: string,
  prompt: string
): Promise<GeminiResponse> {
  let lastStatus = 0;

  for (const [attempt, model] of TITLE_GEMINI_MODELS.entries()) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.95,
            maxOutputTokens: 2048,
            topP: 0.9,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(15_000),
      }
    );

    if (response.ok) return (await response.json()) as GeminiResponse;

    lastStatus = response.status;
    if (
      !RETRYABLE_GEMINI_STATUSES.has(response.status) ||
      attempt === TITLE_GEMINI_MODELS.length - 1
    ) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  throw new Error(`Gemini API error: ${lastStatus}`);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { category, tone, excludedTitles, tracks, preferredTitles } = parsed.data;
  const blockedTitles = [...excludedTitles, ...preferredTitles];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!hasGeminiApiKey(apiKey)) {
    return NextResponse.json({ titles: fallbackTitles(category, blockedTitles) });
  }

  const prompt = buildTitlePrompt({
    category,
    tone,
    excludedTitles: blockedTitles,
    tracks: tracks.filter((track) => track.artist.trim() || track.title.trim()).slice(0, 20),
    preferredTitles,
  });

  try {
    const data = await requestGeminiTitles(apiKey, prompt);

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const rawText =
      parts.find((part) => !part.thought && part.text)?.text ??
      parts[0]?.text ??
      "";
    const cleaned = cleanGeminiJsonText(rawText);
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    const jsonToParse = arrayMatch ? arrayMatch[0] : cleaned;

    let titles: unknown;
    try {
      titles = JSON.parse(jsonToParse);
    } catch {
      return NextResponse.json({ titles: fallbackTitles(category, blockedTitles) });
    }

    const validated = GeminiResponseSchema.safeParse(titles);
    if (!validated.success) {
      return NextResponse.json({ titles: fallbackTitles(category, blockedTitles) });
    }

    const sanitized = sanitizeRecommendedTitles(category, validated.data, blockedTitles);
    return NextResponse.json({ titles: sanitized });
  } catch {
    return NextResponse.json({ titles: fallbackTitles(category, blockedTitles) });
  }
}
