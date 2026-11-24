// One thought for one woken bot: the situation goes to Muse Ember, a plan comes back.
// Each round of the game holds one small grain of real compute, and the public game shares one pool. Before a thought
// is sent, its worst-case cost is reserved in the store (store.ts), which refuses it if the pool, the round's grain or
// the visitor's hourly rounds would be passed; afterwards the reservation is settled to the real cost. Every call also
// passes the project-wide budget gate, and every thought leaves a receipt and a trace line with its exact prompt and
// reply: together they are the usage log we publish.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { PLAN_SCHEMA, RULES, cleanPlan, promptFor, type Plan, type Situation } from "../engine/mind.ts";
import { BudgetError } from "./budget.ts";
import { liveAllowed, think } from "./meta.ts";
import { getStore, publicOpen, type PoolName } from "./store.ts";

/** One round's grain of real compute, in US$. */
export function grainUsd() {
  return Number(process.env.ROUND_GRAIN_USD ?? 0.04);
}

/** Room for a thought's reasoning and its JSON reply. Even at minimal effort Ember reasons a little before answering. */
const MAX_OUTPUT = 700;

export function tracePath() {
  return process.env.TRACE_PATH ?? "data/local/trace.jsonl";
}

export type ThoughtReply =
  | { ok: true; plan: Plan; costUsd: number; mode: "live" | "mock"; spent: number; grain: number }
  | { ok: false; reason: "grain" | "pool" | "busy" | "closed" | "budget" | "error"; message: string; spent: number; grain: number };

const MESSAGES = {
  grain: "This round's grain of compute is spent.",
  pool: "The public pool of compute is spent.",
  busy: "Too many new rounds from here this hour.",
  closed: "The public pool is closed; what is left is kept for the judges.",
};

/**
 * Ask for one thought. `visitor` is an anonymous hash, used only to limit how many rounds one visitor starts an hour;
 * `pool` is which pool pays (the judges' pool only with the judges' pass).
 */
export async function thinkFor(round: string, s: Situation, lang: "en" | "zh", visitor = "local", pool: PoolName = "public"): Promise<ThoughtReply> {
  const grain = grainUsd();
  const input = promptFor(s, lang);
  const live = liveAllowed();
  if (pool === "public" && !publicOpen()) return { ok: false, reason: "closed", message: MESSAGES.closed, spent: 0, grain };
  // The most this thought could cost: every input token fresh, every output token used.
  const worst = ((RULES.length + input.length + JSON.stringify(PLAN_SCHEMA.schema).length) / 3.2) * 0.1e-6 + MAX_OUTPUT * 0.5e-6;
  const store = getStore();
  // Rehearsals cost nothing and reserve nothing.
  const held = live ? await store.reserve(round, worst, grain, visitor, pool) : { ok: true as const, pool: 0, round: 0 };
  if (!held.ok) return { ok: false, reason: held.reason, message: MESSAGES[held.reason], spent: held.round, grain };
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
    const u = r.receipt.usage;
    const trace = { at: r.receipt.at, pool, round, bot: s.id, year: s.year, lang, mode: r.receipt.mode, input, output: r.text, usage: u, costUsd: r.receipt.costUsd };
    if (live) {
      await store.settle(
        round,
        worst,
        { at: r.receipt.at, round, bot: s.id, year: s.year, choice: plan.choice, lang, input: u.input, cached: u.cached, output: u.output, reasoning: u.reasoning, costUsd: r.receipt.costUsd },
        trace,
        pool,
      );
    }
    if (store.kind === "file") writeTrace(trace);
    const spent = live ? held.round - worst + r.receipt.costUsd : 0;
    return { ok: true, plan, costUsd: r.receipt.costUsd, mode: r.receipt.mode, spent, grain };
  } catch (e) {
    if (live) await store.refund(round, worst, pool).catch(() => {});
    const budget = e instanceof BudgetError;
    return { ok: false, reason: budget ? "budget" : "error", message: (e as Error).message, spent: held.round - (live ? worst : 0), grain };
  }
}

function writeTrace(line: Record<string, unknown>) {
  const path = tracePath();
  mkdirSync(/*turbopackIgnore: true*/ dirname(path), { recursive: true });
  appendFileSync(/*turbopackIgnore: true*/ path, JSON.stringify(line) + "\n");
}
