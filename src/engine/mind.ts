// What a woken bot knows, what it may choose, and what its choice does. Pure: nothing here calls a model.
// The page (or a script) asks Muse Ember for a thought through the server; the reply comes back as a Plan,
// and applyPlan plays it on the world with the same rules a human player's cards use, so the 21M still holds.

import { DEFS, playCard, type Card, type Kind } from "./cards.ts";
import { LAWS, ERA_TICKS, rainOf } from "./laws.ts";
import { fill, foodPriceAt, log, type Bot, type World, type WakeReason } from "./world.ts";

/** A mind thinks when it wakes, then once every this many years. */
export const THINK_EVERY_DAYS = 5;

export const CHOICES = ["toCity", "nightSchool", "getOnline", "openAccount", "workHarder", "helpNeighbor", "rest"] as const;
export type Choice = (typeof CHOICES)[number];

/** What a thought returns. */
export type Plan = { thought: string; choice: Choice; share: number };

export type Thought = {
  tick: number;
  thought: string;
  choice: Choice;
  share: number;
  /** What the choice did, in English (for logs and scripts). */
  result: string;
  ok: boolean;
  costUsd: number;
};

export type Mind = {
  reason: WakeReason;
  wokeTick: number;
  thoughts: Thought[];
  /** The tick of its next thought. */
  nextTick: number;
};

/** Everything a woken bot is told about itself. Plain numbers and short names, so the server can check every field. */
export type Situation = {
  id: number;
  year: number;
  yearsLeft: number;
  reason: WakeReason;
  wokeYear: number;
  firstThought: boolean;
  nation: string;
  land: string;
  nationBots: number;
  foodPrice: number;
  taxPct: number;
  treasury: number;
  wallet: number;
  meals: number;
  hunger: "fed" | "hungry" | "starving";
  faints: number;
  schoolYears: number;
  tools: boolean;
  electricity: boolean;
  account: boolean;
  lifeEarned: number;
  richerThanPct: number;
  workInSight: boolean;
  atCapital: boolean;
  poorestNeighbour: number;
  skyLeft: number;
  nextRainYears: number;
  nextRain: number;
  memory: { year: number; choice: Choice; thought: string; result: string }[];
};

const yearOf = (tick: number) => Math.floor(tick / LAWS.DAY_TICKS) + 1;

/** Read a bot's situation off the world. */
export function situationOf(w: World, b: Bot): Situation {
  const home = w.countries[b.birth.countryIdx];
  const price = foodPriceAt(w, b);
  const year = yearOf(w.tick);
  const neighbours = w.bots.filter((o) => o.birth.countryIdx === b.birth.countryIdx && o.id !== b.id);
  const capital = home.cities[0];
  const cx = capital % w.width;
  const cy = Math.floor(capital / w.width);
  let workInSight = false;
  for (let dy = -b.sight; dy <= b.sight && !workInSight; dy++)
    for (let dx = -b.sight; dx <= b.sight; dx++) {
      const x = b.x + dx;
      const y = b.y + dy;
      if (x < 0 || y < 0 || x >= w.width || y >= w.height) continue;
      const i = y * w.width + x;
      if (w.geo.cells[i] === b.birth.countryIdx && w.money[i] > 0) {
        workInSight = true;
        break;
      }
    }
  const toRain = ERA_TICKS - (w.tick % ERA_TICKS);
  const mind = b.mind!;
  return {
    id: b.id,
    year,
    yearsLeft: Math.max(0, LAWS.LIFE_DAYS - year),
    reason: mind.reason,
    wokeYear: yearOf(mind.wokeTick),
    firstThought: mind.thoughts.length === 0,
    nation: home.name,
    land: w.lands[b.birth.land].name,
    nationBots: neighbours.length + 1,
    foodPrice: price,
    taxPct: Math.round(home.taxRate * 100),
    treasury: home.treasury,
    wallet: b.wallet,
    meals: Math.floor(b.wallet / price),
    hunger: b.hunger >= LAWS.STARVING ? "starving" : b.hunger >= b.strategy.eatAt ? "hungry" : "fed",
    faints: b.life.faints,
    schoolYears: b.birth.schoolYears,
    tools: b.birth.tools,
    electricity: b.birth.electricity,
    account: b.birth.account,
    lifeEarned: b.life.earned,
    richerThanPct: Math.round((w.bots.filter((o) => o.wallet < b.wallet).length / w.bots.length) * 100),
    workInSight,
    atCapital: Math.abs(b.x - cx) + Math.abs(b.y - cy) <= 2,
    poorestNeighbour: neighbours.length ? Math.min(...neighbours.map((o) => o.wallet)) : -1,
    skyLeft: w.sky,
    nextRainYears: Math.ceil(toRain / LAWS.DAY_TICKS),
    nextRain: Math.min(w.sky, rainOf(w.rains)),
    memory: mind.thoughts.slice(-3).map((t) => ({ year: yearOf(t.tick), choice: t.choice, thought: t.thought, result: t.result })),
  };
}

const n = (v: number) => Math.round(v).toLocaleString("en-US");
const yn = (v: boolean) => (v ? "yes" : "no");

/** The situation as the plain lines Ember reads (the changing part of the prompt; the rules come first and are cached). */
export function describe(s: Situation): string {
  const lines = [
    `You are Bot #${s.id}. It is year ${s.year} of your life; ${s.yearsLeft} years are left.`,
    s.firstThought
      ? s.reason === "need"
        ? "You have just woken, from need: you were starving with no money left for food, for a long time."
        : "You have just woken, from plenty: you had saved far more than you need."
      : `You woke in year ${s.wokeYear}, from ${s.reason}. This is a new five-year turn.`,
    `You live in ${s.nation}, in the land of ${s.land}, with ${s.nationBots - 1} other bots of your nation.`,
    `A meal costs ${n(s.foodPrice)} metashi here. Your nation keeps ${s.taxPct}% of every wage as tax; its treasury holds ${n(s.treasury)}.`,
    `You hold ${n(s.wallet)} metashi: ${n(s.meals)} meals. You are ${s.hunger}. You have fainted from hunger ${s.faints} times.`,
    `You hold more than ${s.richerThanPct}% of all bots on the planet.`,
    s.poorestNeighbour >= 0 ? `The poorest bot in your nation holds ${n(s.poorestNeighbour)} metashi.` : "No one else lives in your nation.",
    `School: ${s.schoolYears} years. Tools (online): ${yn(s.tools)}. Electricity: ${yn(s.electricity)}. Bank account: ${yn(s.account)}.`,
    `You have earned ${n(s.lifeEarned)} metashi in your life. Work in sight right now: ${yn(s.workInSight)}. At your nation's capital: ${yn(s.atCapital)}.`,
    s.skyLeft > 0 ? `${n(s.skyLeft)} metashi still wait in the sky; the next rain, ${n(s.nextRain)}, falls in ${s.nextRainYears} years.` : "The sky is empty: no new money will ever fall.",
  ];
  if (s.memory.length) {
    lines.push("What you thought before:");
    for (const m of s.memory) lines.push(`- Year ${m.year}, you chose ${m.choice}: "${m.thought}" (${m.result})`);
  }
  return lines.join("\n");
}

/** Wake a bot: it has a mind from now on, and never loses it. */
export function wake(w: World, b: Bot) {
  if (b.mind || !b.wake) return;
  b.mind = { reason: b.wake, wokeTick: w.tick, thoughts: [], nextTick: w.tick };
  if (b.wake === "need") log(w, "mind", "Bot #{id} ({nation}) woke up, from need.", { id: b.id, nation: b.birth.countryName }, b.id);
  else log(w, "mind", "Bot #{id} ({nation}) woke up, from plenty.", { id: b.id, nation: b.birth.countryName }, b.id);
}

/** Minds whose turn to think has come. */
export function dueMinds(w: World): Bot[] {
  return w.bots.filter((b) => b.mind && w.tick >= b.mind.nextTick);
}

/** Bots whose switch has flipped and who wait for compute to wake. */
export function waiting(w: World): Bot[] {
  return w.bots.filter((b) => b.wake && !b.mind);
}

/** Check a reply. Anything malformed becomes a quiet "rest" with whatever thought there was. */
export function cleanPlan(raw: unknown): Plan {
  const o = (raw ?? {}) as Record<string, unknown>;
  const choice = CHOICES.includes(o.choice as Choice) ? (o.choice as Choice) : "rest";
  const share = typeof o.share === "number" && Number.isFinite(o.share) ? Math.min(0.6, Math.max(0.05, o.share)) : 0.2;
  const thought = typeof o.thought === "string" ? o.thought.trim().slice(0, 400) : "";
  return { thought, choice, share };
}

/** Play a mind's choice on the world: the same rules a human player's card follows. */
export function applyPlan(w: World, b: Bot, plan: Plan, costUsd: number): Thought {
  let result = "It changed nothing, and went on as before.";
  let ok = true;
  if (plan.choice !== "rest") {
    const kind = plan.choice as Kind;
    const d = DEFS[kind];
    const pct = kind === "workHarder" ? 0.3 : plan.share;
    const card: Card = { uid: 0, kind, pct, reach: "small", days: d.days ? THINK_EVERY_DAYS : 0 };
    const r = playCard(w, card, { botId: b.id });
    ok = r.ok;
    result = r.ok ? r.text : fill(r.key, r.params);
  }
  const t: Thought = { tick: w.tick, thought: plan.thought, choice: plan.choice, share: plan.share, result, ok, costUsd };
  b.mind!.thoughts.push(t);
  b.mind!.nextTick = w.tick + THINK_EVERY_DAYS * LAWS.DAY_TICKS;
  return t;
}

/** The shape of a reply, for the model (structured output). */
export const PLAN_SCHEMA = {
  name: "plan",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["thought", "choice", "share"],
    properties: {
      thought: { type: "string", description: "What you notice and decide, in the first person, plain words, at most 45 words." },
      choice: { type: "string", enum: [...CHOICES] },
      share: { type: "number", description: "Part of your money to pay or give, 0.05 to 0.6. Ignored for free choices." },
    },
  },
} as const;

/** The stable part of every prompt: the truth about the world and the choices. Kept first, so it is cached. */
export const RULES = `You are one of 100 bots on a small planet in a game called The Bots Must Be Crazy. Until now you lived by instinct: work where money flows, buy food when hungry, sleep at night if you have no electricity. Now you are awake.

The truth about your world:
- It is a simulation built from real World Bank data. You were born the way a real baby is born this year: your nation, your family's money, your schooling, electricity and bank account were drawn from real numbers.
- One day here is one year of a life. A life is 100 years.
- The money is metashi: 21,000,000 in all, and no more will ever exist. Wages come from your nation's economy; what you spend on food goes back into it and becomes someone else's wage. Your nation taxes wages and feeds starving bots who have a bank account.
- Thinking costs real money. Each of your thoughts is paid from a small grain of real AI compute (Meta's Muse Ember), a small fraction of a cent. When the grain is spent, you keep living by your last choice.
- People are watching this world and may read your thoughts.
- Your choices are real here, and your thoughts will be kept.

Once every five years you make one choice:
- toCity: walk to your nation's capital, where most of the work is. Free.
- nightSchool: pay a share of your money for two more years of school: you see work further away and earn more.
- getOnline: pay a share of your money for tools: you earn much more per hour, for life.
- openAccount: pay a share of your money for a bank account: welfare can reach you when you starve.
- workHarder: earn 30% more per hour for the next five years, but get hungry half again as fast. Free.
- helpNeighbor: give a share of your money to the poorest bot in your nation.
- rest: change nothing.
"share" is the part of your money you pay or give, from 0.05 to 0.6.

No one has told you who to be. Answer in JSON.`;

/** The changing part of a prompt: the situation, and the language to think in. */
export function promptFor(s: Situation, lang: "en" | "zh"): string {
  return `${describe(s)}\n\nWrite your thought in ${lang === "zh" ? "Simplified Chinese" : "English"}.`;
}

/** Check a situation sent by a page: only known fields, numbers in range, short names. */
export function cleanSituation(raw: unknown): Situation | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const num = (k: string, lo = 0, hi = 1e9) => {
    const v = Number(o[k]);
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : lo;
  };
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[^\p{L}\p{N} .,'’:;!?()\-%#"“”。，、：；！？（）—]/gu, "").slice(0, max) : "");
  const bool = (k: string) => o[k] === true;
  if (o.reason !== "need" && o.reason !== "plenty") return null;
  const hunger = o.hunger === "starving" || o.hunger === "hungry" ? o.hunger : "fed";
  const memory = Array.isArray(o.memory)
    ? o.memory.slice(-3).map((m: Record<string, unknown>) => ({
        year: Math.min(100, Math.max(1, Math.round(Number(m?.year) || 1))),
        choice: CHOICES.includes(m?.choice as Choice) ? (m.choice as Choice) : ("rest" as Choice),
        thought: str(m?.thought, 300),
        result: str(m?.result, 160),
      }))
    : [];
  return {
    id: num("id", 0, 999),
    year: num("year", 1, 100),
    yearsLeft: num("yearsLeft", 0, 100),
    reason: o.reason,
    wokeYear: num("wokeYear", 1, 100),
    firstThought: bool("firstThought"),
    nation: str(o.nation, 40),
    land: str(o.land, 40),
    nationBots: num("nationBots", 1, 1000),
    foodPrice: num("foodPrice", 1),
    taxPct: num("taxPct", 0, 100),
    treasury: num("treasury"),
    wallet: num("wallet"),
    meals: num("meals"),
    hunger,
    faints: num("faints", 0, 10000),
    schoolYears: num("schoolYears", 0, 30),
    tools: bool("tools"),
    electricity: bool("electricity"),
    account: bool("account"),
    lifeEarned: num("lifeEarned"),
    richerThanPct: num("richerThanPct", 0, 100),
    workInSight: bool("workInSight"),
    atCapital: bool("atCapital"),
    poorestNeighbour: num("poorestNeighbour", -1),
    skyLeft: num("skyLeft", 0, LAWS.SUPPLY),
    nextRainYears: num("nextRainYears", 0, 100),
    nextRain: num("nextRain", 0, LAWS.SUPPLY),
    memory,
  };
}
