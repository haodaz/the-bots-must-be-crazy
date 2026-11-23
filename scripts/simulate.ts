// Run the mindless world headless and print how it unfolds, day by day.
// Usage: node scripts/simulate.ts [seed] [days]

import { LAWS, yieldAt } from "../src/engine/laws.ts";
import { census, createWorld, ledger, step } from "../src/engine/world.ts";

const seed = Number(process.argv[2] ?? 1);
const days = Number(process.argv[3] ?? 30);
const w = createWorld(seed);

const pct = (v: number) => `${Math.round(v * 100)}%`;
console.log(`seed ${seed} · ${LAWS.POPULATION} bots · ${days} days of ${LAWS.DAY_TICKS} ticks\n`);
console.log("day  yield  ground      pockets     mining faint broke top10  need plenty");

for (let day = 1; day <= days; day++) {
  for (let i = 0; i < LAWS.DAY_TICKS; i++) step(w);
  const l = ledger(w);
  const c = census(w);
  console.log(
    [
      String(day).padStart(3),
      String(yieldAt(w.tick)).padStart(6),
      l.ground.toLocaleString("en-US").padStart(11),
      l.pockets.toLocaleString("en-US").padStart(11),
      String(c.mining).padStart(6),
      String(c.faint).padStart(5),
      String(c.broke).padStart(5),
      pct(c.top10Share).padStart(5),
      String(c.readyByNeed).padStart(5),
      String(c.readyByPlenty).padStart(6),
    ].join(" "),
  );
}
