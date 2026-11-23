// Cards: the only way a player touches the world. A small hand, a few rounds of draws, one card a day.
// Each kind of card is a fixed rule change; each copy draws its own strength (a percentage), reach (an area) and length (days).
// Every card keeps the law of supply: it can move metashi, never make or destroy it.

import { EARTH } from "./earth.ts";
import { LAWS } from "./laws.ts";
import { nextFloat, nextInt, type HasRng } from "./rng.ts";
import { log, productivity, returnToEconomy, splitInteger, type Bot, type World } from "./world.ts";

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
  text: (c: Card) => string;
  /** How often it turns up in a deck. */
  weight: number;
};

const P = (x: number) => `${Math.round(x * 100)}%`;
const D = (d: number) => `${d} day${d === 1 ? "" : "s"}`;

export const DEFS: Record<Kind, Def> = {
  // ---- God: the land, the weather, the sky. ----
  harvest: {
    family: "god",
    title: "Bountiful Harvest",
    target: "area",
    pct: [0.2, 0.5],
    days: [2, 4],
    flavor: "The fields remember the rain.",
    text: (c) => `Food costs ${P(c.pct)} less in a ${c.reach} area for ${D(c.days)}.`,
    weight: 3,
  },
  drought: {
    family: "god",
    title: "Drought",
    target: "area",
    pct: [0.3, 0.8],
    days: [2, 4],
    flavor: "The sky forgets.",
    text: (c) => `Food costs ${P(c.pct)} more in a ${c.reach} area for ${D(c.days)}.`,
    weight: 2,
  },
  skyGift: {
    family: "god",
    title: "Gift from the Sky",
    target: "area",
    pct: [0.04, 0.12],
    flavor: "What the sky was keeping, it gives early.",
    text: (c) => `${P(c.pct)} of the gold still in the sky falls now on a ${c.reach} area.`,
    weight: 2,
  },
  flood: {
    family: "god",
    title: "Flood",
    target: "area",
    pct: [1, 1],
    days: [1, 3],
    flavor: "Water first, then mud, then waiting.",
    text: (c) => `No one can work in a ${c.reach} area for ${D(c.days)}.`,
    weight: 1,
  },
  plenty: {
    family: "god",
    title: "Season of Plenty",
    target: "world",
    pct: [0.15, 0.35],
    days: [1, 3],
    flavor: "Everything grows at once.",
    text: (c) => `Food costs ${P(c.pct)} less everywhere for ${D(c.days)}.`,
    weight: 1,
  },

  // ---- King: one nation's laws, its treasury, its neighbours. ----
  schools: {
    family: "king",
    title: "Schools for All",
    target: "kingdom",
    pct: [0.3, 0.6],
    flavor: "A chalkboard in every village.",
    text: (c) => `Spend ${P(c.pct)} of your treasury: everyone in your nation gets at least 12 years of school.`,
    weight: 2,
  },
  power: {
    family: "king",
    title: "Light the Nation",
    target: "kingdom",
    pct: [0.3, 0.6],
    flavor: "The night shift begins.",
    text: (c) => `Spend ${P(c.pct)} of your treasury: everyone in your nation gets electricity.`,
    weight: 2,
  },
  accounts: {
    family: "king",
    title: "Accounts for All",
    target: "kingdom",
    pct: [0.1, 0.25],
    flavor: "Help needs an address.",
    text: (c) => `Spend ${P(c.pct)} of your treasury: everyone in your nation gets an account, so welfare can reach them.`,
    weight: 2,
  },
  taxCut: {
    family: "king",
    title: "Tax Relief",
    target: "kingdom",
    pct: [0.03, 0.08],
    flavor: "Lighter purses at the gate.",
    text: (c) => `Your nation's tax falls by ${Math.round(c.pct * 100)} points.`,
    weight: 1,
  },
  taxRaise: {
    family: "king",
    title: "Tax the Harvest",
    target: "kingdom",
    pct: [0.03, 0.08],
    flavor: "A fuller treasury, a thinner loaf.",
    text: (c) => `Your nation's tax rises by ${Math.round(c.pct * 100)} points.`,
    weight: 1,
  },
  trade: {
    family: "king",
    title: "Trade Route",
    target: "nation",
    pct: [0.1, 0.3],
    days: [3, 6],
    flavor: "Grain one way, cloth the other.",
    text: (c) => `Choose a nation: food costs ${P(c.pct)} less in both of yours for ${D(c.days)}.`,
    weight: 2,
  },
  aid: {
    family: "king",
    title: "Aid",
    target: "nation",
    pct: [0.2, 0.5],
    flavor: "A wagon of coin over the border.",
    text: (c) => `Choose a nation: send it ${P(c.pct)} of your treasury.`,
    weight: 1,
  },
  sanction: {
    family: "king",
    title: "Sanctions",
    target: "nation",
    pct: [0.2, 0.5],
    days: [3, 6],
    flavor: "The gates close; the market empties.",
    text: (c) => `Choose a nation: food there costs ${P(c.pct)} more for ${D(c.days)}.`,
    weight: 1,
  },

  // ---- Human: one life, its few crossroads. ----
  toCity: {
    family: "human",
    title: "Go to the City",
    target: "self",
    pct: [0, 0],
    flavor: "Everyone you know stays behind.",
    text: () => `Walk to your nation's capital, where the work is.`,
    weight: 2,
  },
  nightSchool: {
    family: "human",
    title: "Night School",
    target: "self",
    pct: [0.25, 0.5],
    flavor: "Tired eyes, a borrowed book.",
    text: (c) => `Pay ${P(c.pct)} of your money: two more years of school.`,
    weight: 2,
  },
  getOnline: {
    family: "human",
    title: "Get Online",
    target: "self",
    pct: [0.3, 0.6],
    flavor: "A secondhand phone and a signal.",
    text: (c) => `Pay ${P(c.pct)} of your money: you have tools from now on.`,
    weight: 2,
  },
  openAccount: {
    family: "human",
    title: "Open an Account",
    target: "self",
    pct: [0.05, 0.15],
    flavor: "A name on a ledger.",
    text: (c) => `Pay ${P(c.pct)} of your money: welfare can reach you from now on.`,
    weight: 1,
  },
  workHarder: {
    family: "human",
    title: "Work Harder",
    target: "self",
    pct: [0.2, 0.5],
    days: [2, 4],
    flavor: "Up before the sun.",
    text: (c) => `You earn ${P(c.pct)} more an hour for ${D(c.days)}.`,
    weight: 2,
  },
  helpNeighbor: {
    family: "human",
    title: "Help a Neighbour",
    target: "self",
    pct: [0.1, 0.3],
    flavor: "Bread on the doorstep.",
    text: (c) => `Give ${P(c.pct)} of your money to the poorest bot in your nation.`,
    weight: 1,
  },
};

export const DECK_SIZE = 12;
export const HAND_START = 4;
export const HAND_MAX = 5;
export const PLAYS_PER_DAY = 1;

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
export type PlayResult = { ok: true; text: string } | { ok: false; reason: string };

/** Play a card on the world. */
export function playCard(w: World, c: Card, ctx: PlayContext): PlayResult {
  const d = DEFS[c.kind];
  const until = w.tick + c.days * LAWS.DAY_TICKS;
  const area = ctx.at ? { x: ctx.at.x, y: ctx.at.y, r: REACH[c.reach] } : undefined;
  const kingdom = ctx.kingdom != null ? w.countries[ctx.kingdom] : null;
  const target = ctx.ci != null ? w.countries[ctx.ci] : null;
  const me = ctx.botId != null ? w.bots[ctx.botId] : null;
  const where = area ? placeName(w, area.x, area.y) : "";
  const done = (text: string): PlayResult => {
    log(w, "card", text, me?.id);
    return { ok: true, text };
  };

  if (d.target === "area" && !area) return { ok: false, reason: "Choose a place on the map." };
  if ((d.target === "kingdom" || d.target === "nation") && !kingdom) return { ok: false, reason: "You have no kingdom." };
  if (d.target === "nation" && (!target || ctx.ci === ctx.kingdom)) return { ok: false, reason: "Choose another nation." };
  if (d.target === "self" && !me) return { ok: false, reason: "You have no life in this world yet." };

  switch (c.kind) {
    case "harvest":
      w.mods.push({ kind: "food", mult: 1 - c.pct, until, area, label: d.title });
      return done(`A bountiful harvest around ${where}: food ${P(c.pct)} cheaper for ${D(c.days)}.`);
    case "drought":
      w.mods.push({ kind: "food", mult: 1 + c.pct, until, area, label: d.title });
      return done(`Drought around ${where}: food ${P(c.pct)} dearer for ${D(c.days)}.`);
    case "plenty":
      w.mods.push({ kind: "food", mult: 1 - c.pct, until, label: d.title });
      return done(`A season of plenty: food ${P(c.pct)} cheaper everywhere for ${D(c.days)}.`);
    case "flood":
      w.mods.push({ kind: "noWork", mult: 0, until, area, label: d.title });
      return done(`Flood around ${where}: no work there for ${D(c.days)}.`);
    case "skyGift": {
      const tiles = landTiles(w, area!);
      if (!tiles.length) return { ok: false, reason: "The gold would fall into the sea. Choose land." };
      const amount = Math.floor(w.sky * c.pct);
      if (amount <= 0) return { ok: false, reason: "The sky is empty." };
      w.sky -= amount;
      splitInteger(amount, tiles.map(() => 1)).forEach((v, i) => (w.money[tiles[i]] += v));
      return done(`A gift from the sky: ${amount.toLocaleString("en-US")} metashi fell early around ${where}.`);
    }

    case "schools":
    case "power":
    case "accounts": {
      const k = kingdom!;
      const cost = Math.floor(k.treasury * c.pct);
      if (cost <= 0) return { ok: false, reason: "Your treasury is empty." };
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
      return done(`${k.name}: ${d.title.toLowerCase()}. ${cost.toLocaleString("en-US")} metashi from the treasury became wages at home.`);
    }
    case "taxCut":
    case "taxRaise": {
      const k = kingdom!;
      k.taxRate = Math.max(0, Math.min(0.6, k.taxRate + (c.kind === "taxCut" ? -c.pct : c.pct)));
      return done(`${k.name}: tax is now ${Math.round(k.taxRate * 100)}%.`);
    }
    case "trade":
      w.mods.push({ kind: "food", mult: 1 - c.pct, until, ci: ctx.kingdom, label: d.title });
      w.mods.push({ kind: "food", mult: 1 - c.pct, until, ci: ctx.ci, label: d.title });
      return done(`A trade route between ${kingdom!.name} and ${target!.name}: food ${P(c.pct)} cheaper in both for ${D(c.days)}.`);
    case "aid": {
      const amount = Math.floor(kingdom!.treasury * c.pct);
      if (amount <= 0) return { ok: false, reason: "Your treasury is empty." };
      kingdom!.treasury -= amount;
      target!.treasury += amount;
      return done(`${kingdom!.name} sent ${amount.toLocaleString("en-US")} metashi in aid to ${target!.name}.`);
    }
    case "sanction":
      w.mods.push({ kind: "food", mult: 1 + c.pct, until, ci: ctx.ci, label: d.title });
      return done(`${kingdom!.name} sanctions ${target!.name}: food there ${P(c.pct)} dearer for ${D(c.days)}.`);

    case "toCity": {
      const home = w.countries[me!.birth.countryIdx];
      const capital = home.cities[0];
      me!.x = capital % w.width;
      me!.y = Math.floor(capital / w.width);
      return done(`Bot #${me!.id} left for the capital of ${home.name}.`);
    }
    case "nightSchool":
    case "getOnline":
    case "openAccount": {
      const fee = Math.floor(me!.wallet * c.pct);
      if (fee <= 0) return { ok: false, reason: "You have no money to pay for it." };
      if (c.kind === "openAccount" && me!.birth.account) return { ok: false, reason: "You already have an account." };
      if (c.kind === "getOnline" && me!.birth.tools) return { ok: false, reason: "You are already online." };
      me!.wallet -= fee;
      returnToEconomy(w, me!.birth.countryIdx, fee);
      if (c.kind === "nightSchool") {
        me!.birth.schoolYears = Math.min(18, me!.birth.schoolYears + 2);
        me!.sight = Math.min(6, 2 + Math.floor(me!.birth.schoolYears / 4));
      } else if (c.kind === "getOnline") me!.birth.tools = true;
      else me!.birth.account = true;
      return done(`Bot #${me!.id}: ${d.title.toLowerCase()}, for ${fee.toLocaleString("en-US")} metashi.`);
    }
    case "workHarder":
      w.mods.push({ kind: "wage", mult: 1 + c.pct, until, botId: me!.id, label: d.title });
      return done(`Bot #${me!.id} works harder: ${P(c.pct)} more an hour for ${D(c.days)}.`);
    case "helpNeighbor": {
      const poorest = w.bots
        .filter((b: Bot) => b.birth.countryIdx === me!.birth.countryIdx && b.id !== me!.id)
        .sort((a, b) => a.wallet - b.wallet)[0];
      if (!poorest) return { ok: false, reason: "No one else lives in your nation." };
      const gift = Math.floor(me!.wallet * c.pct);
      if (gift <= 0) return { ok: false, reason: "You have nothing to give." };
      me!.wallet -= gift;
      poorest.wallet += gift;
      return done(`Bot #${me!.id} gave ${gift.toLocaleString("en-US")} metashi to Bot #${poorest.id}.`);
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
