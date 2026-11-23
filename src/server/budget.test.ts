import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { approve, BudgetError, record, spentUsd, tokenCost, worstCaseText, type Receipt } from "./budget.ts";
import { mockFromSchema, think } from "./meta.ts";

const receipt = (costUsd: number, mode: "live" | "mock" = "live"): Receipt => ({
  at: new Date().toISOString(),
  model: "muse-ember-1.0",
  purpose: "test",
  mode,
  usage: { input: 0, cached: 0, output: 0, reasoning: 0 },
  images: 0,
  estimateUsd: costUsd,
  costUsd,
  ok: true,
});

beforeEach(() => {
  process.env.LEDGER_PATH = join(mkdtempSync(join(tmpdir(), "ledger-")), "usage.jsonl");
  process.env.BUDGET_CAP_USD = "8";
  delete process.env.MODEL_LIVE;
});

describe("prices", () => {
  it("charge input, cached input and output at their own rates", () => {
    // 100K fresh input at $0.10/M, 100K cached at $0.004/M, 100K output at $0.50/M
    expect(tokenCost({ input: 200_000, cached: 100_000, output: 100_000, reasoning: 0 })).toBeCloseTo(0.01 + 0.0004 + 0.05, 9);
  });

  it("charge three times for a request above 200K input tokens", () => {
    const small = tokenCost({ input: 200_000, cached: 0, output: 1000, reasoning: 0 });
    const big = tokenCost({ input: 200_001, cached: 0, output: 1000, reasoning: 0 });
    expect(big / small).toBeGreaterThan(2.99);
  });

  it("estimate the worst case: no cache, every output token used", () => {
    expect(worstCaseText(1000, 500)).toBeCloseTo((1000 * 0.1 + 500 * 0.5) / 1e6, 9);
  });
});

describe("the gate", () => {
  it("counts only live receipts as spent", () => {
    record(receipt(1.5));
    record(receipt(3, "mock"));
    expect(spentUsd()).toBeCloseTo(1.5);
  });

  it("refuses a call that could cross the cap, and lets a smaller one through", () => {
    record(receipt(7.99));
    expect(() => approve(0.02, "live")).toThrow(BudgetError);
    expect(() => approve(0.005, "live")).not.toThrow();
    expect(() => approve(5, "mock")).not.toThrow();
  });
});

describe("rehearsals", () => {
  it("answer in the requested shape, cost nothing, and leave a receipt", async () => {
    const schema = { type: "object", properties: { plan: { type: "string", description: "what to do" }, risk: { type: "number", minimum: 0 } } };
    const r = await think({ purpose: "test", instructions: "rules", input: "state", schema: { name: "plan", schema }, maxOutputTokens: 200 });
    expect(r.receipt.mode).toBe("mock");
    expect(r.receipt.costUsd).toBe(0);
    expect(r.json).toEqual(mockFromSchema(schema));
    expect(spentUsd()).toBe(0);
  });
});
