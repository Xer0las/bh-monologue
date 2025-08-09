import { NextResponse } from "next/server";
import { headers } from "next/headers";
import OpenAI from "openai";
import { take } from "@/lib/ratelimit";
import { getDefaults } from "@/lib/settings";
import { hasOverride, grantOverride, consumeOverride } from "@/lib/overrides";
import { recordGeneration } from "@/lib/metrics";

export const runtime = "nodejs";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function extractText(resp: any): string {
  if (resp?.output_text && String(resp.output_text).trim()) {
    return String(resp.output_text).trim();
  }
  const content = resp?.output?.[0]?.content;
  if (Array.isArray(content)) {
    const item = content.find((c: any) => typeof c?.text === "string");
    if (item?.text) return String(item.text).trim();
  }
  return "";
}

function lengthToRange(label: string): [number, number] {
  if (label.startsWith("Short")) return [100, 150];
  if (label.startsWith("Medium")) return [150, 200];
  if (label.startsWith("Long")) return [200, 280];
  if (label.startsWith("XL")) return [280, 420];
  return [160, 220];
}

export function GET() {
  return NextResponse.json({ ok: true, route: "monologue", method: "GET" });
}

export async function POST(req: Request) {
  try {
    const {
      age = "Teens 14–17",
      genre = "Comedy",
      length = "Medium (45–60s)",
      level = "Beginner",
      period = "Contemporary",
    } = await req.json().catch(() => ({}));

    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("cf-connecting-ip") ||
      "unknown";

    // ---- Global Visitor Allowance (baseline) ------------------------------
    // If this IP doesn't have an override yet, grant the current defaults.
    let has = await hasOverride(ip);
    if (!has) {
      const d = await getDefaults();
      if (d?.defaultMinutes && d?.defaultUses) {
        await grantOverride(ip, d.defaultMinutes, d.defaultUses);
        has = await hasOverride(ip);
      }
    }
    // ----------------------------------------------------------------------

    if (!has) {
      // Normal burst/minute rate limits (unchanged)
      const dq = take(`burst:${ip}`, { windowMs: 300_000, max: 10 });
      if (!dq.allowed) {
        const msg =
          "We’re thrilled you’re enjoying this! You’ve hit the free limit (10 every 5 minutes). Each generation costs us a bit to run—please consider donating to keep Banzerini House’s theatre thriving: https://www.banzerinihouse.org/donate";
        return NextResponse.json(
          { ok: false, error: msg },
          { status: 429, headers: { "Retry-After": String(Math.ceil(dq.resetMs / 1000)) } }
        );
      }

      const rl = take(`gen:${ip}`, { windowMs: 60_000, max: 8 });
      if (!rl.allowed) {
        return NextResponse.json(
          { ok: false, error: `Too many requests. Try again in ${Math.ceil(rl.resetMs / 1000)}s.` },
          { status: 429, headers: { "Retry-After": String(Math.ceil(rl.resetMs / 1000)) } }
        );
      }
    } else {
      await consumeOverride(ip);
      console.log(`[override] monologue bypass ip=${ip}`);
    }

    console.log(
      `[gen] ip=${ip} age="${age}" genre="${genre}" length="${length}" level="${level}" period="${period}"`
    );

    const [minW, maxW] = lengthToRange(length);
    const styleGuide =
      String(level).startsWith("Beginner")
        ? "Use simpler vocabulary, shorter sentences, clear beats, gentle stakes."
        : "Use richer vocabulary, subtext, sharper turns, and denser imagery—still family-safe for the selected age.";
    const periodGuide =
      String(period).startsWith("Classic")
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

    const resp = await openai.responses.create({
      model: "gpt-4o",
      instructions:
        "You are a produced playwright writing ORIGINAL, family-safe, performable monologues for Banzerini House. Output plain text only.",
      input: prompt,
      max_output_tokens: 900,
    });

    const text = extractText(resp);
    if (!text) throw new Error("No text returned from model.");

    await recordGeneration({ age, genre, length, level, period }).catch(() => {});

    const [first, ...rest] = text.split("\n").filter(Boolean);
    const title = first.replace(/^[-#\s]*/, "").slice(0, 120) || "Monologue";
    const body = rest.join("\n").trim() || text;

    return NextResponse.json({ ok: true, title, text: body });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
