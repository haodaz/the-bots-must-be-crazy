// Impact experiments: the same people, born the same way, in paired worlds where one thing is changed.
// Each pair shares a seed, so any difference in outcomes comes from the lever, not from luck.

import { LAWS } from "./laws.ts";
import { createWorld, step, type Levers, type World } from "./world.ts";

export type LandMetrics = { short: string; bots: number; starvingTicks: number; wallets: number[] };

export type Metrics = {
  /** Average days each bot spent starving. */
  starvingDays: number;
  /** Share of bots whose need switch flipped: they ran out of food and money. */
  needShare: number;
  /** Share of all pocket money held by the poorest half of bots. */
  poorestHalfShare: number;
  medianWallet: number;
  /** All metashi dug out of the ground: how much work turned into wealth. */
  mined: number;
  welfarePaid: number;
  lands: LandMetrics[];
};

export type Experiment = { key: string; label: string; question: string; levers: Levers };

export const EXPERIMENTS: Experiment[] = [
  {
    key: "school",
    label: "Twelve years of school for everyone",
    question: "What is schooling worth?",
    levers: { schoolYearsAtLeast: 12 },
  },
  {
    key: "electricity",
    label: "Electricity for everyone",
    question: "What is a light at night worth?",
    levers: { electricityForAll: true },
  },
  {
    key: "accounts",
    label: "A bank account for everyone",
    question: "What is it worth for help to be able to reach you?",
    levers: { accountsForAll: true },
  },
  {
    key: "tools",
    label: "Internet and tools for everyone",
    question: "What are better tools worth?",
    levers: { toolsForAll: true },
  },
  {
    key: "basics",
    label: "All four basics together",
    question: "What if every bot got school, light, an account and tools?",
    levers: { schoolYearsAtLeast: 12, electricityForAll: true, accountsForAll: true, toolsForAll: true },
  },
  {
    key: "noInheritance",
    label: "No family money: everyone starts at zero",
    question: "How much does where your family stands decide?",
    levers: { noInheritance: true },
  },
  {
    key: "resources",
    label: "Gold lands where the babies are",
    question: "What if resources were where the people are?",
    levers: { goldFollowsBirths: true },
  },
];

export function measure(w: World): Metrics {
  const wallets = w.bots.map((b) => b.wallet).sort((a, b) => a - b);
  const total = wallets.reduce((a, b) => a + b, 0);
  const poorHalf = wallets.slice(0, Math.floor(wallets.length / 2)).reduce((a, b) => a + b, 0);
  const n = w.bots.length;
  return {
    starvingDays: w.bots.reduce((a, b) => a + b.life.ticksStarving, 0) / n / LAWS.DAY_TICKS,
    needShare: w.bots.filter((b) => b.wake === "need").length / n,
    poorestHalfShare: total > 0 ? poorHalf / total : 0,
    medianWallet: wallets[Math.floor(n / 2)],
    mined: w.totals.mined,
    welfarePaid: w.landStats.reduce((a, s) => a + s.welfarePaid, 0),
    lands: w.lands.map((l, i) => {
      const bots = w.bots.filter((b) => b.birth.land === i);
      return {
        short: l.short,
        bots: bots.length,
        starvingTicks: bots.reduce((a, b) => a + b.life.ticksStarving, 0),
        wallets: bots.map((b) => b.wallet),
      };
    }),
  };
}

export function runWorld(seed: number, days: number, levers: Levers = {}): Metrics {
  const w = createWorld(seed, levers);
  for (let i = 0; i < days * LAWS.DAY_TICKS; i++) step(w);
  return measure(w);
}

export type Effect = {
  base: number;
  changed: number;
  /** Mean of paired differences (changed − base). */
  diff: number;
  /** 95% interval for the mean difference. */
  low: number;
  high: number;
  /** diff relative to base, or null when base is zero. */
  relative: number | null;
};

/** Paired comparison over seeds. */
export function effect(base: number[], changed: number[]): Effect {
  const n = base.length;
  const d = base.map((b, i) => changed[i] - b);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const md = mean(d);
  const sd = Math.sqrt(d.reduce((a, x) => a + (x - md) ** 2, 0) / Math.max(1, n - 1));
  const half = (1.96 * sd) / Math.sqrt(n);
  const mb = mean(base);
  return { base: mb, changed: mean(changed), diff: md, low: md - half, high: md + half, relative: mb !== 0 ? md / mb : null };
}

/** Days starving per bot in one land, pooled over all worlds (lands can be empty in a single world). */
export function landStarvingDays(ms: Metrics[], land: number): number {
  const bots = ms.reduce((a, m) => a + m.lands[land].bots, 0);
  const ticks = ms.reduce((a, m) => a + m.lands[land].starvingTicks, 0);
  return bots ? ticks / bots / LAWS.DAY_TICKS : 0;
}
