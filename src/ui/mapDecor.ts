// The margins of the chart, like an old sea chart's: above the planet a sky with other worlds, a moon, stars and
// now and then a comet; below it the open sea with ships, a serpent, a whale and little waves.
// Everything is drawn in world units (tiles) with the map's ink and washes, so it moves and zooms with the map.
// Placement comes from the world's seed: every planet has its own margins.

import type { World } from "@/engine/world.ts";

type Kind = "ship" | "serpent" | "whale" | "planet" | "moon" | "star" | "comet" | "wave";
export type Piece = { kind: Kind; x: number; y: number; size: number; flip: boolean; tone: string; ring: boolean };

const INK = "rgba(86, 66, 40, 0.8)";
const HATCH = "rgba(86, 66, 40, 0.32)";
const PAPER = "rgba(236, 225, 200, 0.62)";
const WASH = {
  ochre: "rgba(205, 155, 75, 0.38)",
  blue: "rgba(115, 150, 175, 0.34)",
  brick: "rgba(180, 95, 65, 0.32)",
  sage: "rgba(125, 150, 110, 0.36)",
  sand: "rgba(232, 205, 150, 0.7)",
  wood: "rgba(150, 105, 60, 0.45)",
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where the margin pieces go for this world. Near ones show on wide screens, far ones on tall screens. */
export function decorFor(w: World): Piece[] {
  const r = rng(w.seed * 7919 + 13);
  const W = w.width;
  const H = w.height;
  const tones = [WASH.ochre, WASH.blue, WASH.brick, WASH.sage];
  const tone = () => tones[Math.floor(r() * tones.length)];
  const flip = () => r() < 0.5;
  const out: Piece[] = [];
  const add = (kind: Kind, x: number, y: number, size: number, extra: Partial<Piece> = {}) =>
    out.push({ kind, x, y, size, flip: flip(), tone: tone(), ring: false, ...extra });

  // The sky. A ringed world and a moon close by; a second world and a comet further out.
  const left = r() < 0.5;
  add("planet", W * (left ? 0.16 + r() * 0.1 : 0.74 + r() * 0.1), -9 - r() * 2, 4 + r() * 1.2, { ring: true });
  add("moon", W * (0.44 + r() * 0.12), -6 - r() * 3, 2.2 + r() * 0.6);
  add("planet", W * (left ? 0.8 + r() * 0.1 : 0.12 + r() * 0.1), -20 - r() * 10, 2.2 + r() * 1.6, { ring: r() < 0.35 });
  if (r() < 0.7) add("comet", W * (0.25 + r() * 0.5), -24 - r() * 10, 5 + r() * 3);
  for (let i = 0; i < 34; i++) add("star", r() * W, -3 - Math.pow(r(), 0.7) * 40, 0.4 + r() * 0.7);

  // The sea. Two ships, a serpent and a whale close by; another ship further out; waves everywhere.
  const slots = [0.08 + r() * 0.06, 0.36 + r() * 0.08, 0.62 + r() * 0.08, 0.86 + r() * 0.05];
  const kinds: Kind[] = ["ship", "serpent", "whale", "ship"];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  kinds.forEach((k, i) => {
    const size = k === "serpent" ? 19 + r() * 4 : k === "whale" ? 12 + r() * 3 : 8 + r() * 2;
    add(k, W * slots[i], H + 7 + r() * 4, size);
  });
  add("ship", W * (0.3 + r() * 0.4), H + 24 + r() * 10, 6.5 + r() * 1.5);
  for (let i = 0; i < 40; i++) add("wave", r() * W, H + 3 + Math.pow(r(), 0.8) * 40, 1 + r() * 0.8);
  return out;
}

/** Draw the margins. ox, oy, s map tiles to buffer pixels, as in the board's camera. */
export function drawDecor(ctx: CanvasRenderingContext2D, pieces: Piece[], ox: number, oy: number, s: number) {
  ctx.save();
  ctx.setTransform(s, 0, 0, s, ox, oy);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const px = 1 / s; // one buffer pixel, in tiles
  for (const p of pieces) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(p.flip ? -p.size : p.size, p.size);
    const lw = (1.7 * px) / p.size; // line width in the piece's own units
    ctx.lineWidth = lw;
    ctx.strokeStyle = INK;
    DRAW[p.kind](ctx, p, lw);
    ctx.restore();
  }
  ctx.restore();
}

const DRAW: Record<Kind, (ctx: CanvasRenderingContext2D, p: Piece, lw: number) => void> = {
  // A two-masted ship, length 1, waterline at y = 0.
  ship(ctx, _p, lw) {
    ctx.beginPath();
    ctx.moveTo(-0.52, -0.1);
    ctx.lineTo(0.5, -0.13);
    ctx.quadraticCurveTo(0.4, 0.1, 0.22, 0.1);
    ctx.lineTo(-0.34, 0.1);
    ctx.quadraticCurveTo(-0.48, 0.05, -0.52, -0.1);
    ctx.closePath();
    ctx.fillStyle = WASH.wood;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.42, 0.0);
    ctx.lineTo(0.4, -0.02);
    ctx.stroke();
    // Masts and sails.
    for (const [mx, top] of [
      [-0.14, -0.82],
      [0.2, -0.66],
    ]) {
      ctx.beginPath();
      ctx.moveTo(mx, -0.11);
      ctx.lineTo(mx, top);
      ctx.stroke();
      const h = (-0.14 - top) / 2;
      for (let k = 0; k < 2; k++) {
        const t = top + 0.04 + k * h;
        const wd = 0.17 + k * 0.05;
        ctx.beginPath();
        ctx.moveTo(mx - wd, t);
        ctx.quadraticCurveTo(mx, t - 0.03, mx + wd, t);
        ctx.lineTo(mx + wd + 0.03, t + h * 0.82);
        ctx.quadraticCurveTo(mx + 0.06, t + h * 1.02, mx - wd - 0.02, t + h * 0.82);
        ctx.closePath();
        ctx.fillStyle = WASH.sand;
        ctx.fill();
        ctx.stroke();
      }
    }
    // A pennant and the bowsprit.
    ctx.beginPath();
    ctx.moveTo(-0.14, -0.82);
    ctx.quadraticCurveTo(-0.24, -0.86, -0.32, -0.8);
    ctx.lineTo(-0.14, -0.77);
    ctx.fillStyle = WASH.brick;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.5, -0.1);
    ctx.lineTo(-0.66, -0.22);
    ctx.stroke();
    ripples(ctx, [-0.45, -0.1, 0.3], 0.16, lw);
  },

  // A sea serpent: a head on a raised neck, three humps with fins, a curled tail. Length 1, waterline at y = 0.
  serpent(ctx, _p, lw) {
    ctx.fillStyle = WASH.sage;
    // Humps.
    const humps = [
      [-0.2, 0.11],
      [0.06, 0.095],
      [0.29, 0.075],
    ];
    for (const [cx, R] of humps) {
      ctx.beginPath();
      ctx.arc(cx, 0, R, Math.PI, 0);
      ctx.arc(cx, 0, R * 0.48, 0, Math.PI, true);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      for (const a of [-2.3, -1.57, -0.84]) {
        const x = cx + Math.cos(a) * R;
        const y = Math.sin(a) * R;
        ctx.beginPath();
        ctx.moveTo(x - 0.014, y + 0.004);
        ctx.lineTo(x + Math.cos(a) * 0.04, y + Math.sin(a) * 0.04);
        ctx.lineTo(x + 0.014, y + 0.004);
        ctx.stroke();
      }
    }
    // Neck and head.
    ctx.beginPath();
    ctx.moveTo(-0.44, 0);
    ctx.bezierCurveTo(-0.46, -0.16, -0.36, -0.26, -0.43, -0.36);
    ctx.lineTo(-0.36, -0.37);
    ctx.bezierCurveTo(-0.3, -0.25, -0.38, -0.14, -0.36, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-0.43, -0.4, 0.075, 0.042, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.5, -0.38);
    ctx.lineTo(-0.44, -0.385);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-0.42, -0.415, lw * 1.4, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    // A fin behind the head.
    ctx.beginPath();
    ctx.moveTo(-0.38, -0.42);
    ctx.lineTo(-0.33, -0.48);
    ctx.lineTo(-0.35, -0.38);
    ctx.stroke();
    // Tail.
    ctx.beginPath();
    ctx.moveTo(0.4, 0);
    ctx.bezierCurveTo(0.44, -0.16, 0.56, -0.16, 0.54, -0.07);
    ctx.bezierCurveTo(0.53, -0.03, 0.49, -0.05, 0.5, -0.08);
    ctx.stroke();
    ripples(ctx, [-0.4, -0.2, 0.06, 0.29, 0.42], 0.07, lw);
  },

  // A whale's back and tail above the water, with a spout. Length 1, waterline at y = 0.
  whale(ctx, _p, lw) {
    ctx.beginPath();
    ctx.moveTo(-0.5, 0);
    ctx.bezierCurveTo(-0.48, -0.26, 0.1, -0.3, 0.26, 0);
    ctx.closePath();
    ctx.fillStyle = WASH.blue;
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = HATCH;
    for (let x = -0.5; x < 0.3; x += 0.035) {
      ctx.beginPath();
      ctx.moveTo(x, -0.06);
      ctx.lineTo(x + 0.06, 0);
      ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(-0.36, -0.1, lw * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    // Tail flukes rising further back.
    ctx.beginPath();
    ctx.moveTo(0.38, 0);
    ctx.quadraticCurveTo(0.4, -0.12, 0.44, -0.2);
    ctx.quadraticCurveTo(0.36, -0.3, 0.3, -0.27);
    ctx.quadraticCurveTo(0.42, -0.24, 0.46, -0.22);
    ctx.quadraticCurveTo(0.54, -0.32, 0.6, -0.31);
    ctx.quadraticCurveTo(0.52, -0.24, 0.48, -0.2);
    ctx.quadraticCurveTo(0.46, -0.1, 0.47, 0);
    ctx.fillStyle = WASH.blue;
    ctx.fill();
    ctx.stroke();
    // Spout.
    for (const a of [-0.5, 0, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(-0.3, -0.22);
      ctx.quadraticCurveTo(-0.3 + a * 0.05, -0.36, -0.3 + a * 0.12, -0.38);
      ctx.stroke();
    }
    ripples(ctx, [-0.42, -0.05, 0.42], 0.12, lw);
  },

  // A world of its own: washed, banded, shaded by hatching, sometimes with a ring. Radius 1.
  planet(ctx, p) {
    if (p.ring) ringHalf(ctx, true);
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fillStyle = "#ece1c8"; // solid paper first, so the back of the ring stays hidden
    ctx.fill();
    ctx.fillStyle = p.tone;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = HATCH;
    for (let y = -0.6; y <= 0.7; y += 0.32) {
      ctx.beginPath();
      ctx.moveTo(-1, y);
      ctx.quadraticCurveTo(0, y + 0.14, 1, y);
      ctx.stroke();
    }
    for (let x = -1; x < 1.4; x += 0.09) {
      ctx.beginPath();
      ctx.moveTo(x, 1);
      ctx.lineTo(x + 0.6, -0.2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(-0.3, -0.3, 0.92, 0, Math.PI * 2);
    ctx.fillStyle = PAPER;
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.stroke();
    if (p.ring) ringHalf(ctx, false);
  },

  // A crescent moon, the dark side only outlined. Radius 1.
  moon(ctx) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(-2, -2, 4, 4);
    ctx.moveTo(0.42 + 0.86, -0.12);
    ctx.arc(0.42, -0.12, 0.86, 0, Math.PI * 2, true);
    ctx.fillStyle = WASH.sand;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  },

  // A four-pointed glint.
  star(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.quadraticCurveTo(0.1, -0.1, 1, 0);
    ctx.quadraticCurveTo(0.1, 0.1, 0, 1);
    ctx.quadraticCurveTo(-0.1, 0.1, -1, 0);
    ctx.quadraticCurveTo(-0.1, -0.1, 0, -1);
    ctx.fillStyle = "rgba(190, 145, 60, 0.75)";
    ctx.fill();
  },

  // A comet: a small head and a fanned tail. Length 1.
  comet(ctx) {
    for (const [dy, a] of [
      [-0.05, 0.5],
      [0, 0.8],
      [0.05, 0.5],
      [0.1, 0.3],
    ]) {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.moveTo(-0.42, 0);
      ctx.quadraticCurveTo(0, dy * 0.6, 0.5, dy * 3 - 0.12);
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(-0.45, 0, 0.05, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(205, 155, 75, 0.85)";
    ctx.fill();
    ctx.stroke();
  },

  // A little wave mark.
  wave(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(-0.5, 0);
    ctx.quadraticCurveTo(-0.25, -0.3, 0, 0);
    ctx.quadraticCurveTo(0.25, -0.3, 0.5, 0);
    ctx.stroke();
    ctx.restore();
  },
};

/** The back half of a ring goes behind the planet, the front half over it. */
function ringHalf(ctx: CanvasRenderingContext2D, back: boolean) {
  ctx.save();
  ctx.rotate(-0.32);
  for (const [rx, ry] of [
    [1.85, 0.42],
    [1.55, 0.32],
  ]) {
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, back ? Math.PI : 0, back ? Math.PI * 2 : Math.PI);
    ctx.stroke();
  }
  ctx.restore();
}

/** Short strokes on the waterline. */
function ripples(ctx: CanvasRenderingContext2D, xs: number[], half: number, lw: number) {
  ctx.save();
  ctx.globalAlpha = 0.6;
  for (const x of xs) {
    ctx.beginPath();
    ctx.moveTo(x - half, lw * 3);
    ctx.lineTo(x + half, lw * 3);
    ctx.moveTo(x - half * 0.5, lw * 9);
    ctx.lineTo(x + half * 0.6, lw * 9);
    ctx.stroke();
  }
  ctx.restore();
}
