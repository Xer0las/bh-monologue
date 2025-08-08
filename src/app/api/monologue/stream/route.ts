// src/app/api/monologue/stream/route.ts
import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function lengthToRange(label: string): [number, number] {
  if (label.startsWith("Short")) return [100, 150];
  if (label.startsWith("Medium")) return [150, 200];
  if (label.startsWith("Long")) return [200, 280];
  if (label.startsWith("XL")) return [280, 420];
  return [160, 220];
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const age = url.searchParams.get("age") || "Teens 14–17";
    const genre = url.searchParams.get("genre") || "Comedy";
    const length = url.searchParams.get("length") || "Medium (45–60s)";
    const level = url.searchParams.get("level") || "Beginner";
    const period = url.searchParams.get("period") || "Contemporary";

    const [minW, maxW] = lengthToRange(length);

    const styleGuide =
      level.startsWith("Beginner")
        ? "Use simpler vocabulary, shorter sentences, clear beats, gentle stakes."
        : "Use richer vocabulary, subtext, sharper turns, and denser imagery—still family-safe for the selected age.";

    const periodGuide =
      period.startsWith("Classic")
        ? "Lightly heightened, period-appropriate diction; avoid archaic clutter; keep clarity for youth; do NOT imitate existing authors."
        : "Use present-day, natural speech rhythms.";

    const prompt =
      `Write a brand-new audition monologue for a ${age} actor.\n` +
      `Tone/genre: ${genre}. Time period: ${period}. ${periodGuide}\n` +
      `Family-safe and first-person. Performance level: ${level}. ${styleGuide}\n` +
      `Target ${minW}–${maxW} words. Output plain text only.\n` +
      `Format:\n` +
      `Line 1: a short evocative TITLE\n` +
      `Blank line\n` +
      `Then the monologue text.`;

    // Stream plain text back to the client
    const stream = await openai.responses.stream({
      model: "gpt-4o",
      instructions:
        "You are a produced playwright writing ORIGINAL, family-safe, performable monologues for Banzerini House. Output plain text only.",
      input: prompt,
      max_output_tokens: 900,
    });

    // Cast to any to access runtime helper; SDK typings may lag
    const readable =
      (stream as any).toReadableStream?.() ??
      (stream as any).toStream?.();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    const msg = err?.message || "Server error";
    return new Response(`Error: ${msg}`, { status: 500 });
  }
}
