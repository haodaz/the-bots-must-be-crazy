// The laws of the world. Everything here is plain code: running the world costs nothing.
// Only a mind that wakes up spends real compute, and that comes later.

export const LAWS = {
  /** There will only ever be this many metashi. The same cap as Bitcoin. */
  SUPPLY: 21_000_000,

  WIDTH: 48,
  HEIGHT: 30,
  POPULATION: 100,

  /** At genesis the fallen gold lands in this many patches. */
  PATCHES: 30,

  /** Metashi a creature digs out per swing, before any halving. */
  BASE_YIELD: 64,
  /** Every this many ticks the yield per swing halves. */
  HALVING_TICKS: 3000,
  /** After this many halvings the yield stops shrinking, so the world never runs dry. */
  MAX_HALVINGS: 2,

  /** One day in the world. Real compute will arrive once per day, like sunlight. */
  DAY_TICKS: 600,

  /** Food costs metashi (at world-average prices). What is paid goes back into the ground, to be mined again. */
  FOOD_PRICE: 1_000,
  /** Hunger at which a creature is starving and too weak to walk every tick. */
  STARVING: 150,

  /** The need switch: starving with no money for food for this many ticks. */
  NEED_WAKE_TICKS: 60,
  /** The plenty switch: savings at or above this. */
  PLENTY_WAKE: 500_000,

  /** At genesis this share of the fallen money lands in pockets as family money; the rest in the ground. */
  INHERITANCE_SHARE: 0.2,
  /** Each land's strip is at least this many columns wide. */
  MIN_LAND_COLS: 4,
  /** Night starts at this point of the day. Bots without electricity sleep through it. */
  NIGHT_FROM: 0.7,
  /**
   * Returns to schooling: each year of school above the reference raises what a swing yields by this share.
   * About 9% a year is the global average return to a year of schooling
   * (Psacharopoulos & Patrinos, "Returns to Investment in Education: A Decennial Review of the Global Literature", World Bank, 2018).
   */
  RETURN_PER_SCHOOL_YEAR: 0.09,
  /** Years of school at which a swing yields exactly the base amount. */
  REFERENCE_SCHOOL_YEARS: 10,
  /** Bots with tools (they grew up online) dig this many times faster. */
  TOOLS_MULTIPLIER: 2,
  /** A land's food price follows its real cost of living, kept within this range of the world average. */
  PRICE_RANGE: [0.4, 1.6] as const,

  /** How many recent events the world remembers for the page. */
  EVENT_MEMORY: 40,
} as const;

/** Metashi per swing at a given tick: halves every HALVING_TICKS, then holds. */
export function yieldAt(tick: number): number {
  const halvings = Math.min(Math.floor(tick / LAWS.HALVING_TICKS), LAWS.MAX_HALVINGS);
  return LAWS.BASE_YIELD >> halvings;
}

export const isNight = (tick: number) => tick % LAWS.DAY_TICKS >= LAWS.DAY_TICKS * LAWS.NIGHT_FROM;

/** What one swing digs for a bot with this much school and these tools, at this tick. */
export function swingFor(tick: number, schoolYears: number, tools: boolean): number {
  const school = Math.pow(1 + LAWS.RETURN_PER_SCHOOL_YEAR, schoolYears - LAWS.REFERENCE_SCHOOL_YEARS);
  return Math.max(1, Math.round(yieldAt(tick) * school * (tools ? LAWS.TOOLS_MULTIPLIER : 1)));
}
