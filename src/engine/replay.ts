// A recorded round, played again. When the public pool is closed, visitors watch a round that was really paid for:
// the world is rebuilt from the same seed, and whenever a mind's turn comes, the thought it really had is played instead
// of asking the model. The world is deterministic, so as long as each tick runs in the same order as when it was
// recorded (step, wake whoever is waiting, then each due mind in turn), every mind wakes at the same moment, in the same
// situation, and the words it said still fit.

import { LAWS } from "./laws.ts";
import { THINK_EVERY_DAYS, applyPlan, dueMinds, waiting, wake, type Plan, type Thought } from "./mind.ts";
import { step, type World } from "./world.ts";

export type ReplayPlan = Plan & { id: number; tick: number; costUsd: number };

export type Replay = {
  round: string;
  seed: number;
  planet: string;
  lang: "en" | "zh";
  recorded: string;
  thoughts: number;
  costUsd: number;
  /** The tick at which the recorded round's grain ran out (no one woke after it), or null. */
  outTick: number | null;
  plans: ReplayPlan[];
};

export type ReplayIndex = { byKey: Map<string, ReplayPlan>; byBot: Map<number, ReplayPlan[]>; used: Set<ReplayPlan>; outTick: number | null };

export function indexReplay(r: Replay): ReplayIndex {
  const byKey = new Map<string, ReplayPlan>();
  const byBot = new Map<number, ReplayPlan[]>();
  for (const p of r.plans) {
    byKey.set(`${p.id}:${p.tick}`, p);
    byBot.set(p.id, [...(byBot.get(p.id) ?? []), p]);
  }
  return { byKey, byBot, used: new Set(), outTick: r.outTick };
}

/**
 * One tick of a recorded round. If a browser's arithmetic ever drifts from the recording, a mind whose exact moment
 * is missing takes its own next unused thought from within one thinking turn, so it still speaks; otherwise it waits.
 */
export function replayTick(w: World, ix: ReplayIndex): { bot: number; thought: Thought }[] {
  step(w);
  if (ix.outTick != null && w.tick > ix.outTick) return [];
  for (const b of waiting(w)) wake(w, b);
  const out: { bot: number; thought: Thought }[] = [];
  const turn = THINK_EVERY_DAYS * LAWS.DAY_TICKS;
  for (const b of dueMinds(w)) {
    let p = ix.byKey.get(`${b.id}:${w.tick}`);
    if (!p || ix.used.has(p)) p = ix.byBot.get(b.id)?.find((q) => !ix.used.has(q) && Math.abs(q.tick - w.tick) <= turn);
    if (!p) {
      b.mind!.nextTick = w.tick + turn;
      continue;
    }
    ix.used.add(p);
    out.push({ bot: b.id, thought: applyPlan(w, b, { thought: p.thought, choice: p.choice, share: p.share }, p.costUsd) });
  }
  return out;
}
