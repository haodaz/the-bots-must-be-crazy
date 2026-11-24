import { describe, expect, it } from "vitest";
import { LAWS } from "./laws.ts";
import { CHOICES, applyPlan, dueMinds, waiting, wake } from "./mind.ts";
import { indexReplay, replayTick, type Replay, type ReplayPlan } from "./replay.ts";
import { createWorld, ledger, step } from "./world.ts";

// Record a round the way scripts/record-round.ts does, with a stand-in for the model, then play it back.
function record(seed: number, ticks: number): Replay {
  const w = createWorld(seed, {}, { planet: "new" });
  const plans: ReplayPlan[] = [];
  while (w.tick < ticks) {
    step(w);
    for (const b of waiting(w)) wake(w, b);
    for (const b of dueMinds(w)) {
      const plan = { thought: `Bot ${b.id} at ${w.tick}`, choice: CHOICES[(b.id + w.tick) % CHOICES.length], share: 0.2 };
      plans.push({ ...plan, id: b.id, tick: w.tick, costUsd: 0.0002 });
      applyPlan(w, b, plan, 0.0002);
    }
  }
  return { round: "test", seed, planet: w.geo.name, lang: "en", recorded: "", thoughts: plans.length, costUsd: 0, outTick: null, plans, final: JSON.stringify(w.bots) } as Replay & { final: string };
}

describe("replay", () => {
  it("plays a recorded round back exactly: same thoughts at the same moments, same world", () => {
    const ticks = 30 * LAWS.DAY_TICKS;
    const rec = record(777, ticks) as Replay & { final: string };
    expect(rec.plans.length).toBeGreaterThan(5);
    const w = createWorld(rec.seed, {}, { planet: "new" });
    const ix = indexReplay(rec);
    const said: string[] = [];
    while (w.tick < ticks) for (const t of replayTick(w, ix)) said.push(t.thought.thought);
    expect(said).toEqual(rec.plans.map((p) => p.thought));
    expect(JSON.stringify(w.bots)).toBe(rec.final);
    expect(ledger(w).total).toBe(LAWS.SUPPLY);
  }, 60000);
});
