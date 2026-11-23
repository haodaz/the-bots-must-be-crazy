// The world before any mind wakes up: bots living on instinct, each born by a real-world birth lottery.
// Pure and deterministic: the same seed (and the same levers) replays the same history. Nothing here calls a model.

import { EARTH, sigmaFromTop10, invNorm, type Country, type Earth } from "./earth.ts";
import { LAWS, isNight, swingFor, yieldAt } from "./laws.ts";
import { nextFloat, nextInt } from "./rng.ts";

/** A bot's instincts. Today they come from its birth; one day a mind may rewrite its own. */
export type Strategy = {
  /** Hunger level at which it buys food (if it can pay). */
  eatAt: number;
  /** Chance, 0..1, of walking on in the same direction when it sees no gold. */
  straightness: number;
  /** Skips gold that another bot is already standing on. */
  avoidCrowds: boolean;
  /** Heads for the richest gold it can see, not the nearest. Comes with schooling. */
  prefersRich: boolean;
};

export type WakeReason = "need" | "plenty";

/** What a bot drew at birth. Every field comes from real-world numbers for its country. */
export type Birth = {
  country: string;
  countryName: string;
  land: number;
  /** Where its family sits on its country's income ladder, 0 (poorest) to 1 (richest). */
  familyRank: number;
  /** Family money it started with, in metashi. */
  inheritance: number;
  schoolYears: number;
  /** Grew up online, so it has tools: digs faster. */
  tools: boolean;
  /** Has electricity: can keep working at night. */
  electricity: boolean;
  /** Has a bank or mobile-money account: welfare can reach it. */
  account: boolean;
};

/** What happened over its life. The raw material for its life file. */
export type Life = {
  mined: number;
  taxPaid: number;
  meals: number;
  welfareMeals: number;
  peakWallet: number;
  faints: number;
  ticksDigging: number;
  ticksSearching: number;
  ticksAsleep: number;
  ticksStarving: number;
  firstGoldTick: number | null;
};

export type Bot = {
  id: number;
  x: number;
  y: number;
  dir: number;
  /** How far it can see gold, in tiles. Grows with schooling. */
  sight: number;
  wallet: number;
  hunger: number;
  birth: Birth;
  life: Life;
  strategy: Strategy;
  state: "roaming" | "mining" | "faint" | "asleep";
  /** Ticks starving with no money for food (resets when it eats). */
  needTicks: number;
  wake: WakeReason | null;
  wakeTick: number | null;
};

export type WorldLand = {
  name: string;
  short: string;
  x0: number;
  /** Exclusive. */
  x1: number;
  foodPrice: number;
  taxRate: number;
  /** Tax collected and not yet paid out as welfare. Part of the 21M. */
  treasury: number;
};

/** Counters per land, for the impact report. */
export type LandStats = {
  mined: number;
  taxed: number;
  welfarePaid: number;
  starvingTicks: number;
  needFlips: number;
  plentyFlips: number;
};

/** Policy changes for counterfactual worlds. Applied after the draws, so the same seed gives the same people. */
export type Levers = Partial<{
  /** Everyone gets at least this many years of school. */
  schoolYearsAtLeast: number;
  electricityForAll: boolean;
  accountsForAll: boolean;
  toolsForAll: boolean;
  /** Everyone starts with nothing: no family money. */
  noInheritance: boolean;
  /** Gold lands where the babies are born, not where today's wealth is. */
  goldFollowsBirths: boolean;
}>;

export type EventKind = "genesis" | "halving" | "faint" | "recover" | "wake-ready";
export type WorldEvent = { tick: number; kind: EventKind; botId?: number; text: string };

export type World = {
  seed: number;
  levers: Levers;
  rng: number;
  tick: number;
  width: number;
  height: number;
  /** Metashi lying in each tile, row by row. */
  gold: number[];
  lands: WorldLand[];
  /** Land index of each column. */
  landOfCol: number[];
  bots: Bot[];
  events: WorldEvent[];
  totals: { mined: number; spentOnFood: number };
  landStats: LandStats[];
};

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export function createWorld(seed: number, levers: Levers = {}, earth: Earth = EARTH): World {
  const width = LAWS.WIDTH;
  const height = LAWS.HEIGHT;
  const w: World = {
    seed,
    levers,
    rng: seed | 0,
    tick: 0,
    width,
    height,
    gold: new Array(width * height).fill(0),
    lands: [],
    landOfCol: [],
    bots: [],
    events: [],
    totals: { mined: 0, spentOnFood: 0 },
    landStats: [],
  };

  // Lands: one strip per region, wider for more real land area (square root, so small regions stay visible).
  const cols = splitColumns(
    earth.lands.map((l) => Math.sqrt(l.landShare)),
    width,
    LAWS.MIN_LAND_COLS,
  );
  const worldPrice = earth.lands.reduce((a, l) => a + l.priceLevel * l.birthsShare, 0);
  let x = 0;
  earth.lands.forEach((l, i) => {
    const rel = Math.min(LAWS.PRICE_RANGE[1], Math.max(LAWS.PRICE_RANGE[0], l.priceLevel / worldPrice));
    w.lands.push({
      name: l.name,
      short: l.short,
      x0: x,
      x1: x + cols[i],
      foodPrice: Math.round(LAWS.FOOD_PRICE * rel),
      taxRate: l.taxPctGdp / 100,
      treasury: 0,
    });
    for (let c = 0; c < cols[i]; c++) w.landOfCol.push(i);
    w.landStats.push({ mined: 0, taxed: 0, welfarePaid: 0, starvingTicks: 0, needFlips: 0, plentyFlips: 0 });
    x += cols[i];
  });

  // Genesis, part 1: most of the fallen money lands in the ground, shared out like today's wealth (real GDP).
  const pool = Math.floor(LAWS.SUPPLY * LAWS.INHERITANCE_SHARE);
  const ground = LAWS.SUPPLY - pool;
  const goldShares = earth.lands.map((l) => (levers.goldFollowsBirths ? l.birthsShare : l.gdpShare));
  const landGold = splitInteger(ground, goldShares);
  const landPatches = splitColumns(goldShares, LAWS.PATCHES, 1);
  w.lands.forEach((land, i) => {
    const weights = Array.from({ length: landPatches[i] }, () => Math.pow(1 - nextFloat(w), -1.2));
    splitInteger(landGold[i], weights).forEach((amount) => {
      landPatch(w, i, nextInt(w, land.x0, land.x1 - 1), nextInt(w, 0, height - 1), amount);
    });
  });

  // Births: each bot is drawn the way a real baby is born this year.
  const cumulative: number[] = [];
  let acc = 0;
  for (const c of earth.countries) cumulative.push((acc += c.births));
  const familyWeights: number[] = [];

  for (let id = 0; id < LAWS.POPULATION; id++) {
    const pick = nextFloat(w) * acc;
    const country: Country = earth.countries[cumulative.findIndex((v) => v > pick)];
    const landIdx = w.lands.findIndex((l) => l.name === country.region);
    const land = w.lands[landIdx];

    const familyRank = Math.min(0.999, Math.max(0.001, nextFloat(w)));
    const sigma = sigmaFromTop10(country.top10Share);
    familyWeights.push(country.gdpPerCapitaPpp * Math.exp(sigma * invNorm(familyRank) - (sigma * sigma) / 2));

    // Schooling follows the country's expected years, a little more for richer families, plus luck.
    let schoolYears = Math.round(country.schoolYears + (familyRank - 0.5) * 6 + (nextFloat(w) - 0.5) * 4);
    schoolYears = Math.min(18, Math.max(0, schoolYears));
    let tools = nextFloat(w) * 100 < country.internetPct;
    let electricity = nextFloat(w) * 100 < country.electricityPct;
    let account = nextFloat(w) * 100 < country.accountPct;

    const bx = nextInt(w, land.x0, land.x1 - 1);
    const by = nextInt(w, 0, height - 1);
    const dir = nextInt(w, 0, 3);
    const hunger = nextInt(w, 0, 60);
    const eatAt = nextInt(w, 40, 100);
    const straightness = 0.5 + 0.45 * nextFloat(w);
    const avoidCrowds = nextFloat(w) < 0.3;

    // Levers change circumstances after the draw, so a counterfactual world has the very same people.
    if (levers.schoolYearsAtLeast != null) schoolYears = Math.max(schoolYears, levers.schoolYearsAtLeast);
    if (levers.toolsForAll) tools = true;
    if (levers.electricityForAll) electricity = true;
    if (levers.accountsForAll) account = true;

    w.bots.push({
      id,
      x: bx,
      y: by,
      dir,
      sight: Math.min(6, 2 + Math.floor(schoolYears / 4)),
      wallet: 0,
      hunger,
      birth: {
        country: country.iso3,
        countryName: country.name,
        land: landIdx,
        familyRank,
        inheritance: 0,
        schoolYears,
        tools,
        electricity,
        account,
      },
      life: {
        mined: 0,
        taxPaid: 0,
        meals: 0,
        welfareMeals: 0,
        peakWallet: 0,
        faints: 0,
        ticksDigging: 0,
        ticksSearching: 0,
        ticksAsleep: 0,
        ticksStarving: 0,
        firstGoldTick: null,
      },
      strategy: { eatAt, straightness, avoidCrowds, prefersRich: schoolYears >= 12 },
      state: "roaming",
      needTicks: 0,
      wake: null,
      wakeTick: null,
    });
  }

  // Genesis, part 2: the rest falls straight into pockets as family money, shared along real income ladders.
  if (levers.noInheritance) {
    returnToGround(w, pool);
  } else {
    const shares = splitInteger(pool, familyWeights);
    w.bots.forEach((b, i) => {
      b.wallet = shares[i];
      b.birth.inheritance = shares[i];
      b.life.peakWallet = shares[i];
    });
  }

  log(
    w,
    "genesis",
    `${LAWS.SUPPLY.toLocaleString("en-US")} metashi fell from the sky. ${LAWS.POPULATION} bots were born the way real babies are born this year.`,
  );
  return w;
}

/** Half of a patch lands on its centre, the rest is shared by neighbours in the same land. */
function landPatch(w: World, landIdx: number, cx: number, cy: number, amount: number) {
  const around = DIRS.map(([dx, dy]) => [cx + dx, cy + dy] as const).filter(
    ([x, y]) => inBounds(w, x, y) && w.landOfCol[x] === landIdx,
  );
  const share = around.length ? Math.floor(amount / 2 / around.length) : 0;
  for (const [x, y] of around) w.gold[idx(w, x, y)] += share;
  w.gold[idx(w, cx, cy)] += amount - share * around.length;
}

export function step(w: World): void {
  const t = w.tick;
  if (t > 0 && t % LAWS.HALVING_TICKS === 0 && t / LAWS.HALVING_TICKS <= LAWS.MAX_HALVINGS) {
    log(w, "halving", `Halving. A swing now digs ${yieldAt(t)} metashi.`);
  }

  const occupied = new Uint8Array(w.width * w.height);
  for (const b of w.bots) occupied[idx(w, b.x, b.y)]++;
  // A tile can be dug once per tick: whoever gets there first digs, the rest must look elsewhere.
  const dug = new Uint8Array(w.width * w.height);
  const night = isNight(t);

  // Take turns from a different bot each tick, so no one always goes first.
  const n = w.bots.length;
  for (let k = 0; k < n; k++) act(w, w.bots[(t + k) % n], occupied, dug, night);

  w.tick++;
}

function act(w: World, b: Bot, occupied: Uint8Array, dug: Uint8Array, night: boolean) {
  const land = w.lands[b.birth.land];
  const stats = w.landStats[b.birth.land];

  // Without electricity, night is for sleeping: no work, and hunger grows at half speed.
  const sleeping = night && !b.birth.electricity;
  if (sleeping) {
    if (b.state !== "faint") b.state = "asleep";
    b.life.ticksAsleep++;
    if (w.tick % 2 === 0) b.hunger++;
  } else {
    if (b.state === "asleep") b.state = "roaming";
    b.hunger++;
  }

  // Rule 1: hungry and able to pay → eat. The money goes back into the ground.
  if (b.hunger >= b.strategy.eatAt && b.wallet >= land.foodPrice) {
    b.wallet -= land.foodPrice;
    eat(w, b, land.foodPrice);
  }

  if (b.hunger >= LAWS.STARVING) {
    if (b.state !== "faint") {
      b.state = "faint";
      b.life.faints++;
      log(w, "faint", `Bot #${b.id} (${b.birth.countryName}) is starving and slows down.`, b.id);
    }
    b.life.ticksStarving++;
    stats.starvingTicks++;
    if (b.wallet < land.foodPrice) {
      // Welfare: the land's treasury feeds a starving bot, if the money can reach it.
      if (b.birth.account && land.treasury >= land.foodPrice) {
        land.treasury -= land.foodPrice;
        stats.welfarePaid += land.foodPrice;
        b.life.welfareMeals++;
        eat(w, b, land.foodPrice);
      } else {
        b.needTicks++;
      }
    }
  }

  // The two switches. They flip once; the mind waits for real compute.
  if (!b.wake) {
    if (b.needTicks >= LAWS.NEED_WAKE_TICKS) flip(w, b, "need");
    else if (b.wallet >= LAWS.PLENTY_WAKE) flip(w, b, "plenty");
  }

  if (sleeping) return;

  // Rule 2: standing on gold no one has dug this tick → dig. The land takes its tax.
  const here = idx(w, b.x, b.y);
  if (w.gold[here] > 0 && !dug[here]) {
    dug[here] = 1;
    const got = Math.min(swingFor(w.tick, b.birth.schoolYears, b.birth.tools), w.gold[here]);
    w.gold[here] -= got;
    const tax = Math.floor(got * land.taxRate);
    land.treasury += tax;
    b.wallet += got - tax;
    b.life.mined += got;
    b.life.taxPaid += tax;
    b.life.ticksDigging++;
    if (b.life.firstGoldTick === null) b.life.firstGoldTick = w.tick;
    if (b.wallet > b.life.peakWallet) b.life.peakWallet = b.wallet;
    w.totals.mined += got;
    stats.mined += got;
    stats.taxed += tax;
    if (b.state !== "faint") b.state = "mining";
    return;
  }
  b.life.ticksSearching++;
  if (b.state === "mining") b.state = "roaming";

  // A starving bot only manages a step every other tick.
  if (b.state === "faint" && w.tick % 2 === 1) return;

  // Rule 3: sees gold → walk toward it. Rule 4: otherwise wander. Instinct keeps it inside its own land.
  const target = findGold(w, b, occupied, dug);
  let dx: number;
  let dy: number;
  if (target) {
    const ddx = target.x - b.x;
    const ddy = target.y - b.y;
    if (Math.abs(ddx) >= Math.abs(ddy)) [dx, dy] = [Math.sign(ddx), 0];
    else [dx, dy] = [0, Math.sign(ddy)];
  } else {
    if (nextFloat(w) >= b.strategy.straightness) b.dir = nextInt(w, 0, 3);
    const ax = b.x + DIRS[b.dir][0];
    const ay = b.y + DIRS[b.dir][1];
    if (!inBounds(w, ax, ay) || w.landOfCol[ax] !== b.birth.land) b.dir = (b.dir + 2) % 4;
    [dx, dy] = DIRS[b.dir];
  }

  const nx = b.x + dx;
  const ny = b.y + dy;
  if (!inBounds(w, nx, ny) || w.landOfCol[nx] !== b.birth.land) return;
  occupied[here]--;
  b.x = nx;
  b.y = ny;
  occupied[idx(w, b.x, b.y)]++;
}

function eat(w: World, b: Bot, price: number) {
  returnToGround(w, price, b.birth.land);
  w.totals.spentOnFood += price;
  b.life.meals++;
  b.hunger = 0;
  b.needTicks = 0;
  if (b.state === "faint") {
    b.state = "roaming";
    log(w, "recover", `Bot #${b.id} ate and got back on its feet.`, b.id);
  }
}

function flip(w: World, b: Bot, reason: WakeReason) {
  b.wake = reason;
  b.wakeTick = w.tick;
  const stats = w.landStats[b.birth.land];
  if (reason === "need") stats.needFlips++;
  else stats.plentyFlips++;
  const why = reason === "need" ? `is starving with nothing left` : `has saved ${b.wallet.toLocaleString("en-US")} metashi`;
  log(
    w,
    "wake-ready",
    `Bot #${b.id} (${b.birth.countryName}) ${why}. Its ${reason} switch has flipped; it will wake when compute arrives.`,
    b.id,
  );
}

function findGold(w: World, b: Bot, occupied: Uint8Array, dug: Uint8Array): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;
  for (let dy = -b.sight; dy <= b.sight; dy++) {
    for (let dx = -b.sight; dx <= b.sight; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist === 0 || dist > b.sight) continue;
      const x = b.x + dx;
      const y = b.y + dy;
      if (!inBounds(w, x, y) || w.landOfCol[x] !== b.birth.land) continue;
      const i = idx(w, x, y);
      if (w.gold[i] <= 0 || dug[i]) continue;
      if (b.strategy.avoidCrowds && occupied[i] > 0) continue;
      // Schooled bots weigh how much gold is there; the rest just take the nearest.
      const score = b.strategy.prefersRich ? Math.log10(w.gold[i]) - dist * 0.15 : -dist;
      if (score > bestScore) {
        best = { x, y };
        bestScore = score;
      }
    }
  }
  return best;
}

/** Money paid for food goes back into the ground of the same land (or anywhere, if no land is given). */
function returnToGround(w: World, amount: number, landIdx?: number) {
  if (landIdx == null) {
    w.gold[nextInt(w, 0, w.gold.length - 1)] += amount;
    return;
  }
  const land = w.lands[landIdx];
  w.gold[idx(w, nextInt(w, land.x0, land.x1 - 1), nextInt(w, 0, w.height - 1))] += amount;
}

function log(w: World, kind: EventKind, text: string, botId?: number) {
  w.events.push({ tick: w.tick, kind, botId, text });
  if (w.events.length > LAWS.EVENT_MEMORY) w.events.shift();
}

const idx = (w: World, x: number, y: number) => y * w.width + x;
const inBounds = (w: World, x: number, y: number) => x >= 0 && y >= 0 && x < w.width && y < w.height;

/** Split `total` slots by weight, each at least `min`, summing exactly to total (largest remainder). */
export function splitColumns(weights: number[], total: number, min: number): number[] {
  const free = total - min * weights.length;
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((wt) => (free * wt) / sum);
  const out = raw.map((r) => min + Math.floor(r));
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left-- <= 0) break;
    out[i]++;
  }
  return out;
}

/** Split an integer amount by weight; the pieces always add up to exactly `total`. */
function splitInteger(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((wt) => Math.floor((total * wt) / sum));
  out[out.length - 1] += total - out.reduce((a, b) => a + b, 0);
  return out;
}

// ---- Readouts for the page, the tests and the impact report ----

export function ledger(w: World) {
  const ground = w.gold.reduce((a, b) => a + b, 0);
  const pockets = w.bots.reduce((a, b) => a + b.wallet, 0);
  const treasuries = w.lands.reduce((a, l) => a + l.treasury, 0);
  return { ground, pockets, treasuries, total: ground + pockets + treasuries };
}

export function census(w: World) {
  const wallets = w.bots.map((b) => b.wallet).sort((a, b) => b - a);
  const pockets = wallets.reduce((a, b) => a + b, 0);
  const top10 = wallets.slice(0, 10).reduce((a, b) => a + b, 0);
  return {
    faint: w.bots.filter((b) => b.state === "faint").length,
    mining: w.bots.filter((b) => b.state === "mining").length,
    asleep: w.bots.filter((b) => b.state === "asleep").length,
    readyByNeed: w.bots.filter((b) => b.wake === "need").length,
    readyByPlenty: w.bots.filter((b) => b.wake === "plenty").length,
    /** Share of all pocket money held by the richest ten bots, 0..1. */
    top10Share: pockets > 0 ? top10 / pockets : 0,
    richest: wallets[0] ?? 0,
    broke: w.bots.filter((b) => b.wallet < w.lands[b.birth.land].foodPrice).length,
  };
}
