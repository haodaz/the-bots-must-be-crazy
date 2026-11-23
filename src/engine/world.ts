// The world before any mind wakes up: bots living on instinct, a rule table each.
// Pure and deterministic: the same seed replays the same history, and nothing here calls a model.

import { LAWS, yieldAt } from "./laws.ts";
import { nextFloat, nextInt } from "./rng.ts";

/** A bot's instincts. Today they are random; one day a mind may rewrite its own. */
export type Strategy = {
  /** Hunger level at which it buys food (if it can pay). */
  eatAt: number;
  /** Chance, 0..1, of walking on in the same direction when it sees no gold. */
  straightness: number;
  /** Skips gold that another bot is already standing on. */
  avoidCrowds: boolean;
};

export type WakeReason = "need" | "plenty";

export type Bot = {
  id: number;
  x: number;
  y: number;
  dir: number;
  /** How far it can see gold, in tiles. Part of its body, not its strategy. */
  sight: number;
  wallet: number;
  hunger: number;
  strategy: Strategy;
  state: "roaming" | "mining" | "faint";
  /** Ticks starving with no money for food. */
  needTicks: number;
  /** Which switch has flipped. The mind waits for real compute before it wakes. */
  wake: WakeReason | null;
  wakeTick: number | null;
};

export type EventKind = "genesis" | "halving" | "faint" | "recover" | "wake-ready";
export type WorldEvent = { tick: number; kind: EventKind; botId?: number; text: string };

export type World = {
  seed: number;
  rng: number;
  tick: number;
  width: number;
  height: number;
  /** Metashi lying in each tile, row by row. */
  gold: number[];
  bots: Bot[];
  events: WorldEvent[];
  totals: { mined: number; spentOnFood: number };
};

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export function createWorld(seed: number): World {
  const width = LAWS.WIDTH;
  const height = LAWS.HEIGHT;
  const w: World = {
    seed,
    rng: seed | 0,
    tick: 0,
    width,
    height,
    gold: new Array(width * height).fill(0),
    bots: [],
    events: [],
    totals: { mined: 0, spentOnFood: 0 },
  };

  // Genesis: the fallen money turns to gold and lands in patches across the world.
  // Sizes are uneven on purpose: a few mother lodes, many small patches.
  const weights = Array.from({ length: LAWS.PATCHES }, () => Math.pow(1 - nextFloat(w), -1.2));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  let left = LAWS.SUPPLY;
  weights.forEach((weight, i) => {
    const amount = i === weights.length - 1 ? left : Math.floor((LAWS.SUPPLY * weight) / weightSum);
    left -= amount;
    landPatch(w, nextInt(w, 0, width - 1), nextInt(w, 0, height - 1), amount);
  });

  for (let id = 0; id < LAWS.POPULATION; id++) {
    w.bots.push({
      id,
      x: nextInt(w, 0, width - 1),
      y: nextInt(w, 0, height - 1),
      dir: nextInt(w, 0, 3),
      sight: nextInt(w, 2, 6),
      wallet: 0,
      hunger: nextInt(w, 0, 60),
      strategy: {
        eatAt: nextInt(w, 40, 100),
        straightness: 0.5 + 0.45 * nextFloat(w),
        avoidCrowds: nextFloat(w) < 0.3,
      },
      state: "roaming",
      needTicks: 0,
      wake: null,
      wakeTick: null,
    });
  }

  log(w, "genesis", `${LAWS.SUPPLY.toLocaleString("en-US")} metashi fell from the sky. ${LAWS.POPULATION} bots, no minds.`);
  return w;
}

/** Half of a patch lands on its centre, the rest is shared by the neighbours. */
function landPatch(w: World, cx: number, cy: number, amount: number) {
  const around = DIRS.map(([dx, dy]) => [cx + dx, cy + dy] as const).filter(([x, y]) => inBounds(w, x, y));
  const share = Math.floor(amount / 2 / around.length);
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

  // Take turns from a different bot each tick, so no one always goes first.
  const n = w.bots.length;
  for (let k = 0; k < n; k++) act(w, w.bots[(t + k) % n], occupied, dug);

  w.tick++;
}

function act(w: World, b: Bot, occupied: Uint8Array, dug: Uint8Array) {
  b.hunger++;

  // Rule 1: hungry and able to pay → eat. The money goes back into the ground.
  if (b.hunger >= b.strategy.eatAt && b.wallet >= LAWS.FOOD_PRICE) {
    b.wallet -= LAWS.FOOD_PRICE;
    returnToGround(w, LAWS.FOOD_PRICE);
    w.totals.spentOnFood += LAWS.FOOD_PRICE;
    b.hunger = 0;
    b.needTicks = 0;
    if (b.state === "faint") {
      b.state = "roaming";
      log(w, "recover", `Bot #${b.id} ate and got back on its feet.`, b.id);
    }
  }

  if (b.hunger >= LAWS.STARVING) {
    if (b.state !== "faint") {
      b.state = "faint";
      log(w, "faint", `Bot #${b.id} is starving and slows down.`, b.id);
    }
    if (b.wallet < LAWS.FOOD_PRICE) b.needTicks++;
  }

  // The two switches. They flip once; the mind waits for real compute.
  if (!b.wake) {
    if (b.needTicks >= LAWS.NEED_WAKE_TICKS) flip(w, b, "need");
    else if (b.wallet >= LAWS.PLENTY_WAKE) flip(w, b, "plenty");
  }

  // Rule 2: standing on gold no one has dug this tick → dig.
  const here = idx(w, b.x, b.y);
  if (w.gold[here] > 0 && !dug[here]) {
    dug[here] = 1;
    const got = Math.min(yieldAt(w.tick), w.gold[here]);
    w.gold[here] -= got;
    b.wallet += got;
    w.totals.mined += got;
    if (b.state !== "faint") b.state = "mining";
    return;
  }
  if (b.state === "mining") b.state = "roaming";

  // A starving bot only manages a step every other tick.
  if (b.state === "faint" && w.tick % 2 === 1) return;

  // Rule 3: sees gold → walk toward the nearest. Rule 4: otherwise wander.
  const target = nearestGold(w, b, occupied, dug);
  let dx: number;
  let dy: number;
  if (target) {
    const ddx = target.x - b.x;
    const ddy = target.y - b.y;
    if (Math.abs(ddx) >= Math.abs(ddy)) [dx, dy] = [Math.sign(ddx), 0];
    else [dx, dy] = [0, Math.sign(ddy)];
  } else {
    if (nextFloat(w) >= b.strategy.straightness) b.dir = nextInt(w, 0, 3);
    if (!inBounds(w, b.x + DIRS[b.dir][0], b.y + DIRS[b.dir][1])) b.dir = (b.dir + 2) % 4;
    [dx, dy] = DIRS[b.dir];
  }

  occupied[here]--;
  b.x = clamp(b.x + dx, 0, w.width - 1);
  b.y = clamp(b.y + dy, 0, w.height - 1);
  occupied[idx(w, b.x, b.y)]++;
}

function flip(w: World, b: Bot, reason: WakeReason) {
  b.wake = reason;
  b.wakeTick = w.tick;
  const why =
    reason === "need"
      ? `is starving with nothing left`
      : `has saved ${b.wallet.toLocaleString("en-US")} metashi`;
  log(w, "wake-ready", `Bot #${b.id} ${why}. Its ${reason} switch has flipped; it will wake when compute arrives.`, b.id);
}

function nearestGold(w: World, b: Bot, occupied: Uint8Array, dug: Uint8Array): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDist = Infinity;
  for (let dy = -b.sight; dy <= b.sight; dy++) {
    for (let dx = -b.sight; dx <= b.sight; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist === 0 || dist > b.sight || dist >= bestDist) continue;
      const x = b.x + dx;
      const y = b.y + dy;
      if (!inBounds(w, x, y)) continue;
      const i = idx(w, x, y);
      if (w.gold[i] <= 0 || dug[i]) continue;
      if (b.strategy.avoidCrowds && occupied[i] > 0) continue;
      best = { x, y };
      bestDist = dist;
    }
  }
  return best;
}

function returnToGround(w: World, amount: number) {
  w.gold[nextInt(w, 0, w.gold.length - 1)] += amount;
}

function log(w: World, kind: EventKind, text: string, botId?: number) {
  w.events.push({ tick: w.tick, kind, botId, text });
  if (w.events.length > LAWS.EVENT_MEMORY) w.events.shift();
}

const idx = (w: World, x: number, y: number) => y * w.width + x;
const inBounds = (w: World, x: number, y: number) => x >= 0 && y >= 0 && x < w.width && y < w.height;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---- Readouts for the page and the tests ----

export function ledger(w: World) {
  const ground = w.gold.reduce((a, b) => a + b, 0);
  const pockets = w.bots.reduce((a, b) => a + b.wallet, 0);
  return { ground, pockets, total: ground + pockets };
}

export function census(w: World) {
  const wallets = w.bots.map((b) => b.wallet).sort((a, b) => b - a);
  const pockets = wallets.reduce((a, b) => a + b, 0);
  const top10 = wallets.slice(0, 10).reduce((a, b) => a + b, 0);
  return {
    faint: w.bots.filter((b) => b.state === "faint").length,
    mining: w.bots.filter((b) => b.state === "mining").length,
    readyByNeed: w.bots.filter((b) => b.wake === "need").length,
    readyByPlenty: w.bots.filter((b) => b.wake === "plenty").length,
    /** Share of all pocket money held by the richest ten bots, 0..1. */
    top10Share: pockets > 0 ? top10 / pockets : 0,
    richest: wallets[0] ?? 0,
    broke: wallets.filter((v) => v < LAWS.FOOD_PRICE).length,
  };
}
