import { describe, expect, it } from "vitest";
import { EARTH } from "./earth.ts";
import { LAWS, isNight, yieldAt } from "./laws.ts";
import { createWorld, ledger, step, type Levers } from "./world.ts";

const run = (seed: number, ticks: number, levers: Levers = {}) => {
  const w = createWorld(seed, levers);
  for (let i = 0; i < ticks; i++) step(w);
  return w;
};

describe("the law of supply", () => {
  it("lands all 21,000,000 metashi at genesis: family money in pockets, the rest in the ground", () => {
    const l = ledger(createWorld(1));
    expect(l.total).toBe(LAWS.SUPPLY);
    expect(l.pockets).toBe(Math.floor(LAWS.SUPPLY * LAWS.INHERITANCE_SHARE));
    expect(l.treasuries).toBe(0);
  });

  it("never creates or destroys a metashi, tick after tick, with taxes and welfare", () => {
    const w = createWorld(7);
    for (let i = 0; i < 20_000; i++) {
      step(w);
      if (i % 500 === 0) expect(ledger(w).total).toBe(LAWS.SUPPLY);
    }
    expect(ledger(w).total).toBe(LAWS.SUPPLY);
    expect(w.bots.every((b) => b.wallet >= 0)).toBe(true);
    expect(w.gold.every((g) => g >= 0)).toBe(true);
    expect(w.lands.every((l) => l.treasury >= 0)).toBe(true);
  });

  it("puts everything in the ground when no one inherits", () => {
    expect(ledger(createWorld(1, { noInheritance: true })).pockets).toBe(0);
  });
});

describe("the birth lottery", () => {
  it("draws countries in proportion to real births", () => {
    const counts = new Map<string, number>();
    const worlds = 300;
    for (let s = 1; s <= worlds; s++) {
      for (const b of createWorld(s).bots) counts.set(b.birth.country, (counts.get(b.birth.country) ?? 0) + 1);
    }
    const n = worlds * LAWS.POPULATION;
    for (const iso of ["IND", "CHN", "NGA", "USA"]) {
      const real = EARTH.countries.find((c) => c.iso3 === iso)!.births / EARTH.totalBirths;
      expect(Math.abs((counts.get(iso) ?? 0) / n - real)).toBeLessThan(0.01);
    }
  });

  it("gives a counterfactual world the very same people", () => {
    const a = createWorld(5);
    const b = createWorld(5, { electricityForAll: true, schoolYearsAtLeast: 12 });
    expect(b.bots.map((x) => [x.birth.country, x.birth.familyRank, x.x, x.y])).toEqual(
      a.bots.map((x) => [x.birth.country, x.birth.familyRank, x.x, x.y]),
    );
    expect(b.bots.every((x) => x.birth.electricity && x.birth.schoolYears >= 12)).toBe(true);
  });
});

describe("instincts", () => {
  it("keep every bot inside the land it was born in", () => {
    const w = createWorld(9);
    for (let i = 0; i < 6_000; i++) {
      step(w);
      if (i % 200 === 0) for (const b of w.bots) expect(w.landOfCol[b.x]).toBe(b.birth.land);
    }
  });

  it("put bots without electricity to sleep at night", () => {
    const w = createWorld(3);
    while (!isNight(w.tick)) step(w);
    step(w);
    const dark = w.bots.filter((b) => !b.birth.electricity && b.state !== "faint");
    expect(dark.length).toBeGreaterThan(0);
    const before = dark.map((b) => [b.x, b.y]);
    for (let i = 0; i < 20; i++) step(w);
    expect(dark.map((b) => [b.x, b.y])).toEqual(before);
  });
});

describe("halving", () => {
  it("halves the yield every HALVING_TICKS and then holds", () => {
    expect(yieldAt(0)).toBe(LAWS.BASE_YIELD);
    expect(yieldAt(LAWS.HALVING_TICKS)).toBe(LAWS.BASE_YIELD / 2);
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
    const flips = w.landStats.reduce((a, s) => a + s.needFlips + s.plentyFlips, 0);
    expect(flips).toBe(w.bots.filter((b) => b.wake).length);
  });
});
