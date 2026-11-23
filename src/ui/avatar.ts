// Little people, 20×32 pixels, full body: every part drawn at random and layered.
// Skin, face, eyes, brows, mouth, marks, facial hair; hair style, bangs and colour; top, print, sleeves;
// bottoms, belt, socks, shoes; headwear, glasses, jewellery and a few otherworldly features.
// Drawn from the world seed and the bot's id, so a bot always looks the same.

import { nextFloat, nextInt, type HasRng } from "@/engine/rng.ts";

export const W = 20;
export const H = 32;

type Grid = (string | null)[];

const SKIN = ["#f6dccb", "#eec7a8", "#e0ae8a", "#cc9470", "#b47a55", "#96603f", "#77482f", "#5a3522", "#43281b"];
const FANTASY_SKIN = ["#a9c4e6", "#b2d49c", "#d3b6e8", "#eaa7a7", "#c2c5cf", "#9fd3cc"];
const HAIR = ["#231c18", "#3b2a20", "#5d3b25", "#8a5a33", "#c48a46", "#e9c36e", "#f0dc9c", "#a6422c", "#7a2e2a", "#e8e3d6", "#9a9aa2"];
const FANTASY_HAIR = ["#4a52a8", "#d6669c", "#3f9a6a", "#8a5ad9", "#e27a3a", "#2fa3a3", "#c23a5a"];
const IRIS = ["#4a1f24", "#3a2416", "#5a3a1e", "#2b3a6a", "#2f6a5a", "#4a6a2e", "#6a3a8a", "#8a4a1e", "#1f1a26"];
const CLOTH = [
  "#e85d50", "#f2efe6", "#2d3a6a", "#4b6fb0", "#6aa0d8", "#3f7a4a", "#8fbf5a", "#d4a12a", "#f0b862", "#7a4f8a",
  "#9a3b4a", "#3a3a46", "#b9b3a8", "#c77b30", "#2fa3a3", "#e88ab0", "#5a4a3a",
];
const SHOE = ["#f2efe6", "#e85d50", "#3a3a46", "#4b6fb0", "#2fa3a3", "#f0b862", "#7a4f8a", "#5a3a2a"];

function pick<T>(s: HasRng, xs: T[]): T {
  return xs[nextInt(s, 0, xs.length - 1)];
}

export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt)));
  return `#${[f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export type Avatar = { grid: Grid; eyes: number[]; parts: Record<string, string> };

export function avatarFor(seed: number, id: number, familyRank = 0.5): Avatar {
  const s: HasRng = { rng: Math.imul(seed ^ 0x2545f491, 0x01000193) ^ Math.imul(id + 7, 0x9e3779b1) };
  const g: Grid = new Array(W * H).fill(null);
  const set = (x: number, y: number, c: string | null) => {
    if (x >= 0 && y >= 0 && x < W && y < H) g[y * W + x] = c;
  };
  const get = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? g[y * W + x] : null);
  const rect = (x0: number, y0: number, x1: number, y1: number, c: string) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c);
  };
  const parts: Record<string, string> = {};

  const gender = pick(s, ["f", "m", "x"]);
  const otherworldly = nextFloat(s) < 0.15;
  const skin = otherworldly ? pick(s, FANTASY_SKIN) : pick(s, SKIN);
  const skinS = shade(skin, -26);
  const hair = nextFloat(s) < 0.14 ? pick(s, FANTASY_HAIR) : pick(s, HAIR);
  const hairL = shade(hair, 38);
  const hairD = shade(hair, -22);
  const iris = pick(s, IRIS);
  const top = pick(s, CLOTH);
  let bottom = pick(s, CLOTH);
  if (bottom === top) bottom = pick(s, CLOTH);
  const rich = familyRank > 0.8;
  parts.look = otherworldly ? "otherworldly" : "human";

  // ---- Hair that falls behind the body (drawn first) ----
  const styles =
    gender === "f"
      ? ["long", "long", "bob", "ponytail", "bun", "braids", "afro", "short", "spiky"]
      : gender === "m"
        ? ["short", "short", "spiky", "buzz", "afro", "mohawk", "bald", "bob"]
        : ["short", "long", "bob", "afro", "spiky", "buzz", "bun", "braids", "mohawk"];
  const style = pick(s, styles);
  parts.hair = style;
  if (style === "long" || style === "braids") rect(5, 5, 14, 15, hairD);

  // ---- Legs, bottoms, socks, shoes ----
  const bottoms = pick(s, gender === "m" ? ["jeans", "cargo", "shorts", "jeans", "trousers"] : ["jeans", "skirt", "pleated", "shorts", "longskirt", "cargo", "checks"]);
  parts.bottoms = bottoms;
  const legL = [7, 8];
  const legR = [11, 12];
  const legs = (y0: number, y1: number, c: string) => {
    for (let y = y0; y <= y1; y++) for (const x of [...legL, ...legR]) set(x, y, c);
  };
  if (bottoms === "jeans" || bottoms === "trousers") {
    rect(6, 19, 13, 20, bottom);
    for (let y = 21; y <= 26; y++) {
      for (const x of [6, 7, 8]) set(x, y, x === 8 ? shade(bottom, -18) : bottom);
      for (const x of [11, 12, 13]) set(x, y, x === 11 ? shade(bottom, -18) : bottom);
    }
    if (bottoms === "jeans") (set(7, 23, shade(bottom, 25)), set(12, 23, shade(bottom, 25)));
  } else if (bottoms === "cargo" || bottoms === "shorts") {
    const to = bottoms === "cargo" ? 24 : 22;
    rect(6, 19, 13, 20, bottom);
    for (let y = 21; y <= to; y++) for (const x of [6, 7, 8, 11, 12, 13]) set(x, y, bottom);
    if (bottoms === "cargo") (set(6, 22, shade(bottom, -25)), set(13, 22, shade(bottom, -25)));
    legs(to + 1, 26, skin);
  } else {
    const to = bottoms === "longskirt" ? 25 : 23;
    for (let y = 19; y <= to; y++) {
      const spread = Math.min(2, Math.floor((y - 19) / 2));
      for (let x = 6 - spread; x <= 13 + spread; x++) {
        let c = bottom;
        if (bottoms === "pleated" && x % 2 === 0) c = shade(bottom, -20);
        if (bottoms === "checks" && (x + y) % 2 === 0) c = pick(s, [shade(bottom, -35), "#f2efe6"]);
        set(x, y, c);
      }
    }
    legs(to + 1, 26, skin);
  }
  const socks = nextFloat(s) < 0.5 ? pick(s, ["#f2efe6", "#3a3a46", pick(s, CLOTH)]) : null;
  if (socks) legs(25, 26, socks);
  const shoe = pick(s, SHOE);
  const shoeKind = pick(s, ["sneakers", "sneakers", "boots", "sandals"]);
  parts.shoes = shoeKind;
  for (const xs of [[6, 7, 8], [11, 12, 13]]) {
    for (const x of xs) {
      if (shoeKind === "boots") (set(x, 25, shade(shoe, -20)), set(x, 26, shade(shoe, -20)));
      set(x, 27, shoeKind === "sandals" ? skin : shoe);
      set(x, 28, shoeKind === "sneakers" ? "#f7f3ea" : shade(shoe, -30));
    }
  }

  // ---- Torso and arms ----
  const topKind = pick(s, ["tee", "tee", "tank", "long", "hoodie", "jacket", "crop"]);
  parts.top = topKind;
  rect(6, 11, 13, 18, top);
  rect(6, 11, 6, 18, shade(top, 18));
  rect(13, 11, 13, 18, shade(top, -18));
  if (topKind === "crop") rect(6, 17, 13, 18, skin);
  // Arms: sleeves, then skin, then hands.
  const sleeve = topKind === "tank" ? 10 : topKind === "tee" || topKind === "crop" ? 13 : 18;
  for (let y = 11; y <= 19; y++) {
    const c = y <= sleeve ? (topKind === "jacket" || topKind === "hoodie" ? shade(top, -10) : top) : y === 19 ? skinS : skin;
    set(5, y, c);
    set(14, y, y <= sleeve ? shade(c, -14) : c === skin ? skinS : c);
  }
  if (topKind === "tank") (set(6, 11, skin), set(13, 11, skin), set(7, 11, top), set(12, 11, top));
  // Neckline.
  set(9, 11, skinS);
  set(10, 11, skinS);
  if (topKind === "hoodie") {
    rect(7, 11, 12, 11, shade(top, -25));
    set(8, 12, "#f7f3ea");
    set(8, 13, "#f7f3ea");
    set(11, 12, "#f7f3ea");
    set(11, 13, "#f7f3ea");
  }
  if (topKind === "jacket") {
    const inner = pick(s, CLOTH);
    rect(8, 12, 11, 18, inner);
    rect(6, 11, 7, 18, shade(top, -12));
    rect(12, 11, 13, 18, shade(top, -26));
  }
  // A print on the chest, stripes or dots.
  const print = pick(s, ["none", "none", "logo", "stripes", "dots", "checks"]);
  parts.print = print;
  if (print === "logo" && topKind !== "jacket") {
    const lc = pick(s, CLOTH);
    rect(8, 13, 11, 15, lc);
    set(9, 14, pick(s, ["#f7f3ea", top, "#3a3a46"]));
    set(10, 14, pick(s, ["#f7f3ea", top]));
  }
  if (print === "stripes") for (let y = 12; y <= 18; y += 2) rect(6, y, 13, y, shade(top, -24));
  if (print === "dots") for (let y = 12; y <= 18; y++) for (let x = 6; x <= 13; x++) if ((x + 2 * y) % 4 === 0) set(x, y, shade(top, 34));
  if (print === "checks") for (let y = 12; y <= 18; y++) for (let x = 6; x <= 13; x++) if ((x + y) % 2 === 0) set(x, y, shade(top, -30));
  // A belt sometimes, and a gold trim for a family of means.
  if (nextFloat(s) < 0.4) rect(6, 19, 13, 19, pick(s, ["#3a2a1e", "#e85d50", "#2fa3a3", "#d4a12a"]));
  if (rich) {
    rect(6, 18, 13, 18, "#e0b34a");
    set(9, 12, "#f3d77c");
    parts.trim = "gold";
  }
  // Arm details.
  if (nextFloat(s) < 0.12) for (let y = sleeve + 1; y <= 18; y += 2) set(14, y, shade(skin, -60));
  if (nextFloat(s) < 0.2) (set(5, 18, pick(s, CLOTH)), set(14, 18, pick(s, CLOTH)));

  // ---- Neck and head ----
  set(9, 10, skinS);
  set(10, 10, skinS);
  rect(7, 3, 12, 9, skin);
  rect(12, 4, 12, 9, skinS);
  set(7, 9, skinS);
  set(12, 9, skinS);
  const ears = !["long", "bob", "afro", "braids"].includes(style);
  if (ears) (set(6, 6, skin), set(13, 6, skinS));

  // Eyes: shape and colour.
  const eyeKind = pick(s, ["dot", "dot", "tall", "lashes", "wide"]);
  parts.eyes = eyeKind;
  const eyes: number[] = [];
  const eye = (x: number, y: number) => {
    set(x, y, iris);
    eyes.push(y * W + x);
  };
  eye(8, 6);
  eye(11, 6);
  // On darker skin, a pixel of eye-white keeps the eyes readable.
  const n = parseInt(skin.slice(1), 16);
  const lum = ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255;
  if (lum < 0.5) (set(7, 6, "#f3ece0"), set(12, 6, "#f3ece0"));
  if (eyeKind === "tall") (eye(8, 7), eye(11, 7));
  if (eyeKind === "wide") (eye(9, 6), eye(10, 6), set(9, 6, iris), set(10, 6, skin), (g[6 * W + 10] = skin), eyes.pop());
  if (eyeKind === "lashes") (set(7, 5, iris), set(12, 5, iris));
  // Brows.
  if (nextFloat(s) < 0.55) (set(8, 5, hairD), set(11, 5, hairD));
  // Mouth.
  const mouth = pick(s, ["none", "smile", "small", "open"]);
  parts.mouth = mouth;
  const lip = shade(skin, -40);
  if (mouth === "smile") (set(9, 8, lip), set(10, 8, lip));
  if (mouth === "small") set(10, 8, lip);
  if (mouth === "open") (set(9, 8, "#7a2e2a"), set(10, 8, "#7a2e2a"));
  // Marks.
  const mark = pick(s, ["none", "none", "blush", "freckles", "scar", "paint"]);
  parts.marks = mark;
  if (mark === "blush") (set(7, 7, "#ee9a92"), set(12, 7, "#e4887e"));
  if (mark === "freckles") (set(8, 7, skinS), set(11, 7, skinS), set(9, 7, skinS));
  if (mark === "scar") (set(11, 5, shade(skin, -50)), set(12, 7, shade(skin, -50)));
  if (mark === "paint") {
    const pc = pick(s, ["#3a6ea5", "#c23a3a", "#f7f3ea", "#d4a12a"]);
    set(7, 7, pc);
    set(12, 7, pc);
  }
  // Facial hair.
  if (gender !== "f" && nextFloat(s) < 0.38) {
    const fh = pick(s, ["stubble", "moustache", "beard"]);
    parts.facialHair = fh;
    if (fh === "stubble") (set(8, 9, hairD), set(10, 9, hairD), set(9, 8, shade(skin, -18)));
    if (fh === "moustache") (set(9, 7, hair), set(10, 7, hair));
    if (fh === "beard") (rect(7, 8, 12, 9, hair), set(9, 8, lip), set(10, 8, lip), set(8, 10, hair), set(9, 10, hair), set(10, 10, hair), set(11, 10, hair));
  }

  // ---- Hair in front ----
  const checker = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, (x + y) % 2 === 0 && y <= y0 + 1 ? hairL : hair);
  };
  const capHair = () => {
    checker(7, 1, 12, 2);
    rect(6, 2, 13, 3, hair);
    for (let x = 7; x <= 12; x += 2) set(x, 2, hairL);
    set(6, 4, hair);
    set(13, 4, hair);
  };
  const bangs = pick(s, ["full", "side", "none"]);
  if (style !== "bald" && style !== "mohawk" && style !== "buzz") {
    capHair();
    if (bangs === "full") rect(7, 3, 12, 3, hair);
    if (bangs === "side") (rect(7, 3, 10, 3, hair), set(7, 4, hair));
  }
  if (style === "buzz") (rect(7, 2, 12, 2, hairD), rect(6, 3, 13, 3, hairD), set(8, 2, hair), set(11, 2, hair));
  if (style === "bald") set(8, 3, shade(skin, 28));
  if (style === "mohawk") for (let y = 0; y <= 3; y++) (set(9, y, hair), set(10, y, y % 2 ? hairL : hair));
  if (style === "spiky") for (const x of [7, 9, 11]) (set(x, 0, hair), set(x + 1, 0, hairL));
  if (style === "short") (set(6, 5, hair), set(13, 5, hair));
  if (style === "long" || style === "braids") {
    for (let y = 4; y <= 14; y++) {
      set(6, y, style === "braids" && y % 2 ? hairL : hair);
      set(13, y, style === "braids" && y % 2 ? hair : hairD);
    }
    if (style === "braids") (set(6, 15, "#d4a12a"), set(13, 15, "#d4a12a"));
  }
  if (style === "bob") for (let y = 4; y <= 8; y++) (set(6, y, hair), set(13, y, hairD), set(5, y, y > 4 ? hairD : null));
  if (style === "bun") (rect(9, 0, 10, 1, hair), set(9, 0, hairL));
  if (style === "ponytail") for (let y = 3; y <= 10; y++) set(14 + (y > 6 ? 1 : 0), y, y % 2 ? hair : hairL);
  if (style === "afro") {
    for (let y = 0; y <= 7; y++)
      for (let x = 4; x <= 15; x++) {
        const d = Math.hypot((x - 9.5) / 1.2, y - 3.5);
        if (d > 5.2) continue;
        if (y >= 4 && x >= 7 && x <= 12) continue;
        set(x, y, (x + y) % 2 === 0 ? hairL : hair);
      }
  }

  // ---- Headwear, glasses, jewellery, otherworldly features ----
  const extras = ["cap", "beanie", "headband", "glasses", "shades", "earrings", "scarf", "bag", "antenna", "horns", "catEars", "halo", "sprout", "thirdEye"];
  const count = nextFloat(s) < 0.6 ? (nextFloat(s) < 0.3 ? 2 : 1) : 0;
  const chosen: string[] = [];
  while (chosen.length < count) {
    const e = pick(s, extras);
    if (!chosen.includes(e)) chosen.push(e);
  }
  parts.extras = chosen.join(", ") || "none";
  const hat = pick(s, CLOTH);
  for (const e of chosen) {
    if (e === "cap") (rect(6, 1, 13, 3, hat), rect(6, 3, 13, 3, shade(hat, -25)), set(9, 1, pick(s, CLOTH)), rect(12, 4, 14, 4, shade(hat, -30)));
    if (e === "beanie") (rect(6, 1, 13, 3, hat), rect(6, 4, 13, 4, shade(hat, 25)), set(9, 0, "#f7f3ea"), set(10, 0, "#f7f3ea"));
    if (e === "headband") rect(6, 3, 13, 3, pick(s, CLOTH));
    if (e === "glasses") (set(7, 6, "#3a2a1e"), set(9, 6, "#3a2a1e"), set(10, 6, "#3a2a1e"), set(12, 6, "#3a2a1e"));
    if (e === "shades") rect(7, 6, 12, 6, "#1f1a26");
    if (e === "earrings") (set(6, 7, "#e0b34a"), set(13, 7, "#e0b34a"));
    if (e === "scarf") (rect(6, 10, 13, 11, hat), set(12, 12, hat), set(12, 13, shade(hat, -20)));
    if (e === "bag") for (let k = 0; k < 8; k++) set(6 + k, 11 + k, "#5a3a2a");
    if (e === "antenna") (set(10, 0, "#e0b34a"), set(10, 1, "#3a3a46"), set(11, 0, "#f3d77c"));
    if (e === "horns") (set(6, 1, "#efe6cf"), set(5, 0, "#efe6cf"), set(13, 1, "#efe6cf"), set(14, 0, "#efe6cf"));
    if (e === "catEars") (set(6, 0, hair), set(6, 1, hair), set(7, 1, hairL), set(13, 0, hair), set(13, 1, hair), set(12, 1, hairL));
    if (e === "halo") rect(7, 0, 12, 0, "#f3d77c");
    if (e === "sprout") (set(10, 0, "#4f9a5a"), set(9, 0, "#7cc46a"), set(11, 0, "#7cc46a"));
    if (e === "thirdEye") (set(9, 4, "#f7f3ea"), set(10, 4, "#7a4fb0"));
  }

  // ---- A soft outline: a dark shade of whatever it borders ----
  const out = [...g];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (g[y * W + x]) continue;
      const n = get(x, y + 1) ?? get(x, y - 1) ?? get(x - 1, y) ?? get(x + 1, y);
      if (n) out[y * W + x] = shade(n, -95);
    }
  return { grid: out, eyes, parts };
}

export type Look = "normal" | "asleep" | "faint";

function grey(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const l = Math.round(((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) * 0.5 + 100);
  return `#${[l, l, l - 8].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("")}`;
}

const cache = new Map<string, HTMLCanvasElement>();

/** The figure as a 20×32 canvas: asleep closes the eyes, faint drains the colour, a flipped switch lights the eyes. */
const steps = new WeakMap<HTMLCanvasElement, HTMLCanvasElement[]>();

/** A walking frame of a figure: one foot lifted a pixel (0 = left foot, 1 = right foot). */
export function walkFrame(fig: HTMLCanvasElement, foot: 0 | 1): HTMLCanvasElement {
  let pair = steps.get(fig);
  if (!pair) {
    pair = ([0, 1] as const).map((f) => {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const x = c.getContext("2d")!;
      x.drawImage(fig, 0, 0);
      const x0 = f === 0 ? 5 : 10;
      x.clearRect(x0, 23, 5, 6);
      x.drawImage(fig, x0, 24, 5, 5, x0, 23, 5, 5);
      return c;
    });
    steps.set(fig, pair);
  }
  return pair[foot];
}

export function avatarCanvas(seed: number, id: number, familyRank: number, look: Look, wake: "need" | "plenty" | null): HTMLCanvasElement {
  const key = `${seed}:${id}:${look}:${wake ?? ""}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const a = avatarFor(seed, id, familyRank);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d")!;
  const eyeSet = new Set(a.eyes);
  a.grid.forEach((col, i) => {
    if (!col) return;
    let colour = col;
    if (eyeSet.has(i)) {
      if (look === "asleep") colour = shade(col, 60) === col ? col : "#3a2a1e";
      else if (wake) colour = wake === "need" ? "#4f8fd8" : "#f3c94a";
    }
    if (look === "faint") colour = grey(colour);
    x.fillStyle = colour;
    x.fillRect(i % W, Math.floor(i / W), 1, 1);
  });
  if (cache.size > 3000) cache.clear();
  cache.set(key, c);
  return c;
}
