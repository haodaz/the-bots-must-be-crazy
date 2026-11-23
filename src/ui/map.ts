// The map: a pixel world you can zoom. Far out, every tile is one pixel block (terrain, borders, and the economy
// glowing like city lights). Close in, every tile opens into a 7×7 dot matrix and each bot shows its own little body.

import { isNight } from "@/engine/laws.ts";
import type { World } from "@/engine/world.ts";
import { DOTS, EYES, goldDots, goldOrder, spriteFor, type Sprite } from "./sprite.ts";

export const COL = {
  gold: "#d4a12a",
  goldRGB: "212, 161, 42",
  body: "#5b5142",
  working: "#2b2417",
  faint: "#a99d8e",
  asleep: "#8d8576",
  need: "#3a6ea5",
  plenty: "#e0a91f",
  select: "#c4462f",
  lamp: "rgba(240, 200, 90, 0.45)",
};

/** Buffer size of the main canvas, in device pixels. The map is 160×60 tiles. */
export const BUFFER = { width: 2400, height: 900 };
/** Above this many device pixels per tile, tiles open into dot matrices. */
export const DOT_ZOOM = 44;

export type Camera = { cx: number; cy: number; s: number };
export type Rect = { x0: number; y0: number; x1: number; y1: number };

export type DrawOptions = {
  selectedId?: number | null;
  followId?: number | null;
  area?: Rect | null;
  dragging?: Rect | null;
  highlightCountry?: number | null;
  /** Opening: 0..1 share of land that has appeared. */
  landReveal?: number;
  /** Opening: 0..1 strength of borders. */
  borders?: number;
  /** Opening: 0..1 visibility of the economy. */
  economy?: number;
  /** Opening: how many bots are born so far. */
  botsShown?: number;
};

export function fitCamera(w: World): Camera {
  return { cx: w.width / 2, cy: w.height / 2, s: BUFFER.width / w.width };
}

export function clampCamera(w: World, c: Camera): Camera {
  const minS = BUFFER.width / w.width;
  const s = Math.max(minS, Math.min(minS * 8, c.s));
  const vw = BUFFER.width / s;
  const vh = BUFFER.height / s;
  return {
    s,
    cx: vw >= w.width ? w.width / 2 : Math.max(vw / 2, Math.min(w.width - vw / 2, c.cx)),
    cy: vh >= w.height ? w.height / 2 : Math.max(vh / 2, Math.min(w.height - vh / 2, c.cy)),
  };
}

/** Screen (buffer px) ↔ world (tiles). */
export function toWorld(c: Camera, px: number, py: number) {
  return { x: c.cx + (px - BUFFER.width / 2) / c.s, y: c.cy + (py - BUFFER.height / 2) / c.s };
}
export function toScreen(c: Camera, x: number, y: number) {
  return { px: (x - c.cx) * c.s + BUFFER.width / 2, py: (y - c.cy) * c.s + BUFFER.height / 2 };
}

export class MapRenderer {
  private tileColor: string[] = [];
  private reveal: number[] = [];
  private sprites: Sprite[] = [];
  private orders: number[][] = [];
  private dots = new Map<string, HTMLCanvasElement>();
  private keyWorld: World | null = null;

  /** Per-world caches: tile colours with a little pixel grain, reveal order, bot sprites. */
  private prepare(w: World) {
    if (this.keyWorld === w) return;
    this.keyWorld = w;
    const pal = w.geo.palette.terrain;
    this.tileColor = w.geo.terrain.map((t, i) => grain(pal[t], i));
    this.reveal = w.geo.terrain.map((_, i) => hash(i * 2 + 1));
    this.sprites = w.bots.map((b) => spriteFor(w.seed, b.id));
    this.orders = [];
  }

  draw(ctx: CanvasRenderingContext2D, w: World, cam: Camera, o: DrawOptions = {}) {
    this.prepare(w);
    const { s } = cam;
    const geo = w.geo;
    const pal = geo.palette;
    const W = BUFFER.width;
    const H = BUFFER.height;
    const dotMode = s >= DOT_ZOOM;
    const p = s / DOTS;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.terrain[0];
    ctx.fillRect(0, 0, W, H);

    const tl = toWorld(cam, 0, 0);
    const br = toWorld(cam, W, H);
    const x0 = Math.max(0, Math.floor(tl.x));
    const y0 = Math.max(0, Math.floor(tl.y));
    const x1 = Math.min(w.width, Math.ceil(br.x));
    const y1 = Math.min(w.height, Math.ceil(br.y));
    const ox = W / 2 - cam.cx * s;
    const oy = H / 2 - cam.cy * s;
    const reveal = o.landReveal ?? 1;

    // Land, sea depth and terrain.
    for (let ty = y0; ty < y1; ty++) {
      for (let tx = x0; tx < x1; tx++) {
        const i = ty * w.width + tx;
        const land = geo.terrain[i] !== 0 && this.reveal[i] <= reveal;
        const X = ox + tx * s;
        const Y = oy + ty * s;
        if (!land) {
          if (geo.terrain[i] === 0 && (ty + tx) % 2 === 0 && nearLand(w, tx, ty) === false) {
            ctx.fillStyle = pal.seaDeep;
            ctx.fillRect(X + s * 0.35, Y + s * 0.45, Math.max(1, s * 0.3), Math.max(1, s * 0.1));
          }
          continue;
        }
        if (dotMode) {
          const d = this.dot(this.tileColor[i], p);
          for (let r = 0; r < DOTS; r++) for (let c = 0; c < DOTS; c++) ctx.drawImage(d, X + c * p, Y + r * p);
        } else {
          ctx.fillStyle = this.tileColor[i];
          ctx.fillRect(X, Y, Math.ceil(s), Math.ceil(s));
        }
      }
    }

    // Borders between countries, and the coastline.
    const b = o.borders ?? 1;
    if (b > 0) {
      ctx.globalAlpha = b;
      ctx.strokeStyle = pal.border;
      ctx.lineWidth = Math.max(1.5, s / 16);
      ctx.beginPath();
      for (let ty = y0; ty < y1; ty++) {
        for (let tx = x0; tx < x1; tx++) {
          const i = ty * w.width + tx;
          const c = geo.cells[i];
          if (c < 0) continue;
          if (tx + 1 < w.width && geo.cells[i + 1] >= 0 && geo.cells[i + 1] !== c) {
            ctx.moveTo(ox + (tx + 1) * s, oy + ty * s);
            ctx.lineTo(ox + (tx + 1) * s, oy + (ty + 1) * s);
          }
          if (ty + 1 < w.height && geo.cells[i + w.width] >= 0 && geo.cells[i + w.width] !== c) {
            ctx.moveTo(ox + tx * s, oy + (ty + 1) * s);
            ctx.lineTo(ox + (tx + 1) * s, oy + (ty + 1) * s);
          }
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (o.highlightCountry != null) {
      ctx.fillStyle = "rgba(196, 70, 47, 0.16)";
      for (const t of w.countries[o.highlightCountry].tiles) {
        const tx = t % w.width;
        const ty = Math.floor(t / w.width);
        if (tx >= x0 && tx < x1 && ty >= y0 && ty < y1) ctx.fillRect(ox + tx * s, oy + ty * s, Math.ceil(s), Math.ceil(s));
      }
    }

    // The economy: money glows where it circulates, like city lights.
    const econ = o.economy ?? 1;
    if (econ > 0) {
      const gold = this.dot(COL.gold, p);
      for (let ty = y0; ty < y1; ty++) {
        for (let tx = x0; tx < x1; tx++) {
          const i = ty * w.width + tx;
          const m = w.money[i];
          if (m <= 0) continue;
          const X = ox + tx * s;
          const Y = oy + ty * s;
          if (dotMode) {
            const k = goldDots(m);
            const order = (this.orders[i] ??= goldOrder(i));
            ctx.globalAlpha = econ;
            for (let j = 0; j < k; j++) ctx.drawImage(gold, X + (order[j] % DOTS) * p, Y + Math.floor(order[j] / DOTS) * p);
            ctx.globalAlpha = 1;
          } else {
            const a = Math.min(1, Math.max(0.18, (Math.log10(m) - 2) / 4)) * econ;
            ctx.fillStyle = `rgba(${COL.goldRGB}, ${a})`;
            const inset = s * (0.5 - 0.42 * Math.min(1, a + 0.2));
            ctx.fillRect(X + inset, Y + inset, s - 2 * inset, s - 2 * inset);
          }
        }
      }
    }

    const shown = o.botsShown ?? w.bots.length;
    const night = isNight(w.tick) && shown >= w.bots.length;
    if (night) {
      ctx.fillStyle = "rgba(43, 36, 23, 0.17)";
      ctx.fillRect(0, 0, W, H);
    }

    // Bots.
    const inArea = (bx: number, by: number) =>
      o.area != null && bx >= Math.min(o.area.x0, o.area.x1) - 1 && bx <= Math.max(o.area.x0, o.area.x1) && by >= Math.min(o.area.y0, o.area.y1) - 1 && by <= Math.max(o.area.y0, o.area.y1);
    for (const bot of w.bots) {
      if (bot.id >= shown) continue;
      if (bot.x < x0 - 1 || bot.x > x1 || bot.y < y0 - 1 || bot.y > y1) continue;
      const X = ox + bot.x * s;
      const Y = oy + bot.y * s;
      const body =
        bot.state === "faint" ? COL.faint : bot.state === "asleep" ? COL.asleep : bot.state === "working" ? COL.working : COL.body;
      if (night && bot.birth.electricity) {
        ctx.fillStyle = COL.lamp;
        ctx.beginPath();
        ctx.arc(X + s / 2, Y + s / 2, Math.max(s * 0.8, 6), 0, Math.PI * 2);
        ctx.fill();
      }
      if (dotMode) {
        const bodyDot = this.dot(body, p);
        const eyeDot = bot.wake ? this.dot(bot.wake === "need" ? COL.need : COL.plenty, p) : bodyDot;
        const sp = this.sprites[bot.id];
        for (let r = 0; r < DOTS; r++) {
          for (let c = 0; c < DOTS; c++) {
            if (!sp[r * DOTS + c]) continue;
            const eye = EYES.some(([er, ec]) => er === r && ec === c);
            ctx.drawImage(eye ? eyeDot : bodyDot, X + c * p, Y + r * p);
          }
        }
      } else {
        const r = Math.max(3, s * 0.3);
        if (bot.wake) {
          ctx.strokeStyle = bot.wake === "need" ? COL.need : COL.plenty;
          ctx.lineWidth = Math.max(2, s * 0.1);
          ctx.beginPath();
          ctx.arc(X + s / 2, Y + s / 2, r + Math.max(2, s * 0.14), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = body;
        ctx.fillRect(X + s / 2 - r, Y + s / 2 - r, r * 2, r * 2);
      }
      if (inArea(bot.x, bot.y)) brackets(ctx, X - 2, Y - 2, s + 4, s + 4, COL.select, Math.max(2, s / 12));
    }

    for (const id of [o.selectedId, o.followId]) {
      if (id == null) continue;
      const bot = w.bots[id];
      brackets(ctx, ox + bot.x * s - s * 0.25, oy + bot.y * s - s * 0.25, s * 1.5, s * 1.5, COL.select, Math.max(2.5, s / 10));
    }

    for (const r of [o.area, o.dragging]) {
      if (!r) continue;
      const a = toScreen(cam, Math.min(r.x0, r.x1), Math.min(r.y0, r.y1));
      const z = toScreen(cam, Math.max(r.x0, r.x1), Math.max(r.y0, r.y1));
      ctx.fillStyle = "rgba(196, 70, 47, 0.08)";
      ctx.fillRect(a.px, a.py, z.px - a.px, z.py - a.py);
      ctx.strokeStyle = COL.select;
      ctx.lineWidth = 3;
      ctx.setLineDash(r === o.dragging ? [10, 6] : []);
      ctx.strokeRect(a.px, a.py, z.px - a.px, z.py - a.py);
      ctx.setLineDash([]);
      brackets(ctx, a.px - 6, a.py - 6, z.px - a.px + 12, z.py - a.py + 12, COL.select, 5);
    }
  }

  /** The whole map, one pixel per tile, for the minimap. */
  drawMini(ctx: CanvasRenderingContext2D, w: World, cam: Camera) {
    this.prepare(w);
    const img = ctx.createImageData(w.width, w.height);
    const pal = w.geo.palette;
    for (let i = 0; i < w.geo.terrain.length; i++) {
      let hex = w.geo.terrain[i] === 0 ? pal.terrain[0] : pal.terrain[w.geo.terrain[i]];
      if (w.money[i] > 0 && w.geo.terrain[i] !== 0) hex = Math.log10(w.money[i]) > 3.5 ? COL.gold : mix(hex, COL.gold, 0.45);
      const n = parseInt(hex.slice(1), 16);
      img.data.set([n >> 16, (n >> 8) & 255, n & 255, 255], i * 4);
    }
    for (const b of w.bots) {
      const i = (b.y * w.width + b.x) * 4;
      img.data.set(b.wake === "need" ? [58, 110, 165, 255] : b.state === "faint" ? [169, 157, 142, 255] : [43, 36, 23, 255], i);
    }
    ctx.putImageData(img, 0, 0);
    const vw = BUFFER.width / cam.s;
    const vh = BUFFER.height / cam.s;
    if (vw < w.width - 0.5 || vh < w.height - 0.5) {
      ctx.strokeStyle = COL.select;
      ctx.lineWidth = 1;
      ctx.strokeRect(cam.cx - vw / 2 + 0.5, cam.cy - vh / 2 + 0.5, vw - 1, vh - 1);
    }
  }

  dot(color: string, p: number): HTMLCanvasElement {
    const q = Math.max(1, Math.round(p * 4) / 4);
    const key = `${color}|${q}`;
    let c = this.dots.get(key);
    if (!c) {
      c = document.createElement("canvas");
      c.width = c.height = Math.ceil(q);
      const x = c.getContext("2d")!;
      x.fillStyle = color;
      x.beginPath();
      x.arc(q / 2, q / 2, q * 0.4, 0, Math.PI * 2);
      x.fill();
      this.dots.set(key, c);
    }
    return c;
  }
}

/** RTS-style corner brackets. */
function brackets(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, lw: number) {
  const l = Math.max(6, Math.min(w, h) * 0.28);
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x, y + l);
  ctx.lineTo(x, y);
  ctx.lineTo(x + l, y);
  ctx.moveTo(x + w - l, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + l);
  ctx.moveTo(x + w, y + h - l);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w - l, y + h);
  ctx.moveTo(x + l, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + h - l);
  ctx.stroke();
}

function nearLand(w: World, tx: number, ty: number) {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const x = tx + dx;
      const y = ty + dy;
      if (x >= 0 && y >= 0 && x < w.width && y < w.height && w.geo.terrain[y * w.width + x] !== 0) return true;
    }
  return false;
}

function hash(n: number) {
  let t = (n * 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A little pixel grain: each tile a shade lighter or darker, so the map reads as hand-placed pixels. */
function grain(hex: string, i: number) {
  const n = parseInt(hex.slice(1), 16);
  const d = Math.round((hash(i) - 0.5) * 14);
  const f = (v: number) => Math.max(0, Math.min(255, v + d));
  return `#${[f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `#${[ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
