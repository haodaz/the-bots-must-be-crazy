// A world before any mind wakes up. Bots are born by the real birth lottery into real countries,
// on the real Earth or on a new planet. metashi is money, not ore: it rains into the world's economies
// (halving every era, like Bitcoin's block rewards), bots earn it by working where the economy is,
// and what they spend on food goes back into their country's economy, to become someone else's wage.
// Pure and deterministic: the same seed (and the same levers) replays the same history. Nothing here calls a model.

import { EARTH, invNorm, sigmaFromTop10, type Country, type Earth } from "./earth.ts";
import { ERA_TICKS, LAWS, isNight, rainOf, wageFor } from "./laws.ts";
import { earthGeography, generatePlanet, type Geography } from "./planet.ts";
import { nextFloat, nextInt } from "./rng.ts";

/** A bot's instincts. Today they come from its birth; one day a mind may rewrite its own. */
export type Strategy = {
  /** Hunger level at which it buys food (if it can pay). */
  eatAt: number;
  /** Chance, 0..1, of walking on in the same direction when it sees no work. */
  straightness: number;
  /** Skips work that another bot is already doing. */
  avoidCrowds: boolean;
};

export type WakeReason = "need" | "plenty";

/** What a bot drew at birth. Every field comes from real-world numbers for its country. */
export type Birth = {
  /** ISO code of the real country behind its nation. */
  country: string;
  /** The nation's name in this world. */
  countryName: string;
  /** The real country whose numbers it was born with: revealed only at the end of its life. */
  realCountry: string;
  /** Index into EARTH.countries and world.countries. */
  countryIdx: number;
  /** Region (one of the seven), index into world.lands. */
  land: number;
  /** Where its family sits on its country's income ladder, 0 (poorest) to 1 (richest). */
  familyRank: number;
  /** Family money it started with, in metashi. */
  inheritance: number;
  schoolYears: number;
  /** Grew up online, so it has tools: earns more per hour. */
  tools: boolean;
  /** Has electricity: can keep working at night. */
  electricity: boolean;
  /** Has a bank or mobile-money account: welfare can reach it. */
  account: boolean;
};

/** What happened over its life. The raw material for its life file. */
export type Life = {
  earned: number;
  /** Spent on things other than food: it went back into the local economy. */
  spent: number;
  taxPaid: number;
  meals: number;
  welfareMeals: number;
  peakWallet: number;
  faints: number;
  ticksWorking: number;
  ticksSearching: number;
  ticksAsleep: number;
  ticksStarving: number;
  firstWageTick: number | null;
};

export type Bot = {
  id: number;
  x: number;
  y: number;
  dir: number;
  /** How far it can see work, in tiles. Grows with schooling. */
  sight: number;
  wallet: number;
  hunger: number;
  birth: Birth;
  life: Life;
  strategy: Strategy;
  state: "roaming" | "working" | "faint" | "asleep";
  /** Ticks starving with no money for food (resets when it eats). */
  needTicks: number;
  wake: WakeReason | null;
  wakeTick: number | null;
};

export type WorldCountry = {
  /** Its name in this world. */
  name: string;
  /** The real country it stands for: revealed only at the end. */
  realName: string;
  iso3: string;
  land: number;
  foodPrice: number;
  taxRate: number;
  /** Tax collected and not yet paid out as welfare. Part of the 21M. */
  treasury: number;
  tiles: number[];
  /** Where its economy concentrates: the capital first, then a few towns. */
  cities: number[];
  cityWeights: number[];
  /** For each city, the country's tiles around it, nearest first (the city's reach). */
  reach: number[][];
  /** Policies a king has enacted here (school, electricity, accounts, tools). */
  policies: Levers;
  /** Food price and productivity before any policy, so a policy can move the price. */
  baseFoodPrice: number;
  baseProductivity: number;
};

/** One of the seven lands: a made-up name in the world, a real region behind it. */
export type Region = { name: string; short: string; realName: string; realShort: string };

/** Counters per region, for the impact report. */
export type LandStats = {
  earned: number;
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
  /** Money rains where the babies are born, not where today's wealth is. */
  goldFollowsBirths: boolean;
}>;

export type EventKind = "genesis" | "rain" | "faint" | "recover" | "wake-ready" | "card";

/**
 * A change in the world's rules for a while, put there by a played card: food prices, work stopping, wages.
 * It covers an area (a circle of tiles), a nation, one bot, or the whole world.
 */
export type Mod = {
  kind: "food" | "noWork" | "wage";
  mult: number;
  until: number;
  area?: { x: number; y: number; r: number };
  ci?: number;
  botId?: number;
  label: string;
};
export type WorldEvent = { tick: number; kind: EventKind; botId?: number; text: string };

export type WorldOptions = { planet?: "earth" | "new"; levers?: Levers };

export type World = {
  seed: number;
  levers: Levers;
  geo: Geography;
  rng: number;
  tick: number;
  width: number;
  height: number;
  /** metashi circulating in the economy at each tile, row by row. */
  money: number[];
  countries: WorldCountry[];
  lands: Region[];
  bots: Bot[];
  events: WorldEvent[];
  /** metashi not yet rained down. */
  sky: number;
  /** Rains so far (genesis is rain 0). */
  rains: number;
  totals: { earned: number; spentOnFood: number; spentOnGoods: number };
  landStats: LandStats[];
  /** Rule changes from played cards, until they expire. */
  mods: Mod[];
};

/**
 * How much a country's people produce in a day, relative to the reference: returns to its real years of school,
 * its real share of people online (tools), and the night hours its real access to electricity allows.
 * Levers that raise school, tools or electricity raise it too.
 */
export function productivity(c: Country, levers: Levers): number {
  const school = Math.max(c.schoolYears, levers.schoolYearsAtLeast ?? 0);
  const online = levers.toolsForAll ? 1 : c.internetPct / 100;
  // Electricity adds the night's working hours.
  const lit = levers.electricityForAll ? 1 : c.electricityPct / 100;
  const hours = LAWS.NIGHT_FROM + lit * (1 - LAWS.NIGHT_FROM);
  return Math.pow(1 + LAWS.RETURN_PER_SCHOOL_YEAR, school - LAWS.REFERENCE_SCHOOL_YEARS) * (1 + online * (LAWS.TOOLS_MULTIPLIER - 1)) * hours;
}

/** The tiles of a country reachable on foot from a start tile. */
function connected(geo: Geography, start: number, ci: number): number[] {
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const t = stack.pop()!;
    const x = t % geo.width;
    const y = Math.floor(t / geo.width);
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      const n = ny * geo.width + nx;
      if (nx < 0 || ny < 0 || nx >= geo.width || ny >= geo.height || seen.has(n) || geo.cells[n] !== ci) continue;
      seen.add(n);
      stack.push(n);
    }
  }
  return [...seen];
}

/** How far a city's economy can spread, in tiles. */
const MAX_REACH = 5;

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export function createWorld(seed: number, levers: Levers = {}, opts: { planet?: "earth" | "new" } = {}, earth: Earth = EARTH): World {
  const geo = opts.planet === "new" ? generatePlanet(seed, earth) : earthGeography(earth);
  const w: World = {
    seed,
    levers,
    geo,
    rng: seed | 0,
    tick: 0,
    width: geo.width,
    height: geo.height,
    money: new Array(geo.width * geo.height).fill(0),
    countries: [],
    lands: earth.lands.map((l, i) => ({ name: geo.landNames[i], short: geo.landNames[i], realName: l.name, realShort: l.short })),
    bots: [],
    events: [],
    sky: LAWS.SUPPLY,
    rains: 0,
    totals: { earned: 0, spentOnFood: 0, spentOnGoods: 0 },
    mods: [],
    landStats: earth.lands.map(() => ({ earned: 0, taxed: 0, welfarePaid: 0, starvingTicks: 0, needFlips: 0, plentyFlips: 0 })),
  };

  // Countries: their tiles on this map, their cities, their prices and taxes.
  const tilesOf: number[][] = earth.countries.map(() => []);
  geo.cells.forEach((c, i) => {
    if (c >= 0) tilesOf[c].push(i);
  });
  const worldPrice = earth.countries.reduce((a, c) => a + c.priceLevel * c.births, 0) / earth.totalBirths;
  // Productivity makes things cheaper: with a fixed supply of money, more output shows up as lower prices.
  const worldProductivity = earth.countries.reduce((a, c) => a + productivity(c, {}) * c.births, 0) / earth.totalBirths;
  earth.countries.forEach((c, i) => {
    if (!tilesOf[i].length) throw new Error(`${c.name} has no land on ${geo.name}`);
    const capital = geo.capitals[i] >= 0 && geo.cells[geo.capitals[i]] === i ? geo.capitals[i] : tilesOf[i][0];
    // People live, work and are born on the land connected to the capital; far islands stay empty.
    const tiles = connected(geo, capital, i);
    const towns = Math.min(tiles.length - 1, Math.floor(Math.sqrt(tiles.length) / 1.5));
    const cities = [capital];
    for (let k = 0; k < towns * 3 && cities.length < towns + 1; k++) {
      const t = tiles[nextInt(w, 0, tiles.length - 1)];
      if (!cities.includes(t)) cities.push(t);
    }
    const rel = Math.min(LAWS.PRICE_RANGE[1], Math.max(LAWS.PRICE_RANGE[0], c.priceLevel / worldPrice));
    const reach = cities.map((city) =>
      tiles
        .map((t) => [t, Math.abs((t % w.width) - (city % w.width)) + Math.abs(Math.floor(t / w.width) - Math.floor(city / w.width))] as const)
        .filter(([, d]) => d <= MAX_REACH)
        .sort((a, b) => a[1] - b[1])
        .map(([t]) => t),
    );
    w.countries.push({
      name: geo.nationNames[i],
      realName: c.name,
      iso3: c.iso3,
      land: earth.lands.findIndex((l) => l.name === c.region),
      foodPrice: Math.max(1, Math.round((LAWS.FOOD_PRICE * rel * worldProductivity) / productivity(c, levers))),
      baseFoodPrice: (LAWS.FOOD_PRICE * rel * worldProductivity) / productivity(c, levers),
      baseProductivity: productivity(c, levers),
      policies: { ...levers },
      taxRate: c.taxPctGdp / 100,
      treasury: 0,
      tiles,
      cities,
      cityWeights: cities.map((_, k) => (k === 0 ? Math.max(1, cities.length - 1) : 1)),
      reach,
    });
  });

  // Births: each bot is drawn the way a real baby is born this year.
  const cumulative: number[] = [];
  let acc = 0;
  for (const c of earth.countries) cumulative.push((acc += c.births));
  const familyWeights: number[] = [];

  for (let id = 0; id < LAWS.POPULATION; id++) {
    const pick = nextFloat(w) * acc;
    const ci = cumulative.findIndex((v) => v > pick);
    const country = earth.countries[ci];
    const home = w.countries[ci];

    const familyRank = Math.min(0.999, Math.max(0.001, nextFloat(w)));
    const sigma = sigmaFromTop10(country.top10Share);
    familyWeights.push(country.gdpPerCapitaPpp * Math.exp(sigma * invNorm(familyRank) - (sigma * sigma) / 2));

    // Schooling follows the country's expected years, a little more for richer families, plus luck.
    let schoolYears = Math.round(country.schoolYears + (familyRank - 0.5) * 6 + (nextFloat(w) - 0.5) * 4);
    schoolYears = Math.min(18, Math.max(0, schoolYears));
    let tools = nextFloat(w) * 100 < country.internetPct;
    let electricity = nextFloat(w) * 100 < country.electricityPct;
    let account = nextFloat(w) * 100 < country.accountPct;

    // Born in the capital a little more often than anywhere else.
    const tile = nextFloat(w) < 0.4 ? home.cities[0] : home.tiles[nextInt(w, 0, home.tiles.length - 1)];
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
      x: tile % w.width,
      y: Math.floor(tile / w.width),
      dir,
      sight: Math.min(6, 2 + Math.floor(schoolYears / 4)),
      wallet: 0,
      hunger,
      birth: {
        country: country.iso3,
        countryName: home.name,
        realCountry: country.name,
        countryIdx: ci,
        land: home.land,
        familyRank,
        inheritance: 0,
        schoolYears,
        tools,
        electricity,
        account,
      },
      life: {
        earned: 0,
        spent: 0,
        taxPaid: 0,
        meals: 0,
        welfareMeals: 0,
        peakWallet: 0,
        faints: 0,
        ticksWorking: 0,
        ticksSearching: 0,
        ticksAsleep: 0,
        ticksStarving: 0,
        firstWageTick: null,
      },
      strategy: { eatAt, straightness, avoidCrowds },
      state: "roaming",
      needTicks: 0,
      wake: null,
      wakeTick: null,
    });
  }

  // Genesis: the first rain. Part falls straight into pockets as family money, along real income ladders;
  // the rest lands in the economies, the way the world's wealth lands today.
  const first = rainOf(0);
  w.sky -= first;
  w.rains = 1;
  const pool = levers.noInheritance ? 0 : Math.floor(first * LAWS.INHERITANCE_SHARE);
  if (pool > 0) {
    const shares = splitInteger(pool, familyWeights);
    w.bots.forEach((b, i) => {
      b.wallet = shares[i];
      b.birth.inheritance = shares[i];
      b.life.peakWallet = shares[i];
    });
  }
  rainInto(w, first - pool, earth);

  log(w, "genesis", `${first.toLocaleString("en-US")} metashi fell from the sky. ${LAWS.POPULATION} bots were born the way real babies are born this year.`);
  return w;
}

/** New money lands in the economies: by real GDP, or where the babies are if that lever is pulled. */
function rainInto(w: World, amount: number, earth: Earth = EARTH) {
  const weights = earth.countries.map((c) => (w.levers.goldFollowsBirths ? c.births : c.gdpPpp));
  splitInteger(amount, weights).forEach((share, ci) => {
    const c = w.countries[ci];
    splitInteger(share, c.cityWeights).forEach((v, k) => {
      // A bigger economy spreads wider around its city: more places to find work.
      const radius = Math.max(0, Math.min(MAX_REACH, Math.round(Math.log10(Math.max(1, v)) - 2.5)));
      const area = c.reach[k].slice(0, (2 * radius + 1) ** 2).filter((t) => manhattan(w, t, c.cities[k]) <= radius);
      const centre = Math.floor(v * 0.3);
      const rest = splitInteger(v - centre, area.map(() => 1));
      area.forEach((t, j) => (w.money[t] += rest[j]));
      w.money[c.cities[k]] += centre;
    });
  });
}

const manhattan = (w: World, a: number, b: number) =>
  Math.abs((a % w.width) - (b % w.width)) + Math.abs(Math.floor(a / w.width) - Math.floor(b / w.width));

export function step(w: World): void {
  const t = w.tick;
  if (t % LAWS.DAY_TICKS === 0 && w.mods.length) w.mods = w.mods.filter((m) => m.until > t);
  if (t > 0 && t % ERA_TICKS === 0) {
    const amount = Math.min(w.sky, rainOf(w.rains));
    if (amount > 0) {
      w.sky -= amount;
      rainInto(w, amount);
      log(w, "rain", `Halving rain: ${amount.toLocaleString("en-US")} metashi fell, half the last. ${w.sky.toLocaleString("en-US")} left in the sky.`);
    }
    w.rains++;
  }

  const occupied = new Uint8Array(w.width * w.height);
  for (const b of w.bots) occupied[b.y * w.width + b.x]++;
  // One job per place per tick: whoever gets there first is paid, the rest must look elsewhere.
  const taken = new Uint8Array(w.width * w.height);
  const night = isNight(t);

  // Take turns from a different bot each tick, so no one always goes first.
  const n = w.bots.length;
  for (let k = 0; k < n; k++) act(w, w.bots[(t + k) % n], occupied, taken, night);

  w.tick++;
}

/** Does a rule change reach this bot where it stands? */
function covers(m: Mod, b: Bot) {
  if (m.botId != null) return m.botId === b.id;
  if (m.ci != null) return m.ci === b.birth.countryIdx;
  if (m.area) return (b.x - m.area.x) ** 2 + (b.y - m.area.y) ** 2 <= m.area.r ** 2;
  return true;
}

/** What a meal costs this bot right now: its nation's price, changed by any harvest, drought or trade around it. */
export function foodPriceAt(w: World, b: Bot): number {
  let price = w.countries[b.birth.countryIdx].foodPrice;
  for (const m of w.mods) if (m.kind === "food" && m.until > w.tick && covers(m, b)) price *= m.mult;
  return Math.max(1, Math.round(price));
}

function canWork(w: World, b: Bot) {
  return !w.mods.some((m) => m.kind === "noWork" && m.until > w.tick && covers(m, b));
}

function wageMult(w: World, b: Bot) {
  let k = 1;
  for (const m of w.mods) if (m.kind === "wage" && m.until > w.tick && covers(m, b)) k *= m.mult;
  return k;
}

function act(w: World, b: Bot, occupied: Uint8Array, taken: Uint8Array, night: boolean) {
  const home = w.countries[b.birth.countryIdx];
  const price = w.mods.length ? foodPriceAt(w, b) : home.foodPrice;
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

  // Rule 1: hungry and able to pay → eat. The money goes back into the local economy.
  if (b.hunger >= b.strategy.eatAt && b.wallet >= price) {
    b.wallet -= price;
    eat(w, b, price);
    // And it spends a little of what it holds above its cushion: someone else's wage.
    const spare = b.wallet - price * LAWS.CUSHION_MEALS;
    const spend = spare > 0 ? Math.floor(spare * LAWS.SPEND_SHARE) : 0;
    if (spend > 0) {
      b.wallet -= spend;
      b.life.spent += spend;
      w.totals.spentOnGoods += spend;
      returnToEconomy(w, b.birth.countryIdx, spend);
    }
  }

  if (b.hunger >= LAWS.STARVING) {
    if (b.state !== "faint") {
      b.state = "faint";
      b.life.faints++;
      log(w, "faint", `Bot #${b.id} (${b.birth.countryName}) is starving and slows down.`, b.id);
    }
    b.life.ticksStarving++;
    stats.starvingTicks++;
    if (b.wallet < price) {
      // Welfare: the country's treasury feeds a starving bot, if the money can reach it.
      if (b.birth.account && home.treasury >= price) {
        home.treasury -= price;
        stats.welfarePaid += price;
        b.life.welfareMeals++;
        eat(w, b, price);
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

  // Rule 2: where there is money in the economy and the job is free → work. The country takes its tax.
  const here = b.y * w.width + b.x;
  if (w.money[here] > 0 && !taken[here] && (!w.mods.length || canWork(w, b))) {
    taken[here] = 1;
    const wage = wageFor(b.birth.schoolYears, b.birth.tools);
    const got = Math.min(w.mods.length ? Math.max(1, Math.round(wage * wageMult(w, b))) : wage, w.money[here]);
    w.money[here] -= got;
    const tax = Math.floor(got * home.taxRate);
    home.treasury += tax;
    b.wallet += got - tax;
    b.life.earned += got;
    b.life.taxPaid += tax;
    b.life.ticksWorking++;
    if (b.life.firstWageTick === null) b.life.firstWageTick = w.tick;
    if (b.wallet > b.life.peakWallet) b.life.peakWallet = b.wallet;
    w.totals.earned += got;
    stats.earned += got;
    stats.taxed += tax;
    if (b.state !== "faint") b.state = "working";
    return;
  }
  b.life.ticksSearching++;
  if (b.state === "working") b.state = "roaming";

  // A starving bot only manages a step every other tick.
  if (b.state === "faint" && w.tick % 2 === 1) return;

  // Rule 3: sees work → walk toward it. Instinct keeps it inside its own country.
  const target = findWork(w, b, occupied, taken);
  let dx: number;
  let dy: number;
  if (target) {
    const ddx = target.x - b.x;
    const ddy = target.y - b.y;
    if (Math.abs(ddx) >= Math.abs(ddy)) [dx, dy] = [Math.sign(ddx), 0];
    else [dx, dy] = [0, Math.sign(ddy)];
  } else if (nextFloat(w) < 0.5) {
    // Rule 4: no work in sight → head for the nearest city, where the economy is.
    const here_ = b.y * w.width + b.x;
    const city = home.cities.reduce((best, t) => (manhattan(w, t, here_) < manhattan(w, best, here_) ? t : best), home.cities[0]);
    const ddx = (city % w.width) - b.x;
    const ddy = Math.floor(city / w.width) - b.y;
    if (Math.abs(ddx) >= Math.abs(ddy)) [dx, dy] = [Math.sign(ddx), 0];
    else [dx, dy] = [0, Math.sign(ddy)];
    if ((dx === 0 && dy === 0) || !home_(w, b, b.x + dx, b.y + dy)) [dx, dy] = DIRS[nextInt(w, 0, 3)];
  } else {
    // Rule 5: otherwise wander.
    if (nextFloat(w) >= b.strategy.straightness) b.dir = nextInt(w, 0, 3);
    if (!home_(w, b, b.x + DIRS[b.dir][0], b.y + DIRS[b.dir][1])) b.dir = (b.dir + 2) % 4;
    [dx, dy] = DIRS[b.dir];
  }

  const nx = b.x + dx;
  const ny = b.y + dy;
  if (!home_(w, b, nx, ny)) return;
  occupied[here]--;
  b.x = nx;
  b.y = ny;
  occupied[ny * w.width + nx]++;
}

/** Is this tile inside the bot's own country? */
function home_(w: World, b: Bot, x: number, y: number) {
  return x >= 0 && y >= 0 && x < w.width && y < w.height && w.geo.cells[y * w.width + x] === b.birth.countryIdx;
}

function eat(w: World, b: Bot, price: number) {
  returnToEconomy(w, b.birth.countryIdx, price);
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
  log(w, "wake-ready", `Bot #${b.id} (${b.birth.countryName}) ${why}. Its ${reason} switch has flipped; it will wake when compute arrives.`, b.id);
}

function findWork(w: World, b: Bot, occupied: Uint8Array, taken: Uint8Array): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;
  for (let dy = -b.sight; dy <= b.sight; dy++) {
    for (let dx = -b.sight; dx <= b.sight; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist === 0 || dist > b.sight) continue;
      const x = b.x + dx;
      const y = b.y + dy;
      if (!home_(w, b, x, y)) continue;
      const i = y * w.width + x;
      if (w.money[i] <= 0 || taken[i]) continue;
      if (b.strategy.avoidCrowds && occupied[i] > 0) continue;
      const score = -dist;
      if (score > bestScore) {
        best = { x, y };
        bestScore = score;
      }
    }
  }
  return best;
}

/** Money spent in a country goes back into its economy, mostly where its cities are. */
export function returnToEconomy(w: World, ci: number, amount: number) {
  const c = w.countries[ci];
  const total = c.cityWeights.reduce((a, v) => a + v, 0);
  let r = nextFloat(w) * total;
  let k = 0;
  while (k < c.cities.length - 1 && (r -= c.cityWeights[k]) > 0) k++;
  // It lands somewhere within the city's reach: a shop, a stall, a job.
  const reach = c.reach[k];
  w.money[reach[nextInt(w, 0, Math.min(reach.length, 13) - 1)]] += amount;
}

export function log(w: World, kind: EventKind, text: string, botId?: number) {
  w.events.push({ tick: w.tick, kind, botId, text });
  if (w.events.length > LAWS.EVENT_MEMORY) w.events.shift();
}

/** Split an integer amount by weight; the pieces always add up to exactly `total`. */
export function splitInteger(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    const out = weights.map(() => 0);
    out[0] = total;
    return out;
  }
  const out = weights.map((wt) => Math.floor((total * wt) / sum));
  let left = total - out.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i = (i + 1) % out.length) {
    if (weights[i] > 0) {
      out[i]++;
      left--;
    }
  }
  return out;
}

// ---- Readouts for the page, the tests and the impact report ----

export function ledger(w: World) {
  const economy = w.money.reduce((a, b) => a + b, 0);
  const pockets = w.bots.reduce((a, b) => a + b.wallet, 0);
  const treasuries = w.countries.reduce((a, c) => a + c.treasury, 0);
  return { sky: w.sky, economy, pockets, treasuries, total: w.sky + economy + pockets + treasuries };
}

export function census(w: World) {
  const wallets = w.bots.map((b) => b.wallet).sort((a, b) => b - a);
  const pockets = wallets.reduce((a, b) => a + b, 0);
  const top10 = wallets.slice(0, 10).reduce((a, b) => a + b, 0);
  return {
    faint: w.bots.filter((b) => b.state === "faint").length,
    working: w.bots.filter((b) => b.state === "working").length,
    asleep: w.bots.filter((b) => b.state === "asleep").length,
    readyByNeed: w.bots.filter((b) => b.wake === "need").length,
    readyByPlenty: w.bots.filter((b) => b.wake === "plenty").length,
    /** Share of all pocket money held by the richest ten bots, 0..1. */
    top10Share: pockets > 0 ? top10 / pockets : 0,
    richest: wallets[0] ?? 0,
    broke: w.bots.filter((b) => b.wallet < w.countries[b.birth.countryIdx].foodPrice).length,
  };
}
