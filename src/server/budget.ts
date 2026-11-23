// The budget gate and the receipt ledger. Every call to a Meta model is priced before it is sent,
// refused if it could cross our cap, and written down afterwards with its real token counts and cost.
// Going over $10 of credits disqualifies the project, and the platform has no hard stop, so this is ours.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

/** Prices in US$ (Meta Model API pricing page, read 2026-11-23). */
export const PRICES = {
  "muse-ember-1.0": { input: 0.1, cached: 0.004, output: 0.5 },
  "muse-image-1.0": { image: 0.01 },
} as const;

export type Model = keyof typeof PRICES;

/** Requests above this many input tokens are billed at three times the rate, whole request. */
export const LONG_CONTEXT = 200_000;

/** Our own ceiling, well under the $10 of credits. */
export function capUsd() {
  return Number(process.env.BUDGET_CAP_USD ?? 8);
}

export function ledgerPath() {
  return process.env.LEDGER_PATH ?? "data/local/usage.jsonl";
}

export type Usage = { input: number; cached: number; output: number; reasoning: number };

export type Receipt = {
  at: string;
  model: Model;
  /** What the call was for, e.g. "wake:bot-12" or "art:card-harvest". */
  purpose: string;
  /** live = real money; mock = a rehearsal with a fake reply, costs nothing. */
  mode: "live" | "mock";
  usage: Usage;
  images: number;
  /** The estimate the gate approved before the call. */
  estimateUsd: number;
  costUsd: number;
  ok: boolean;
  note?: string;
};

export class BudgetError extends Error {}

/** What a text call costs, from its token counts. */
export function tokenCost(usage: Usage): number {
  const p = PRICES["muse-ember-1.0"];
  const fresh = Math.max(0, usage.input - usage.cached);
  const cost = (fresh * p.input + usage.cached * p.cached + usage.output * p.output) / 1e6;
  return usage.input > LONG_CONTEXT ? cost * 3 : cost;
}

/** A cautious token count for text we are about to send (about 3.2 characters a token, rounded up). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.2);
}

/** The most a text call could cost: all input uncached, every allowed output token used. */
export function worstCaseText(inputTokens: number, maxOutputTokens: number): number {
  return tokenCost({ input: inputTokens, cached: 0, output: maxOutputTokens, reasoning: 0 });
}

export function readLedger(): Receipt[] {
  const path = ledgerPath();
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Receipt);
}

/** Real money spent so far, from the ledger. */
export function spentUsd(): number {
  return readLedger()
    .filter((r) => r.mode === "live")
    .reduce((a, r) => a + r.costUsd, 0);
}

/** The gate: refuse anything that could take us past the cap. */
export function approve(estimateUsd: number, mode: "live" | "mock") {
  if (mode === "mock") return;
  const spent = spentUsd();
  if (spent + estimateUsd > capUsd()) {
    throw new BudgetError(
      `Refused: this call could cost up to $${estimateUsd.toFixed(5)}, and $${spent.toFixed(5)} of the $${capUsd().toFixed(2)} cap is already spent.`,
    );
  }
}

export function record(r: Receipt) {
  const path = ledgerPath();
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(r) + "\n");
}
