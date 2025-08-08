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

    // Create a text decoder stream to the client
    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // Stream with Chat Completions for easy plain-text deltas
    (async () => {
      try {
        const stream = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          stream: true,
          messages: [
            {
              role: "system",
              content:
                "You are a produced playwright writing ORIGINAL, family-safe, performable monologues for Banzerini House. Output plain text only.",
            },
            { role: "user", content: prompt },
          ],
        });

        for await (const part of stream) {
          const delta = part.choices?.[0]?.delta?.content || "";
          if (delta) await writer.write(encoder.encode(delta));
        }
      } catch (err: any) {
        await writer.write(encoder.encode(`\n[stream error: ${err?.message || "unknown"}]`));
      } finally {
        await writer.close();
      }
    })();

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
