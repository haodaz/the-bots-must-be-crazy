// A seeded random number generator (mulberry32). Its state lives inside the world,
// so the same seed always replays the same history.

export type HasRng = { rng: number };

export function nextFloat(s: HasRng): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [min, max], both ends included. */
export function nextInt(s: HasRng, min: number, max: number): number {
  return min + Math.floor(nextFloat(s) * (max - min + 1));
}
