// Cards: the only way a player touches the world. A small hand, a few rounds of draws, one card a turn (every 5 years).
// Each kind of card is a fixed rule change; each copy draws its own strength (a percentage), reach (an area) and length (years; one engine day is a year).
// Every card keeps the law of supply: it can move metashi, never make or destroy it.

import { EARTH } from "./earth.ts";
import { LAWS } from "./laws.ts";
import { nextFloat, nextInt, type HasRng } from "./rng.ts";
import { fill, fmtN, log, productivity, returnToEconomy, splitInteger, type Bot, type Params, type World } from "./world.ts";

export type Family = "god" | "king" | "human";
export type Role = "watch" | Family;
export type Target = "area" | "nation" | "world" | "kingdom" | "self";

export type Kind =
  | "harvest"
  | "drought"
  | "skyGift"
  | "flood"
  | "plenty"
  | "schools"
  | "power"
  | "accounts"
  | "taxCut"
  | "taxRaise"
  | "trade"
  | "aid"
  | "sanction"
  | "toCity"
  | "nightSchool"
  | "getOnline"
  | "openAccount"
  | "workHarder"
  | "helpNeighbor";

export type Card = { uid: number; kind: Kind; pct: number; reach: Reach; days: number };
export type Reach = "small" | "wide" | "vast";
export const REACH: Record<Reach, number> = { small: 4, wide: 7, vast: 11 };

type Def = {
  family: Family;
  title: string;
  target: Target;
  /** Range of the card's strength, as a fraction. */
  pct: [number, number];
  days?: [number, number];
  flavor: string;
  /** Template: {pct} strength, {pts} points, {reach} small/wide/vast, {days} length. */
  text: string;
  /** How often it turns up in a deck. */
  weight: number;
};

const P = (x: number) => `${Math.round(x * 100)}%`;
const D = (d: number) => `${d} year${d === 1 ? "" : "s"}`;

/** The numbers that fill a card's text (in English; the page translates reach and days). */
export function cardParams(c: Card): Params {
  return { pct: P(c.pct), pts: Math.round(c.pct * 100), reach: c.reach, days: D(c.days), dayCount: c.days };
}

export const DEFS: Record<Kind, Def> = {
  // ---- God: the land, the weather, the sky. ----
  harvest: {
    family: "god",
    title: "Bountiful Harvest",
    target: "area",
    pct: [0.2, 0.5],
    days: [3, 8],
    flavor: "The fields remember the rain.",
    text: "Food costs {pct} less in a {reach} area for {days}.",
    weight: 3,
  },
  drought: {
    family: "god",
    title: "Drought",
    target: "area",
    pct: [0.3, 0.8],
    days: [3, 8],
    flavor: "The sky forgets.",
    text: "Food costs {pct} more in a {reach} area for {days}.",
    weight: 2,
  },
  skyGift: {
    family: "god",
    title: "Gift from the Sky",
    target: "area",
    pct: [0.04, 0.12],
    flavor: "What the sky was keeping, it gives early.",
    text: "{pct} of the gold still in the sky falls now on a {reach} area.",
    weight: 2,
  },
  flood: {
    family: "god",
    title: "Flood",
    target: "area",
    pct: [1, 1],
    days: [2, 5],
    flavor: "Water first, then mud, then waiting.",
    text: "No one can work in a {reach} area for {days}.",
    weight: 1,
  },
  plenty: {
    family: "god",
    title: "Season of Plenty",
    target: "world",
    pct: [0.15, 0.35],
    days: [2, 5],
    flavor: "Everything grows at once.",
    text: "Food costs {pct} less everywhere for {days}.",
    weight: 1,
  },

  // ---- King: one nation's laws, its treasury, its neighbours. ----
  schools: {
    family: "king",
    title: "Schools for All",
    target: "kingdom",
    pct: [0.3, 0.6],
    flavor: "A chalkboard in every village.",
    text: "Spend {pct} of your treasury: everyone in your nation gets at least 12 years of school.",
    weight: 2,
  },
  power: {
    family: "king",
    title: "Light the Nation",
    target: "kingdom",
    pct: [0.3, 0.6],
    flavor: "The night shift begins.",
    text: "Spend {pct} of your treasury: everyone in your nation gets electricity.",
    weight: 2,
  },
  accounts: {
    family: "king",
    title: "Accounts for All",
    target: "kingdom",
    pct: [0.1, 0.25],
    flavor: "Help needs an address.",
    text: "Spend {pct} of your treasury: everyone in your nation gets an account, so welfare can reach them.",
    weight: 2,
  },
  taxCut: {
    family: "king",
    title: "Tax Relief",
    target: "kingdom",
    pct: [0.03, 0.08],
    flavor: "Lighter purses at the gate.",
    text: "Your nation's tax falls by {pts} points.",
    weight: 1,
  },
  taxRaise: {
    family: "king",
    title: "Tax the Harvest",
    target: "kingdom",
    pct: [0.03, 0.08],
    flavor: "A fuller treasury, a thinner loaf.",
    text: "Your nation's tax rises by {pts} points.",
    weight: 1,
  },
  trade: {
    family: "king",
    title: "Trade Route",
    target: "nation",
    pct: [0.1, 0.3],
    days: [5, 10],
    flavor: "Grain one way, cloth the other.",
    text: "Choose a nation: food costs {pct} less in both of yours for {days}.",
    weight: 2,
  },
  aid: {
    family: "king",
    title: "Aid",
    target: "nation",
    pct: [0.2, 0.5],
    flavor: "A wagon of coin over the border.",
    text: "Choose a nation: send it {pct} of your treasury.",
    weight: 1,
  },
  sanction: {
    family: "king",
    title: "Sanctions",
    target: "nation",
    pct: [0.2, 0.5],
    days: [5, 10],
    flavor: "The gates close; the market empties.",
    text: "Choose a nation: food there costs {pct} more for {days}.",
    weight: 1,
  },

  // ---- Human: one life, its few crossroads. ----
  toCity: {
    family: "human",
    title: "Go to the City",
    target: "self",
    pct: [0, 0],
    flavor: "Everyone you know stays behind.",
    text: "Walk to your nation's capital, where the work is.",
    weight: 2,
  },
  nightSchool: {
    family: "human",
    title: "Night School",
    target: "self",
    pct: [0.25, 0.5],
    flavor: "Tired eyes, a borrowed book.",
    text: "Pay {pct} of your money: two more years of school.",
    weight: 2,
  },
  getOnline: {
    family: "human",
    title: "Get Online",
    target: "self",
    pct: [0.3, 0.6],
    flavor: "A secondhand phone and a signal.",
    text: "Pay {pct} of your money: you have tools from now on.",
    weight: 2,
  },
  openAccount: {
    family: "human",
    title: "Open an Account",
    target: "self",
    pct: [0.05, 0.15],
    flavor: "A name on a ledger.",
    text: "Pay {pct} of your money: welfare can reach you from now on.",
    weight: 1,
  },
  workHarder: {
    family: "human",
    title: "Work Harder",
    target: "self",
    pct: [0.2, 0.5],
    days: [3, 8],
    flavor: "Up before the sun.",
    text: "You earn {pct} more an hour for {days}.",
    weight: 2,
  },
  helpNeighbor: {
    family: "human",
    title: "Help a Neighbour",
    target: "self",
    pct: [0.1, 0.3],
    flavor: "Bread on the doorstep.",
    text: "Give {pct} of your money to the poorest bot in your nation.",
    weight: 1,
  },
};

export const DECK_SIZE = 12;
export const HAND_START = 4;
export const HAND_MAX = 5;
export const PLAYS_PER_DAY = 1;
/** Card players take a turn every this many years (engine days): draw one, play one, then the world runs on. */
export const TURN_DAYS = 5;

/** What goes into each family's deck of twelve: a fixed mix of kinds, shuffled. */
const MIX: Record<Family, Partial<Record<Kind, number>>> = {
  god: { harvest: 3, drought: 2, skyGift: 3, flood: 2, plenty: 2 },
  king: { schools: 2, power: 2, accounts: 2, taxCut: 1, taxRaise: 1, trade: 2, aid: 1, sanction: 1 },
  human: { toCity: 2, nightSchool: 2, getOnline: 2, openAccount: 2, workHarder: 2, helpNeighbor: 2 },
};

/** A deck for one family: the fixed mix, shuffled, each copy with its own strength, reach and length. */
export function dealDeck(s: HasRng, family: Family): Card[] {
  const kinds = (Object.entries(MIX[family]) as [Kind, number][]).flatMap(([k, n]) => Array.from({ length: n }, () => k));
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = nextInt(s, 0, i);
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  return kinds.slice(0, DECK_SIZE).map((kind, i) => {
    const d = DEFS[kind];
    const pct = Math.round((d.pct[0] + nextFloat(s) * (d.pct[1] - d.pct[0])) * 100) / 100;
    const reach = (["small", "wide", "vast"] as Reach[])[nextInt(s, 0, 2)];
    const days = d.days ? nextInt(s, d.days[0], d.days[1]) : 0;
    return { uid: i + 1, kind, pct, reach, days };
  });
}

export type PlayContext = { at?: { x: number; y: number }; ci?: number; kingdom?: number; botId?: number };
/** What happened, as a message template and its params (so the page can say it in any language). */
export type PlayResult = { ok: true; key: string; params: Params; text: string } | { ok: false; key: string; params: Params; reason: string };

/** Play a card on the world. */
export function playCard(w: World, c: Card, ctx: PlayContext): PlayResult {
  const d = DEFS[c.kind];
  const until = w.tick + c.days * LAWS.DAY_TICKS;
  const area = ctx.at ? { x: ctx.at.x, y: ctx.at.y, r: REACH[c.reach] } : undefined;
  const kingdom = ctx.kingdom != null ? w.countries[ctx.kingdom] : null;
  const target = ctx.ci != null ? w.countries[ctx.ci] : null;
  const me = ctx.botId != null ? w.bots[ctx.botId] : null;
  const where = area ? placeName(w, area.x, area.y) : "";
  const done = (key: string, params: Params = {}): PlayResult => {
    log(w, "card", key, params, me?.id);
    return { ok: true, key, params, text: fill(key, params) };
  };
  const no = (key: string, params: Params = {}): PlayResult => ({ ok: false, key, params, reason: fill(key, params) });

  if (d.target === "area" && !area) return no("Choose a place on the map.");
  if ((d.target === "kingdom" || d.target === "nation") && !kingdom) return no("You have no kingdom.");
  if (d.target === "nation" && (!target || ctx.ci === ctx.kingdom)) return no("Choose another nation.");
  if (d.target === "self" && !me) return no("You have no life in this world yet.");

  switch (c.kind) {
    case "harvest":
      w.mods.push({ kind: "food", mult: 1 - c.pct, until, area, label: d.title });
      return done("A bountiful harvest around {place}: food {pct} cheaper for {days}.", { place: where, pct: P(c.pct), days: D(c.days), dayCount: c.days });
    case "drought":
      w.mods.push({ kind: "food", mult: 1 + c.pct, until, area, label: d.title });
      return done("Drought around {place}: food {pct} dearer for {days}.", { place: where, pct: P(c.pct), days: D(c.days), dayCount: c.days });
    case "plenty":
      w.mods.push({ kind: "food", mult: 1 - c.pct, until, label: d.title });
      return done("A season of plenty: food {pct} cheaper everywhere for {days}.", { pct: P(c.pct), days: D(c.days), dayCount: c.days });
    case "flood":
      w.mods.push({ kind: "noWork", mult: 0, until, area, label: d.title });
      return done("Flood around {place}: no work there for {days}.", { place: where, days: D(c.days), dayCount: c.days });
    case "skyGift": {
      const tiles = landTiles(w, area!);
      if (!tiles.length) return no("The gold would fall into the sea. Choose land.");
      const amount = Math.floor(w.sky * c.pct);
      if (amount <= 0) return no("The sky is empty.");
      w.sky -= amount;
      splitInteger(amount, tiles.map(() => 1)).forEach((v, i) => (w.money[tiles[i]] += v));
      return done("A gift from the sky: {amount} metashi fell early around {place}.", { amount: fmtN(amount), place: where });
    }

    case "schools":
    case "power":
    case "accounts": {
      const k = kingdom!;
      const cost = Math.floor(k.treasury * c.pct);
      if (cost <= 0) return no("Your treasury is empty.");
      // Public works: the money becomes wages in your own economy.
      k.treasury -= cost;
      returnToEconomy(w, ctx.kingdom!, cost);
      const people = w.bots.filter((b) => b.birth.countryIdx === ctx.kingdom);
      if (c.kind === "schools") {
        k.policies.schoolYearsAtLeast = 12;
        for (const b of people) {
          b.birth.schoolYears = Math.max(12, b.birth.schoolYears);
          b.sight = Math.min(6, 2 + Math.floor(b.birth.schoolYears / 4));
        }
      } else if (c.kind === "power") {
        k.policies.electricityForAll = true;
        for (const b of people) b.birth.electricity = true;
      } else {
        k.policies.accountsForAll = true;
        for (const b of people) b.birth.account = true;
      }
      repriceNation(w, ctx.kingdom!);
      return done("{nation}: {policy}. {amount} metashi from the treasury became wages at home.", { nation: k.name, policy: d.title, amount: fmtN(cost) });
    }
    case "taxCut":
    case "taxRaise": {
      const k = kingdom!;
      k.taxRate = Math.max(0, Math.min(0.6, k.taxRate + (c.kind === "taxCut" ? -c.pct : c.pct)));
      return done("{nation}: tax is now {rate}.", { nation: k.name, rate: `${Math.round(k.taxRate * 100)}%` });
    }
    case "trade":
      w.mods.push({ kind: "food", mult: 1 - c.pct, until, ci: ctx.kingdom, label: d.title });
      w.mods.push({ kind: "food", mult: 1 - c.pct, until, ci: ctx.ci, label: d.title });
      return done("A trade route between {a} and {b}: food {pct} cheaper in both for {days}.", { a: kingdom!.name, b: target!.name, pct: P(c.pct), days: D(c.days), dayCount: c.days });
    case "aid": {
      const amount = Math.floor(kingdom!.treasury * c.pct);
      if (amount <= 0) return no("Your treasury is empty.");
      kingdom!.treasury -= amount;
      target!.treasury += amount;
      return done("{a} sent {amount} metashi in aid to {b}.", { a: kingdom!.name, b: target!.name, amount: fmtN(amount) });
    }
    case "sanction":
      w.mods.push({ kind: "food", mult: 1 + c.pct, until, ci: ctx.ci, label: d.title });
      return done("{a} sanctions {b}: food there {pct} dearer for {days}.", { a: kingdom!.name, b: target!.name, pct: P(c.pct), days: D(c.days), dayCount: c.days });

    case "toCity": {
      const home = w.countries[me!.birth.countryIdx];
      const capital = home.cities[0];
      me!.x = capital % w.width;
      me!.y = Math.floor(capital / w.width);
      return done("Bot #{id} left for the capital of {nation}.", { id: me!.id, nation: home.name });
    }
    case "nightSchool":
    case "getOnline":
    case "openAccount": {
      const fee = Math.floor(me!.wallet * c.pct);
      if (fee <= 0) return no("You have no money to pay for it.");
      if (c.kind === "openAccount" && me!.birth.account) return no("You already have an account.");
      if (c.kind === "getOnline" && me!.birth.tools) return no("You are already online.");
      me!.wallet -= fee;
      returnToEconomy(w, me!.birth.countryIdx, fee);
      if (c.kind === "nightSchool") {
        me!.birth.schoolYears = Math.min(18, me!.birth.schoolYears + 2);
        me!.sight = Math.min(6, 2 + Math.floor(me!.birth.schoolYears / 4));
      } else if (c.kind === "getOnline") me!.birth.tools = true;
      else me!.birth.account = true;
      return done("Bot #{id}: {choice}, for {amount} metashi.", { id: me!.id, choice: d.title, amount: fmtN(fee) });
    }
    case "workHarder":
      w.mods.push({ kind: "wage", mult: 1 + c.pct, until, botId: me!.id, label: d.title });
      return done("Bot #{id} works harder: {pct} more an hour for {days}.", { id: me!.id, pct: P(c.pct), days: D(c.days), dayCount: c.days });
    case "helpNeighbor": {
      const poorest = w.bots
        .filter((b: Bot) => b.birth.countryIdx === me!.birth.countryIdx && b.id !== me!.id)
        .sort((a, b) => a.wallet - b.wallet)[0];
      if (!poorest) return no("No one else lives in your nation.");
      const gift = Math.floor(me!.wallet * c.pct);
      if (gift <= 0) return no("You have nothing to give.");
      me!.wallet -= gift;
      poorest.wallet += gift;
      return done("Bot #{id} gave {amount} metashi to Bot #{other}.", { id: me!.id, other: poorest.id, amount: fmtN(gift) });
    }
  }
}

/** A nation's food price after its policies: more productive, cheaper food. */
function repriceNation(w: World, ci: number) {
  const k = w.countries[ci];
  k.foodPrice = Math.max(1, Math.round((k.baseFoodPrice * k.baseProductivity) / productivity(EARTH.countries[ci], k.policies)));
}

function landTiles(w: World, a: { x: number; y: number; r: number }) {
  const out: number[] = [];
  for (let y = Math.max(0, Math.floor(a.y - a.r)); y <= Math.min(w.height - 1, Math.ceil(a.y + a.r)); y++)
    for (let x = Math.max(0, Math.floor(a.x - a.r)); x <= Math.min(w.width - 1, Math.ceil(a.x + a.r)); x++)
      if ((x - a.x) ** 2 + (y - a.y) ** 2 <= a.r ** 2 && w.geo.cells[y * w.width + x] >= 0) out.push(y * w.width + x);
  return out;
}

function placeName(w: World, x: number, y: number) {
  const ci = w.geo.cells[Math.floor(y) * w.width + Math.floor(x)];
  return ci >= 0 ? w.countries[ci].name : "the open sea";
}
