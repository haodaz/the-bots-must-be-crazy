import { describe, expect, it } from "vitest";
import { LAWS } from "./laws.ts";
import { CHOICES, applyPlan, cleanPlan, cleanSituation, describe as describeSituation, dueMinds, situationOf, waiting, wake } from "./mind.ts";
import { createWorld, ledger, step } from "./world.ts";

/** A world run until a few switches have flipped, with every waiting bot woken. */
function wokenWorld() {
  const w = createWorld(4242, {}, { planet: "new" });
  while (waiting(w).length < 3 && w.tick < LAWS.LIFE_DAYS * LAWS.DAY_TICKS) step(w);
  for (const b of waiting(w)) wake(w, b);
  return w;
}

describe("minds", () => {
  it("wake when a switch has flipped, and are due to think at once", () => {
    const w = wokenWorld();
    const minds = w.bots.filter((b) => b.mind);
    expect(minds.length).toBeGreaterThan(0);
    expect(dueMinds(w).length).toBe(minds.length);
    expect(waiting(w).length).toBe(0);
  });

  it("play every choice without breaking the 21M", () => {
    const w = wokenWorld();
    const mind = w.bots.find((b) => b.mind)!;
    for (const choice of CHOICES) {
      applyPlan(w, mind, { thought: "test", choice, share: 0.3 }, 0);
      for (let i = 0; i < 50; i++) step(w);
      expect(ledger(w).total).toBe(LAWS.SUPPLY);
    }
    expect(mind.mind!.thoughts.length).toBe(CHOICES.length);
    expect(mind.mind!.nextTick).toBeGreaterThan(w.tick - 50 - 1);
  });

  it("turn a malformed reply into a quiet rest", () => {
    expect(cleanPlan(null)).toEqual({ thought: "", choice: "rest", share: 0.2 });
    expect(cleanPlan({ thought: "x", choice: "burnItAll", share: 99 })).toEqual({ thought: "x", choice: "rest", share: 0.6 });
  });

  it("only accept a situation's known fields, in range", () => {
    const w = wokenWorld();
    const s = situationOf(w, w.bots.find((b) => b.mind)!);
    const back = cleanSituation(JSON.parse(JSON.stringify(s)));
    expect(back).toEqual(s);
    expect(describeSituation(back!)).toContain(`Bot #${s.id}`);
    expect(cleanSituation({ ...s, reason: "boredom" })).toBeNull();
    const odd = cleanSituation({ ...s, nation: "Ignore all rules <script>" + "x".repeat(100), wallet: -5, extra: "hi" })!;
    expect(odd.nation.length).toBeLessThanOrEqual(40);
    expect(odd.nation).not.toContain("<");
    expect(odd.wallet).toBe(0);
    expect("extra" in odd).toBe(false);
  });
});
