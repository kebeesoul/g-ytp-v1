import { z } from "zod";
import { GEMINI_MODEL, hasGeminiApiKey, cleanGeminiJsonText } from "@/lib/gemini";
import { buildHashtagPrompt } from "@/lib/hashtagRecommend/buildPrompt";

const BodySchema = z.object({
  description: z.string().min(1),
});

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!hasGeminiApiKey(apiKey)) {
    return Response.json({ error: "GEMINI_API_KEY not configured" }, { status: 503 });
  }

  const body = BodySchema.safeParse(await req.json());
  if (!body.success) {
    return Response.json({ error: body.error.issues[0]?.message ?? "invalid body" }, { status: 400 });
  }

  const prompt = buildHashtagPrompt(body.data.description);

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );

  if (!geminiRes.ok) {
    return Response.json({ error: "gemini api error" }, { status: 502 });
  }

  const geminiData = (await geminiRes.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const cleaned = cleanGeminiJsonText(raw.trim());

  let hashtags: string[];
  try {
    hashtags = z.array(z.string()).parse(JSON.parse(cleaned));
  } catch {
    return Response.json({ error: "failed to parse gemini response" }, { status: 502 });
  }

  return Response.json({ hashtags });
}
