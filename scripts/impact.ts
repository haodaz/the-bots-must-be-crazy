// Run the impact experiments: for each lever, the same seeds with and without it.
// Usage: node scripts/impact.ts [seeds=50] [days=30]   → reports/impact.json
// Plain code, no model calls: costs $0.

import { mkdirSync, writeFileSync } from "node:fs";
import { EARTH } from "../src/engine/earth.ts";
import { EXPERIMENTS, effect, landStarvingDays, runWorld, type Metrics } from "../src/engine/impact.ts";
import { LAWS } from "../src/engine/laws.ts";

const seeds = Number(process.argv[2] ?? 50);
const days = Number(process.argv[3] ?? 30);
const seedList = Array.from({ length: seeds }, (_, i) => i + 1);

const started = Date.now();
const base: Metrics[] = seedList.map((s) => runWorld(s, days));
const landNames = base[0].lands.map((l) => l.short);

const pick = (ms: Metrics[], f: (m: Metrics) => number) => ms.map(f);
const summary = (ms: Metrics[]) => ({
  starvingDays: avg(pick(ms, (m) => m.starvingDays)),
  needShare: avg(pick(ms, (m) => m.needShare)),
  poorestHalfShare: avg(pick(ms, (m) => m.poorestHalfShare)),
  medianWallet: avg(pick(ms, (m) => m.medianWallet)),
  earned: avg(pick(ms, (m) => m.earned)),
  welfarePaid: avg(pick(ms, (m) => m.welfarePaid)),
  landStarvingDays: landNames.map((_, i) => landStarvingDays(ms, i)),
  landMedianWallet: landNames.map((_, i) => median(ms.flatMap((m) => m.lands[i].wallets))),
  landBots: landNames.map((_, i) => ms.reduce((a, m) => a + m.lands[i].bots, 0) / ms.length),
});

const results = EXPERIMENTS.map((ex) => {
  const alt = seedList.map((s) => runWorld(s, days, ex.levers));
  const e = (f: (m: Metrics) => number) => effect(pick(base, f), pick(alt, f));
  process.stdout.write(`  ${ex.label}\n`);
  return {
    ...ex,
    effects: {
      starvingDays: e((m) => m.starvingDays),
      needShare: e((m) => m.needShare),
      poorestHalfShare: e((m) => m.poorestHalfShare),
      medianWallet: e((m) => m.medianWallet),
      earned: e((m) => m.earned),
    },
    world: summary(alt),
  };
});

const report = {
  generated: new Date().toISOString(),
  seeds,
  days,
  population: LAWS.POPULATION,
  data: { source: EARTH.source, fetched: EARTH.fetched },
  lands: landNames,
  baseline: summary(base),
  results,
  planets: "Each seed runs on its own newly generated planet with the real countries on it.",
  caveat:
    "A toy model built to make the birth lottery felt, not a forecast. Effects are differences between paired worlds with the same seeds, inside this model only.",
};

mkdirSync("reports", { recursive: true });
writeFileSync("reports/impact.json", JSON.stringify(report, null, 1));
console.log(`\n${seeds} seeds × ${EXPERIMENTS.length + 1} worlds × ${days} days in ${((Date.now() - started) / 1000).toFixed(0)}s → reports/impact.json\n`);

const pct = (x: number | null) => (x == null ? "—" : `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`);
console.log("lever".padEnd(42), "starving days", "need", "poorest half", "earned");
console.log(
  "baseline".padEnd(42),
  report.baseline.starvingDays.toFixed(2).padStart(13),
  pct(report.baseline.needShare).padStart(5),
  pct(report.baseline.poorestHalfShare).padStart(12),
);
for (const r of results) {
  const f = r.effects;
  console.log(
    r.label.padEnd(42),
    pct(f.starvingDays.relative).padStart(13),
    pct(f.needShare.relative).padStart(5),
    pct(f.poorestHalfShare.relative).padStart(12),
    pct(f.earned.relative).padStart(6),
  );
}

function avg(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}
