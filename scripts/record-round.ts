// Play one whole round (a hundred-year life) with real minds, and record it.
// The world runs on its rules; whenever a switch flips the bot wakes, and every five years each mind thinks once,
// with the world held still until the thought is back. The round's grain of compute caps what it can spend.
// Rehearsal by default ($0). Usage:
//   node scripts/record-round.ts [--seed=123] [--lang=en|zh]
//   MODEL_LIVE=1 node scripts/record-round.ts --seed=123      (real thoughts, at most one grain, default $0.04)
// Writes data/rounds/<round>.json: every thought with its year, choice, result and cost.

import { mkdirSync, writeFileSync } from "node:fs";
import { LAWS } from "../src/engine/laws.ts";
import { applyPlan, dueMinds, situationOf, waiting, wake } from "../src/engine/mind.ts";
import { createWorld, ledger, step } from "../src/engine/world.ts";
import { capUsd, spentUsd } from "../src/server/budget.ts";
import { liveAllowed, loadEnv } from "../src/server/meta.ts";
import { grainUsd, thinkFor } from "../src/server/mind.ts";

loadEnv();
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const seed = Number(arg("seed") ?? Math.floor(Math.random() * 1_000_000));
const lang = arg("lang") === "zh" ? "zh" : "en";
const live = liveAllowed();
const round = `${live ? "rec" : "mock"}-${seed}-${Date.now().toString(36)}`;

const w = createWorld(seed, {}, { planet: "new" });
console.log(`${live ? "LIVE" : "Rehearsal"} round ${round} on planet ${w.geo.name}. Grain $${grainUsd().toFixed(2)}. Spent so far overall: $${spentUsd().toFixed(4)} of $${capUsd().toFixed(2)}.`);

let grainOut = false;
let thoughts = 0;
let cost = 0;
const t0 = Date.now();
const end = LAWS.LIFE_DAYS * LAWS.DAY_TICKS;
while (w.tick < end) {
  step(w);
  if (grainOut) continue;
  for (const b of waiting(w)) wake(w, b);
  for (const b of dueMinds(w)) {
    const r = await thinkFor(round, situationOf(w, b), lang);
    if (!r.ok) {
      console.log(`  year ${Math.floor(w.tick / LAWS.DAY_TICKS) + 1}: ${r.reason}: ${r.message}`);
      if (r.reason === "grain" || r.reason === "budget") grainOut = true;
      break;
    }
    const t = applyPlan(w, b, r.plan, r.costUsd);
    thoughts++;
    cost += r.costUsd;
    console.log(`  Y${Math.floor(w.tick / LAWS.DAY_TICKS) + 1} #${b.id} ${b.mind!.reason} → ${t.choice}: ${t.thought.slice(0, 110)}`);
  }
}

const minds = w.bots.filter((b) => b.mind);
const l = ledger(w);
const out = {
  round,
  seed,
  planet: w.geo.name,
  lang,
  live,
  recorded: new Date().toISOString(),
  thoughts,
  costUsd: cost,
  costPerThought: thoughts ? cost / thoughts : 0,
  grainUsd: grainUsd(),
  grainSpentOut: grainOut,
  lawHolds: l.total === LAWS.SUPPLY,
  minds: minds.map((b) => ({ id: b.id, nation: b.birth.countryName, reason: b.mind!.reason, wokeTick: b.mind!.wokeTick, thoughts: b.mind!.thoughts })),
};
mkdirSync("data/rounds", { recursive: true });
writeFileSync(`data/rounds/${round}.json`, JSON.stringify(out, null, 2));
console.log(
  `\n${minds.length} minds woke, ${thoughts} thoughts, $${cost.toFixed(5)} (${thoughts ? `$${(cost / thoughts).toFixed(6)} a thought` : "no thoughts"}). ` +
    `Law holds: ${out.lawHolds}. ${((Date.now() - t0) / 1000).toFixed(0)} s. → data/rounds/${round}.json`,
);
