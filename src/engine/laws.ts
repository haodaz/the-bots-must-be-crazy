// The laws of the world. Everything here is plain code: running the world costs nothing.
// Only a mind that wakes up spends real compute, and that comes later.

export const LAWS = {
  /** There will only ever be this many metashi. The same cap as Bitcoin. */
  SUPPLY: 21_000_000,

  POPULATION: 100,

  /**
   * New money arrives as gold rain, like Bitcoin's block rewards: the first rain brings half the supply, and every
   * era after that the sky gives half as much as the time before. 21M halves into whole metashi six times, so there
   * are seven rains: six halvings, and a last rain that brings everything left (328,125). Then the sky is empty.
   */
  ERA_DAYS: 10,
  RAINS: 7,

  /** What an hour of work earns, for a bot with the reference schooling and no tools. */
  WAGE: 40,

  /** One day in the engine is one year of a life on the screen. Real compute will arrive once a year, like a harvest. */
  DAY_TICKS: 600,
  /** A round is one life of a hundred years: then the world stops and every life is filed in the archive. */
  LIFE_DAYS: 100,

  /**
   * Food costs metashi (at world-average prices). What is paid goes back into the local economy.
   * Calibrated so that the share of bots who run out of food and money roughly matches the real prevalence of
   * undernourishment (FAO, The State of Food Security and Nutrition in the World 2024: about 9% worldwide,
   * about 20% in Africa, under 2.5% in Europe and North America).
   */
  FOOD_PRICE: 200,
  /**
   * Spending beyond food: at every meal a bot also spends this share of whatever it holds above a small cushion
   * (CUSHION_MEALS meals' worth). That money goes back into the local economy and becomes someone else's wage.
   */
  SPEND_SHARE: 0.01,
  CUSHION_MEALS: 8,
  /** Hunger at which a creature is starving and too weak to walk every tick. */
  STARVING: 150,

  /** The need switch: starving with no money for food for this many ticks. */
  NEED_WAKE_TICKS: 60,
  /** The plenty switch: savings at or above this. */
  PLENTY_WAKE: 500_000,

  /** At genesis this share of the first rain lands in pockets as family money; the rest in the economy. */
  INHERITANCE_SHARE: 0.4,
  /**
   * Public spending: once a year each country spends this share of its treasury back into its own economy, as the
   * wages of public works and public jobs; the rest stays as a reserve for welfare and policies. Most governments
   * spend about what they collect in a year (IMF, Fiscal Monitor), so taxes do not pile up unused.
   */
  PUBLIC_SPENDING_SHARE: 0.5,
  /** Night starts at this point of the day. Bots without electricity sleep through it. */
  NIGHT_FROM: 0.7,
  /**
   * Returns to schooling: each year of school above the reference raises what an hour of work earns by this share.
   * About 9% a year is the global average return to a year of schooling
   * (Psacharopoulos & Patrinos, "Returns to Investment in Education: A Decennial Review of the Global Literature", World Bank, 2018).
   */
  RETURN_PER_SCHOOL_YEAR: 0.09,
  /** Years of school at which an hour of work earns exactly the base wage. */
  REFERENCE_SCHOOL_YEARS: 10,
  /** Bots with tools (they grew up online) earn this many times more per hour. */
  TOOLS_MULTIPLIER: 2,
  /** A country's food price follows its real cost of living, kept within this range of the world average. */
  PRICE_RANGE: [0.4, 1.6] as const,

  /** How many recent events the world remembers for the page. */
  EVENT_MEMORY: 40,
} as const;

export const ERA_TICKS = LAWS.ERA_DAYS * LAWS.DAY_TICKS;

/** How much gold falls in a given era's rain (era 0 is genesis). Halves every era; the last rain empties the sky. */
export function rainOf(era: number): number {
  if (era < 0 || era >= LAWS.RAINS) return 0;
  return LAWS.SUPPLY / Math.pow(2, Math.min(era + 1, LAWS.RAINS - 1));
}

export const isNight = (tick: number) => tick % LAWS.DAY_TICKS >= LAWS.DAY_TICKS * LAWS.NIGHT_FROM;

/** What an hour of work earns for a bot with this much school and these tools. */
export function wageFor(schoolYears: number, tools: boolean): number {
  const school = Math.pow(1 + LAWS.RETURN_PER_SCHOOL_YEAR, schoolYears - LAWS.REFERENCE_SCHOOL_YEARS);
  return Math.max(1, Math.round(LAWS.WAGE * school * (tools ? LAWS.TOOLS_MULTIPLIER : 1)));
}
