import { z } from "zod";
import { GEMINI_MODEL, hasGeminiApiKey, cleanGeminiJsonText } from "@/lib/gemini";
import { buildTitlePrompt } from "@/lib/titleRecommend/buildPrompt";
import { sanitizeRecommendedTitles, fallbackTitles } from "@/lib/titleRecommend/recommendation";
import type { CategoryKey } from "@/lib/titleRecommend/categories";
import { CATEGORY_KEYS } from "@/lib/titleRecommend/categories";

const BodySchema = z.object({
  category: z.enum(CATEGORY_KEYS as [CategoryKey, ...CategoryKey[]]),
  tone: z.string().min(1),
  excludedTitles: z.array(z.string()).default([]),
  preferredTitles: z.array(z.string()).default([]),
  tracks: z.array(z.object({ artist: z.string(), title: z.string() })),
});

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;

  const body = BodySchema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.issues[0]?.message ?? "invalid body" }, { status: 400 });
  }

  const { category, tone, excludedTitles, preferredTitles, tracks } = body.data;

  // Return fallback immediately if Gemini key is not configured.
  if (!hasGeminiApiKey(apiKey)) {
    return Response.json({ titles: fallbackTitles(category, excludedTitles) });
  }

  const prompt = buildTitlePrompt({ category, tone, excludedTitles, preferredTitles, tracks });

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );

  if (!geminiRes.ok) {
    return Response.json({ titles: fallbackTitles(category, excludedTitles) });
  }

  const geminiData = (await geminiRes.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const cleaned = cleanGeminiJsonText(raw.trim());

  let rawTitles: string[];
  try {
    rawTitles = z.array(z.string()).parse(JSON.parse(cleaned));
  } catch {
    return Response.json({ titles: fallbackTitles(category, excludedTitles) });
  }

  const titles = sanitizeRecommendedTitles(category, rawTitles, excludedTitles);
  return Response.json({ titles });
}
