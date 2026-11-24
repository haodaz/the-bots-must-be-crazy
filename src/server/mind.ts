// One thought for one woken bot: the situation goes to Muse Ember, a plan comes back.
// Each round of the game holds one small grain of real compute; a thought is refused once the round's grain is spent,
// and every call still passes the project-wide budget gate first. Every thought leaves a receipt (budget.ts) and a trace
// line with the exact prompt and reply, which together are the usage log we publish.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { PLAN_SCHEMA, RULES, cleanPlan, promptFor, type Plan, type Situation } from "../engine/mind.ts";
import { BudgetError, readLedger } from "./budget.ts";
import { think } from "./meta.ts";

/** One round's grain of real compute, in US$. */
export function grainUsd() {
  return Number(process.env.ROUND_GRAIN_USD ?? 0.04);
}

/** Room for a thought's reasoning and its JSON reply. Even at minimal effort Ember reasons a little before answering. */
const MAX_OUTPUT = 700;

export function tracePath() {
  return process.env.TRACE_PATH ?? "data/local/trace.jsonl";
}

/** Real money this round has spent on thoughts so far. */
export function roundSpent(round: string): number {
  const prefix = `mind:${round}:`;
  return readLedger()
    .filter((r) => r.mode === "live" && r.purpose.startsWith(prefix))
    .reduce((a, r) => a + r.costUsd, 0);
}

export type ThoughtReply =
  | { ok: true; plan: Plan; costUsd: number; mode: "live" | "mock"; spent: number; grain: number }
  | { ok: false; reason: "grain" | "budget" | "error"; message: string; spent: number; grain: number };

export async function thinkFor(round: string, s: Situation, lang: "en" | "zh"): Promise<ThoughtReply> {
  const grain = grainUsd();
  const before = roundSpent(round);
  const input = promptFor(s, lang);
  // The worst case this thought could cost: every input token fresh, every output token used.
  const worst = ((RULES.length + input.length + JSON.stringify(PLAN_SCHEMA.schema).length) / 3.2) * 0.1e-6 + MAX_OUTPUT * 0.5e-6;
  if (before + worst > grain) return { ok: false, reason: "grain", message: "This round's grain of compute is spent.", spent: before, grain };
  try {
    const r = await think({
      purpose: `mind:${round}:bot-${s.id}`,
      instructions: RULES,
      input,
      schema: PLAN_SCHEMA as unknown as { name: string; schema: Record<string, unknown> },
      effort: "minimal",
      maxOutputTokens: MAX_OUTPUT,
      cacheKey: "tbmbc-mind-v1",
    });
    const plan = cleanPlan(r.json);
    trace({ at: r.receipt.at, round, bot: s.id, year: s.year, lang, mode: r.receipt.mode, input, output: r.text, usage: r.receipt.usage, costUsd: r.receipt.costUsd });
    return { ok: true, plan, costUsd: r.receipt.costUsd, mode: r.receipt.mode, spent: before + r.receipt.costUsd, grain };
  } catch (e) {
    const budget = e instanceof BudgetError;
    return { ok: false, reason: budget ? "budget" : "error", message: (e as Error).message, spent: before, grain };
  }
}

function trace(line: Record<string, unknown>) {
  const path = tracePath();
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(line) + "\n");
}
