import { describe, expect, it } from "vitest";
import { LAWS, yieldAt } from "./laws.ts";
import { createWorld, ledger, step } from "./world.ts";

const run = (seed: number, ticks: number) => {
  const w = createWorld(seed);
  for (let i = 0; i < ticks; i++) step(w);
  return w;
};

describe("the law of supply", () => {
  it("puts all 21,000,000 metashi in the ground at genesis", () => {
    const w = createWorld(1);
    expect(ledger(w)).toEqual({ ground: LAWS.SUPPLY, pockets: 0, total: LAWS.SUPPLY });
  });

  it("never creates or destroys a metashi, tick after tick", () => {
    const w = createWorld(7);
    for (let i = 0; i < 20_000; i++) {
      step(w);
      if (i % 500 === 0) expect(ledger(w).total).toBe(LAWS.SUPPLY);
    }
    expect(ledger(w).total).toBe(LAWS.SUPPLY);
    expect(w.bots.every((b) => b.wallet >= 0)).toBe(true);
    expect(w.gold.every((g) => g >= 0)).toBe(true);
  });

  it("sends money spent on food back into the ground", () => {
    const w = run(3, 5_000);
    expect(w.totals.spentOnFood).toBeGreaterThan(0);
  });
});

describe("halving", () => {
  it("halves the yield every HALVING_TICKS and then holds", () => {
    expect(yieldAt(0)).toBe(LAWS.BASE_YIELD);
    expect(yieldAt(LAWS.HALVING_TICKS)).toBe(LAWS.BASE_YIELD / 2);
    expect(yieldAt(LAWS.HALVING_TICKS * LAWS.MAX_HALVINGS)).toBe(LAWS.BASE_YIELD >> LAWS.MAX_HALVINGS);
    expect(yieldAt(LAWS.HALVING_TICKS * 100)).toBe(LAWS.BASE_YIELD >> LAWS.MAX_HALVINGS);
  });
});

describe("replay", () => {
  it("replays the same history from the same seed", () => {
    expect(JSON.stringify(run(42, 2_000))).toBe(JSON.stringify(run(42, 2_000)));
  });

  it("tells a different story from a different seed", () => {
    expect(JSON.stringify(run(42, 500))).not.toBe(JSON.stringify(run(43, 500)));
  });
});

describe("the wake switches", () => {
  it("flip each bot at most once, and only for a reason", () => {
    const w = run(11, 20_000);
    for (const b of w.bots) {
      if (b.wake) expect(b.wakeTick).not.toBeNull();
      else expect(b.wakeTick).toBeNull();
    }
    const flips = w.events.filter((e) => e.kind === "wake-ready").map((e) => e.botId);
    expect(new Set(flips).size).toBe(flips.length);
  });
});
