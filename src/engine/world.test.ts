import { describe, expect, it } from "vitest";
import { EARTH } from "./earth.ts";
import { ERA_TICKS, LAWS, isNight, rainOf } from "./laws.ts";
import { generatePlanet, WIDTH, HEIGHT } from "./planet.ts";
import { createWorld, ledger, step, type Levers } from "./world.ts";

const run = (seed: number, ticks: number, levers: Levers = {}, planet: "earth" | "new" = "earth") => {
  const w = createWorld(seed, levers, { planet });
  for (let i = 0; i < ticks; i++) step(w);
  return w;
};

describe("the law of supply", () => {
  it("rains half the supply at genesis: family money in pockets, the rest in the economy", () => {
    const l = ledger(createWorld(1));
    expect(l.total).toBe(LAWS.SUPPLY);
    expect(l.sky).toBe(LAWS.SUPPLY - rainOf(0));
    expect(l.pockets).toBe(Math.floor(rainOf(0) * LAWS.INHERITANCE_SHARE));
  });

  for (const planet of ["earth", "new"] as const) {
    it(`never creates or destroys a metashi, through rains, wages, food, tax and welfare (${planet})`, () => {
      const w = createWorld(7, {}, { planet });
      for (let i = 0; i < 20_000; i++) {
        step(w);
        if (i % 500 === 0) expect(ledger(w).total).toBe(LAWS.SUPPLY);
      }
      expect(ledger(w).total).toBe(LAWS.SUPPLY);
      expect(w.bots.every((b) => b.wallet >= 0)).toBe(true);
      expect(w.money.every((m) => m >= 0)).toBe(true);
      expect(w.countries.every((c) => c.treasury >= 0)).toBe(true);
    });
  }

  it("halves each rain, like Bitcoin's block rewards", () => {
    const w = createWorld(2);
    const before = w.sky;
    for (let i = 0; i <= ERA_TICKS; i++) step(w);
    expect(before - w.sky).toBe(rainOf(1));
    expect(rainOf(1)).toBe(rainOf(0) / 2);
  });

  it("rains seven times in whole metashi, and the last rain empties the sky in year 60", () => {
    const rains = Array.from({ length: LAWS.RAINS + 1 }, (_, i) => rainOf(i));
    expect(rains).toEqual([10_500_000, 5_250_000, 2_625_000, 1_312_500, 656_250, 328_125, 328_125, 0]);
    expect(rains.reduce((a, b) => a + b, 0)).toBe(LAWS.SUPPLY);
    const w = createWorld(3);
    const lastRain = (LAWS.RAINS - 1) * ERA_TICKS;
    while (w.tick < lastRain) step(w);
    expect(w.sky).toBe(rainOf(LAWS.RAINS - 1));
    step(w);
    expect(w.sky).toBe(0);
    expect(lastRain / LAWS.DAY_TICKS).toBe(60);
  });

  it("puts everything in the economy when no one inherits", () => {
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

describe("planets", () => {
  it("make a new planet with an Earth-like share of land and room for every real country", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const g = generatePlanet(seed);
      const land = g.cells.filter((c) => c >= 0).length / (WIDTH * HEIGHT);
      expect(land).toBeGreaterThan(0.25);
      expect(land).toBeLessThan(0.37);
      expect(new Set(g.cells.filter((c) => c >= 0)).size).toBe(EARTH.countries.length);
    }
  });

  it("are different from seed to seed, and the same for the same seed", () => {
    expect(generatePlanet(4).cells).toEqual(generatePlanet(4).cells);
    expect(generatePlanet(4).cells).not.toEqual(generatePlanet(5).cells);
  });
});

describe("instincts", () => {
  it("keep every bot inside the country it was born in", () => {
    for (const planet of ["earth", "new"] as const) {
      const w = createWorld(9, {}, { planet });
      for (let i = 0; i < 6_000; i++) {
        step(w);
        if (i % 200 === 0) for (const b of w.bots) expect(w.geo.cells[b.y * w.width + b.x]).toBe(b.birth.countryIdx);
      }
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

describe("replay", () => {
  it("replays the same history from the same seed", () => {
    expect(JSON.stringify(run(42, 2_000))).toBe(JSON.stringify(run(42, 2_000)));
    expect(JSON.stringify(run(42, 2_000, {}, "new"))).toBe(JSON.stringify(run(42, 2_000, {}, "new")));
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
