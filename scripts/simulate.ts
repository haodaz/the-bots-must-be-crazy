// Run one world headless and print how each land fares.
// Usage: node scripts/simulate.ts [seed] [days]

import { LAWS } from "../src/engine/laws.ts";
import { census, createWorld, ledger, step } from "../src/engine/world.ts";

const seed = Number(process.argv[2] ?? 1);
const days = Number(process.argv[3] ?? 30);
const w = createWorld(seed);
for (let i = 0; i < days * LAWS.DAY_TICKS; i++) step(w);

const l = ledger(w);
const c = census(w);
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
console.log(`seed ${seed} · ${days} days · ground ${fmt(l.ground)} · pockets ${fmt(l.pockets)} · treasuries ${fmt(l.treasuries)} · total ${fmt(l.total)}`);
console.log(`starving now ${c.faint} · need ${c.readyByNeed} · plenty ${c.readyByPlenty} · richest ten hold ${Math.round(c.top10Share * 100)}%\n`);
console.log("land                      bots  food  tax  median wallet  starving days/bot  need  plenty  welfare");
w.lands.forEach((land, i) => {
  const bots = w.bots.filter((b) => b.birth.land === i);
  const wallets = bots.map((b) => b.wallet).sort((a, b) => a - b);
  const s = w.landStats[i];
  console.log(
    [
      land.short.padEnd(24),
      String(bots.length).padStart(5),
      String(land.foodPrice).padStart(5),
      `${Math.round(land.taxRate * 100)}%`.padStart(4),
      fmt(wallets[Math.floor(wallets.length / 2)] ?? 0).padStart(14),
      (bots.length ? s.starvingTicks / bots.length / LAWS.DAY_TICKS : 0).toFixed(2).padStart(18),
      String(s.needFlips).padStart(5),
      String(s.plentyFlips).padStart(7),
      fmt(s.welfarePaid).padStart(8),
    ].join(" "),
  );
});
