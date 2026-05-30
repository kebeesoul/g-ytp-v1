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

const GeminiResponseSchema = z.array(z.string()).length(3);

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
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.95, maxOutputTokens: 512, topP: 0.9 },
        }),
        signal: AbortSignal.timeout(15_000),
      }
    );

    if (!geminiRes.ok) throw new Error(`Gemini API error: ${geminiRes.status}`);

    const data = (await geminiRes.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const cleaned = cleanGeminiJsonText(rawText);

    let titles: unknown;
    try {
      titles = JSON.parse(cleaned);
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
