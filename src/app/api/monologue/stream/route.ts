// src/app/api/monologue/stream/route.ts
import OpenAI from "openai";
import { headers } from "next/headers";
import { take } from "@/lib/ratelimit";

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

    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("cf-connecting-ip") ||
      "unknown";

    // --- Daily quota shared with non-streaming: 10/day
    const dq = take(`day:${ip}`, { windowMs: 86_400_000, max: 10 });
    if (!dq.allowed) {
      return new Response(
        `You've reached today's free limit (10). Each generation costs us a little to run. Please consider donating to keep Banzerini House’s theatre thriving: https://www.banzerinihouse.org/donate`,
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(dq.resetMs / 1000)),
            "Content-Type": "text/plain"
          }
        }
      );
    }


    // --- Per-minute guardrail for streaming: 6/min
    const rl = take(`stream:${ip}`, { windowMs: 60_000, max: 6 });
    if (!rl.allowed) {
      return new Response(`Too many requests. Try again in ${Math.ceil(rl.resetMs / 1000)}s.`, {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)), "Content-Type": "text/plain" }
      });
    }

    console.log(`[stream] ip=${ip} age="${age}" genre="${genre}" length="${length}" level="${level}" period="${period}"`);

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

    // Stream plain text back to the client using Chat Completions (text deltas)
    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

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
