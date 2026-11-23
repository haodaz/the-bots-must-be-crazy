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

  /** Food costs metashi. What is paid goes back into the ground, to be mined again. */
  FOOD_PRICE: 1_000,
  /** Hunger at which a creature is starving and too weak to walk every tick. */
  STARVING: 150,

  /** The need switch: starving with no money for food for this many ticks. */
  NEED_WAKE_TICKS: 60,
  /** The plenty switch: savings at or above this. */
  PLENTY_WAKE: 200_000,

  /** How many recent events the world remembers for the page. */
  EVENT_MEMORY: 40,
} as const;

/** Metashi per swing at a given tick: halves every HALVING_TICKS, then holds. */
export function yieldAt(tick: number): number {
  const halvings = Math.min(Math.floor(tick / LAWS.HALVING_TICKS), LAWS.MAX_HALVINGS);
  return LAWS.BASE_YIELD >> halvings;
}
