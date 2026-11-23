// Names for a new planet's nations and lands. Every nation's numbers come from a real country,
// but its name is made up, so the world never points at a real place. The real twin is revealed only at the end.

import { nextInt, type HasRng } from "./rng.ts";

const START = [
  "Var", "Os", "Mel", "Tha", "Ka", "Ri", "Bel", "Sor", "En", "Ul", "Ash", "Cor", "Dun", "Ely", "Fen", "Gal", "Hol", "Ir",
  "Jun", "Lor", "Mir", "Nor", "Pel", "Quin", "Ros", "Sil", "Tor", "Val", "Wen", "Zar", "Am", "Bri", "Cel", "Dor", "Eri",
  "Hal", "Ith", "Kel", "Lun", "Mar", "Nev", "Oro", "Pra", "Sab", "Tal", "Ves", "Yl", "Zen",
];
const MIDDLE = ["", "", "", "a", "e", "i", "o", "u", "ae", "ia", "or", "an", "el", "is"];
const END = [
  "th", "ra", "nia", "dor", "mar", "esh", "is", "ova", "ur", "en", "ia", "heim", "ar", "ost", "una", "eth", "ira", "ond",
  "al", "wyn", "ec", "ari", "osa", "ume", "ant", "ell", "orn", "ive",
];

const LAND_ADJ = ["Amber", "Salt", "Quiet", "Hollow", "Copper", "Long", "Green", "Ash", "Silver", "Windward", "Ember", "Sunken", "High", "Pale", "Red", "Far"];
const LAND_NOUN = ["Reach", "Coast", "Steppe", "Isles", "Marches", "Plains", "Expanse", "Shore", "Basin", "Heights", "Vale", "Wilds"];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One made-up name per nation, all different. */
export function nationNames(s: HasRng, count: number): string[] {
  const used = new Set<string>();
  const out: string[] = [];
  while (out.length < count) {
    const name = cap(START[nextInt(s, 0, START.length - 1)].toLowerCase() + MIDDLE[nextInt(s, 0, MIDDLE.length - 1)] + END[nextInt(s, 0, END.length - 1)]);
    if (name.length < 4 || name.length > 11 || used.has(name)) continue;
    used.add(name);
    out.push(name);
  }
  return out;
}

/** One name per land (region), all different: "the Amber Reach". */
export function landNames(s: HasRng, count: number): string[] {
  const used = new Set<string>();
  const out: string[] = [];
  while (out.length < count) {
    const name = `${LAND_ADJ[nextInt(s, 0, LAND_ADJ.length - 1)]} ${LAND_NOUN[nextInt(s, 0, LAND_NOUN.length - 1)]}`;
    if (used.has(name)) continue;
    used.add(name);
    out.push(name);
  }
  return out;
}
