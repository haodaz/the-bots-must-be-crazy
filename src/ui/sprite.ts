// How a bot looks: a 7×7 dot-matrix creature, mirrored left to right, grown from the world seed and its id.
// Looks are drawn from their own random stream, so they never change what happens in the world.

import { nextFloat } from "@/engine/rng.ts";

export const DOTS = 7;
/** Where the eyes sit (row, column). They light up when a switch flips, and when a mind wakes. */
export const EYES: ReadonlyArray<readonly [number, number]> = [
  [2, 2],
  [2, 4],
];

export type Sprite = boolean[]; // DOTS × DOTS, row by row

export function spriteFor(worldSeed: number, botId: number): Sprite {
  const s = { rng: Math.imul(worldSeed ^ 0x5bd1e995, 0x01000193) ^ Math.imul(botId + 1, 0x9e3779b1) };
  const g: Sprite = new Array(DOTS * DOTS).fill(false);
  for (let y = 0; y < DOTS; y++) {
    const edge = y === 0 || y === DOTS - 1 ? 0.6 : 1;
    for (let x = 0; x < 4; x++) {
      const centre = x >= 2 ? 0.62 : 0.34;
      const on = nextFloat(s) < centre * edge;
      g[y * DOTS + x] = on;
      g[y * DOTS + (DOTS - 1 - x)] = on;
    }
  }
  // Every bot has a face and a heart, so it always reads as a creature.
  for (const [r, c] of EYES) g[r * DOTS + c] = true;
  g[3 * DOTS + 3] = true;
  return g;
}

/** A fixed order in which a tile's 49 dots light up as gold piles up, so the gold doesn't flicker. */
export function goldOrder(tileIndex: number): number[] {
  const s = { rng: Math.imul(tileIndex + 7, 0x2c1b3c6d) };
  const order = Array.from({ length: DOTS * DOTS }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(nextFloat(s) * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** How many of a tile's 49 dots are lit for this much metashi (log scale: 1,000 → a few, 1,000,000 → all). */
export function goldDots(metashi: number): number {
  if (metashi <= 0) return 0;
  const p = Math.min(1, Math.max(0.06, (Math.log10(metashi) - 2) / 4));
  return Math.max(1, Math.round(p * DOTS * DOTS));
}
