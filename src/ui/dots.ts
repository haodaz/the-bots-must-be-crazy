// The dot-matrix screen. Every tile is 7×7 dots; each land has its own faint earth-tone dots,
// gold lights dots up, and each bot is a small dot-matrix creature grown from its seed.

import { isNight } from "@/engine/laws.ts";
import type { World } from "@/engine/world.ts";
import { DOTS, EYES, goldDots, goldOrder, spriteFor, type Sprite } from "./sprite.ts";

/** Unlit dots, one earth tone per land (west to east). */
export const LAND_TINTS = ["#ddd2bb", "#d6dcc2", "#d2d9de", "#e6d2b4", "#e6d5ae", "#e4cbbd", "#cddcd2"];
const PLAIN = "#e0d6c1";

export const COL = {
  paper: "#f3ecdc",
  gold: "#d4a12a",
  body: "#5b5142",
  digging: "#2b2417",
  faint: "#b5a99a",
  asleep: "#8d8576",
  need: "#3a6ea5",
  plenty: "#e0a91f",
  select: "#c4462f",
  lamp: "rgba(240, 200, 90, 0.42)",
};

export type Camera = { cx: number; cy: number; zoom: 1 | 3 };

export type DrawOptions = {
  selectedId?: number | null;
  followId?: number | null;
  highlightLand?: number | null;
  /** 0..1: how much of the gold is shown (for the opening). */
  goldAlpha?: number;
  /** 0..1: lands take their colours from west to east (for the opening). */
  landReveal?: number;
  /** How many bots are born so far (for the opening). */
  botsShown?: number;
};

export type View = { left: number; top: number; vw: number; vh: number; p: number };

export class DotRenderer {
  readonly base: number;
  private dots = new Map<string, HTMLCanvasElement>();
  private patterns = new Map<string, CanvasPattern>();
  private sprites: Sprite[] = [];
  private spriteSeed: number | null = null;
  private orders: number[][] = [];

  constructor(dpr: number) {
    this.base = Math.max(2, Math.round(3 * dpr));
  }

  size(w: World) {
    return { width: w.width * DOTS * this.base, height: w.height * DOTS * this.base };
  }

  sprite(w: World, id: number): Sprite {
    if (this.spriteSeed !== w.seed) {
      this.sprites = w.bots.map((b) => spriteFor(w.seed, b.id));
      this.spriteSeed = w.seed;
    }
    return this.sprites[id];
  }

  view(w: World, cam: Camera): View {
    const vw = w.width / cam.zoom;
    const vh = w.height / cam.zoom;
    const left = cam.zoom === 1 ? 0 : clamp(cam.cx - vw / 2, 0, w.width - vw);
    const top = cam.zoom === 1 ? 0 : clamp(cam.cy - vh / 2, 0, w.height - vh);
    return { left, top, vw, vh, p: this.base * cam.zoom };
  }

  /** Canvas pixel → world tile. */
  pick(w: World, cam: Camera, fx: number, fy: number) {
    const v = this.view(w, cam);
    return { x: v.left + fx * v.vw, y: v.top + fy * v.vh };
  }

  draw(ctx: CanvasRenderingContext2D, w: World, cam: Camera, o: DrawOptions = {}) {
    const v = this.view(w, cam);
    const { p } = v;
    const T = DOTS * p;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = COL.paper;
    ctx.fillRect(0, 0, W, H);

    // From here on, draw in world space (device pixels, scrolled by the camera).
    ctx.setTransform(1, 0, 0, 1, -v.left * T, -v.top * T);
    const reveal = o.landReveal ?? 1;
    w.lands.forEach((land, i) => {
      const shown = (i + 1) / w.lands.length <= reveal + 1e-9;
      ctx.fillStyle = this.pattern(ctx, shown ? LAND_TINTS[i % LAND_TINTS.length] : PLAIN, p);
      ctx.fillRect(land.x0 * T, 0, (land.x1 - land.x0) * T, w.height * T);
    });

    // Gold in the ground.
    const x0 = Math.max(0, Math.floor(v.left));
    const x1 = Math.min(w.width, Math.ceil(v.left + v.vw));
    const y0 = Math.max(0, Math.floor(v.top));
    const y1 = Math.min(w.height, Math.ceil(v.top + v.vh));
    const gold = this.dot(COL.gold, p);
    ctx.globalAlpha = o.goldAlpha ?? 1;
    if (ctx.globalAlpha > 0) {
      for (let ty = y0; ty < y1; ty++) {
        for (let tx = x0; tx < x1; tx++) {
          const i = ty * w.width + tx;
          const k = goldDots(w.gold[i]);
          if (!k) continue;
          const order = this.order(i);
          for (let j = 0; j < k; j++) {
            const d = order[j];
            ctx.drawImage(gold, tx * T + (d % DOTS) * p, ty * T + Math.floor(d / DOTS) * p);
          }
        }
      }
    }
    ctx.globalAlpha = 1;

    // Borders between lands.
    if (reveal > 0) {
      ctx.strokeStyle = "rgba(43, 36, 23, 0.35)";
      ctx.lineWidth = Math.max(1, p / 3);
      ctx.setLineDash([p, p]);
      for (const land of w.lands.slice(1)) {
        if ((w.lands.indexOf(land) + 1) / w.lands.length > reveal + 1 / w.lands.length) continue;
        ctx.beginPath();
        ctx.moveTo(land.x0 * T, 0);
        ctx.lineTo(land.x0 * T, w.height * T);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    if (o.highlightLand != null) {
      const land = w.lands[o.highlightLand];
      ctx.strokeStyle = COL.select;
      ctx.lineWidth = Math.max(2, p / 1.5);
      ctx.strokeRect(land.x0 * T + ctx.lineWidth / 2, ctx.lineWidth / 2, (land.x1 - land.x0) * T - ctx.lineWidth, w.height * T - ctx.lineWidth);
    }

    const night = isNight(w.tick) && (o.botsShown ?? Infinity) >= w.bots.length;
    if (night) {
      ctx.fillStyle = "rgba(43, 36, 23, 0.16)";
      ctx.fillRect(v.left * T, v.top * T, v.vw * T, v.vh * T);
    }

    // Bots.
    const shown = o.botsShown ?? w.bots.length;
    for (const b of w.bots) {
      if (b.id >= shown) continue;
      if (b.x < x0 - 1 || b.x > x1 || b.y < y0 - 1 || b.y > y1) continue;
      const bx = b.x * T;
      const by = b.y * T;
      if (night && b.birth.electricity) {
        ctx.fillStyle = COL.lamp;
        ctx.beginPath();
        ctx.arc(bx + T / 2, by + T / 2, T * 0.75, 0, Math.PI * 2);
        ctx.fill();
      }
      const body =
        b.state === "faint" ? COL.faint : b.state === "asleep" ? COL.asleep : b.state === "mining" ? COL.digging : COL.body;
      const bodyDot = this.dot(body, p);
      const eyeDot = b.wake ? this.dot(b.wake === "need" ? COL.need : COL.plenty, p) : bodyDot;
      const sp = this.sprite(w, b.id);
      for (let r = 0; r < DOTS; r++) {
        for (let c = 0; c < DOTS; c++) {
          if (!sp[r * DOTS + c]) continue;
          const isEye = EYES.some(([er, ec]) => er === r && ec === c);
          ctx.drawImage(isEye ? eyeDot : bodyDot, bx + c * p, by + r * p);
        }
      }
    }

    for (const id of [o.selectedId, o.followId]) {
      if (id == null) continue;
      const b = w.bots[id];
      ctx.strokeStyle = COL.select;
      ctx.lineWidth = Math.max(2, p / 2);
      ctx.setLineDash([p, p / 1.5]);
      ctx.strokeRect(b.x * T - p, b.y * T - p, T + 2 * p, T + 2 * p);
      ctx.setLineDash([]);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  /** A single round dot of a colour, at a pitch. */
  dot(color: string, p: number): HTMLCanvasElement {
    const key = `${color}|${p}`;
    let c = this.dots.get(key);
    if (!c) {
      c = document.createElement("canvas");
      c.width = c.height = p;
      const x = c.getContext("2d")!;
      x.fillStyle = color;
      x.beginPath();
      x.arc(p / 2, p / 2, p * 0.4, 0, Math.PI * 2);
      x.fill();
      this.dots.set(key, c);
    }
    return c;
  }

  private pattern(ctx: CanvasRenderingContext2D, color: string, p: number): CanvasPattern {
    const key = `${color}|${p}`;
    let pat = this.patterns.get(key);
    if (!pat) {
      const tile = document.createElement("canvas");
      tile.width = tile.height = p;
      tile.getContext("2d")!.drawImage(this.dot(color, p), 0, 0);
      pat = ctx.createPattern(tile, "repeat")!;
      this.patterns.set(key, pat);
    }
    return pat;
  }

  private order(i: number) {
    return (this.orders[i] ??= goldOrder(i));
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
