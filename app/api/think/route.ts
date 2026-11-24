// POST /api/think: one thought for one woken bot. The page sends the bot's situation as plain checked fields
// (never free text to pass on), the server builds the prompt, asks Muse Ember, and returns the plan.

import { cleanSituation } from "@/engine/mind.ts";
import { thinkFor } from "@/server/mind.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, reason: "error", message: "Bad request." }, { status: 400 });
  }
  const round = typeof body.round === "string" && /^[a-z0-9-]{4,40}$/.test(body.round) ? body.round : null;
  const situation = cleanSituation(body.situation);
  const lang = body.lang === "zh" ? "zh" : "en";
  if (!round || !situation) return Response.json({ ok: false, reason: "error", message: "Bad request." }, { status: 400 });
  return Response.json(await thinkFor(round, situation, lang));
}
