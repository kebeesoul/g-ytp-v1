import { z } from "zod";
import { GEMINI_MODEL, hasGeminiApiKey, cleanGeminiJsonText } from "@/lib/gemini";
import { buildHashtagPrompt } from "@/lib/hashtagRecommend/buildPrompt";

const BodySchema = z.object({
  title: z.string().min(1),
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

  const prompt = buildHashtagPrompt(body.data.title);

  let geminiRes: Response;
  try {
    geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1024 },
        }),
        signal: AbortSignal.timeout(15_000),
      }
    );
  } catch {
    return Response.json({ error: "gemini request failed (timeout or network error)" }, { status: 502 });
  }

  if (!geminiRes.ok) {
    const errBody = await geminiRes.json().catch(() => ({})) as { error?: { message?: string } };
    const errMsg = errBody.error?.message ?? `Gemini API returned HTTP ${geminiRes.status}`;
    return Response.json({ error: errMsg }, { status: 502 });
  }

  const geminiData = (await geminiRes.json()) as {
    candidates?: { content?: { parts?: { thought?: boolean; text?: string }[] } }[];
  };

  // gemini-2.5-flash may include thinking parts — skip them and use the first non-thought part
  const parts = geminiData.candidates?.[0]?.content?.parts ?? [];
  const raw = (parts.find((p) => !p.thought && p.text)?.text ?? parts[0]?.text ?? "").trim();
  const cleaned = cleanGeminiJsonText(raw);

  // Extract the JSON array from anywhere in the response text
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  const jsonToParse = arrayMatch ? arrayMatch[0] : cleaned;

  let hashtags: string[];
  try {
    const parsed: unknown = JSON.parse(jsonToParse);
    if (!Array.isArray(parsed)) throw new Error("not array");
    hashtags = (parsed as unknown[]).filter((item): item is string => typeof item === "string");
    if (hashtags.length === 0) throw new Error("empty");
  } catch {
    return Response.json(
      { error: `parse failed — raw: ${raw.slice(0, 200)}` },
      { status: 502 }
    );
  }

  return Response.json({ hashtags });
}
