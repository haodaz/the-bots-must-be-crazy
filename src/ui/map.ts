// The board. The planet is painted once (mapArt.ts); every frame adds what moves on it:
// the economy glowing like lamplight, the bots as little game pieces, night, and selections.
// Zoom in far enough and each piece becomes a token showing the bot's own dot-matrix body.

import { isNight } from "@/engine/laws.ts";
import type { World } from "@/engine/world.ts";
import { ART, buildArt, type ArtCaption, type MapArt } from "./mapArt.ts";
import { H as AH, W as AW, avatarCanvas } from "./avatar.ts";

export const COL = {
  gold: "#d4a12a",
  goldRGB: "212, 161, 42",
  ink: "#56422a",
  body: "#6b5536",
  working: "#2b2417",
  faint: "#a99d8e",
  asleep: "#8d8576",
  need: "#3a6ea5",
  plenty: "#e0a91f",
  select: "#c4462f",
  lamp: "rgba(240, 200, 90, 0.45)",
  paper: "#ece1c8",
};

/** Buffer size of the main canvas, in device pixels. Follows the window: the board fills the screen. */
export const BUFFER = { width: 2400, height: 1350 };
/** Above this many device pixels per tile, pieces open into tokens with the bot's body. */
export const DOT_ZOOM = 26;

export type Camera = { cx: number; cy: number; s: number };
export type Rect = { x0: number; y0: number; x1: number; y1: number };

export type DrawOptions = {
  selectedId?: number | null;
  followId?: number | null;
  area?: Rect | null;
  dragging?: Rect | null;
  highlightCountry?: number | null;
  /** Opening: 0..1 how far the map has been painted in. */
  landReveal?: number;
  /** Opening: 0..1 visibility of the economy. */
  economy?: number;
  /** Opening: how many bots are born so far. */
  botsShown?: number;
  /** Unused now that borders are painted into the map; kept for the opening's timing. */
  borders?: number;
  /** A card being aimed: the circle it would cover. */
  aim?: { x: number; y: number; r: number; color: string } | null;
  /** The player's own bot (Human role): marked with a gold star. */
  meId?: number | null;
};

/** The whole planet in view; the paper around it holds the top bar and the card tray. */
export function fitCamera(w: World): Camera {
  return { cx: w.width / 2, cy: w.height / 2, s: Math.min(BUFFER.width / w.width, BUFFER.height / w.height) * 0.96 };
}

export function clampCamera(w: World, c: Camera): Camera {
  const minS = Math.min(BUFFER.width / w.width, BUFFER.height / w.height) * 0.96;
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
  private art: MapArt | null = null;
  private artWorld: World | null = null;
  private glow: HTMLCanvasElement | null = null;
  private dots = new Map<string, HTMLCanvasElement>();

  private captionKey = "";
  caption: ArtCaption | undefined;

  /** Paint the planet once per world (and again if the words on it change language). */
  prepare(w: World) {
    const key = this.caption ? `${this.caption.title}|${this.caption.sub}` : "";
    if (this.artWorld === w && key === this.captionKey) return;
    this.artWorld = w;
    this.captionKey = key;
    this.art = buildArt(w, this.caption);
  }

  draw(ctx: CanvasRenderingContext2D, w: World, cam: Camera, o: DrawOptions = {}) {
    this.prepare(w);
    const art = this.art!;
    const { s } = cam;
    const W = BUFFER.width;
    const H = BUFFER.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;

    const tl = toWorld(cam, 0, 0);
    const br = toWorld(cam, W, H);
    const ox = W / 2 - cam.cx * s;
    const oy = H / 2 - cam.cy * s;

    // One sea for the whole window: the same paper runs on past the map's edges, fixed to the world as it moves.
    const pattern = ctx.createPattern(art.paper, "repeat");
    if (pattern) {
      pattern.setTransform(new DOMMatrix().translate(ox, oy).scale(s / ART));
      ctx.fillStyle = pattern;
    } else ctx.fillStyle = COL.paper;
    ctx.fillRect(0, 0, W, H);

    // The painted planet.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.globalAlpha = o.landReveal ?? 1;
    ctx.drawImage(art.canvas, tl.x * ART, tl.y * ART, (br.x - tl.x) * ART, (br.y - tl.y) * ART, 0, 0, W, H);
    ctx.globalAlpha = 1;

    const x0 = Math.max(0, Math.floor(tl.x));
    const y0 = Math.max(0, Math.floor(tl.y));
    const x1 = Math.min(w.width, Math.ceil(br.x));
    const y1 = Math.min(w.height, Math.ceil(br.y));

    if (o.highlightCountry != null) {
      ctx.fillStyle = "rgba(196, 70, 47, 0.18)";
      for (const t of w.countries[o.highlightCountry].tiles) {
        const tx = t % w.width;
        const ty = Math.floor(t / w.width);
        if (tx >= x0 && tx < x1 && ty >= y0 && ty < y1) ctx.fillRect(ox + tx * s, oy + ty * s, Math.ceil(s), Math.ceil(s));
      }
    }

    // The economy, glowing like lamplight where money circulates.
    const econ = o.economy ?? 1;
    if (econ > 0) {
      const glow = this.glowSprite();
      for (let ty = y0; ty < y1; ty++) {
        for (let tx = x0; tx < x1; tx++) {
          const m = w.money[ty * w.width + tx];
          if (m <= 0) continue;
          const lv = Math.log10(m);
          const size = s * Math.min(2.4, 0.7 + Math.max(0, lv - 2) * 0.32);
          ctx.globalAlpha = econ * Math.min(0.95, 0.3 + Math.max(0, lv - 2) * 0.16);
          ctx.drawImage(glow, ox + (tx + 0.5) * s - size / 2, oy + (ty + 0.5) * s - size / 2, size, size);
        }
      }
      ctx.globalAlpha = 1;
    }

    const shown = o.botsShown ?? w.bots.length;
    const night = isNight(w.tick) && shown >= w.bots.length;
    if (night) {
      ctx.fillStyle = "rgba(40, 32, 60, 0.2)";
      ctx.fillRect(0, 0, W, H);
    }

    // The pieces.
    const area = o.area ? norm(o.area) : null;
    const tokens = s >= DOT_ZOOM;
    for (const bot of w.bots) {
      if (bot.id >= shown) continue;
      if (bot.x < x0 - 1 || bot.x > x1 || bot.y < y0 - 1 || bot.y > y1) continue;
      const cx = ox + (bot.x + 0.5) * s;
      const cy = oy + (bot.y + 0.5) * s;
      const body =
        bot.state === "faint" ? COL.faint : bot.state === "asleep" ? COL.asleep : bot.state === "working" ? COL.working : COL.body;
      if (night && bot.birth.electricity) {
        ctx.fillStyle = COL.lamp;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(s * 0.9, 9), 0, Math.PI * 2);
        ctx.fill();
      }
      if (tokens) standee(ctx, w.seed, bot, cx, oy + (bot.y + 1) * s, s * 1.7);
      else pawn(ctx, cx, cy, Math.max(7, s * 0.55), body, bot.wake);
      if (area && bot.x >= area.x0 - 0.5 && bot.x <= area.x1 && bot.y >= area.y0 - 0.5 && bot.y <= area.y1) {
        const r = Math.max(9, s * 0.62);
        brackets(ctx, cx - r, cy - r, r * 2, r * 2, COL.select, Math.max(2, s / 14));
      }
    }

    if (o.meId != null) {
      const me = w.bots[o.meId];
      star(ctx, ox + (me.x + 0.5) * s, oy + (me.y + 0.5) * s - Math.max(14, s * 0.9), Math.max(7, s * 0.3));
    }

    if (o.aim) {
      const a = toScreen(cam, o.aim.x, o.aim.y);
      const r = o.aim.r * s;
      ctx.fillStyle = o.aim.color;
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.arc(a.px, a.py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = COL.ink;
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 8]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = COL.gold;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(a.px, a.py, r - 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const id of [o.selectedId, o.followId]) {
      if (id == null) continue;
      const bot = w.bots[id];
      const r = Math.max(14, s * 0.8);
      brackets(ctx, ox + (bot.x + 0.5) * s - r, oy + (bot.y + 0.5) * s - r, r * 2, r * 2, COL.select, Math.max(3, s / 10));
    }

    // Aged edges belong to the window, like an old sheet of paper, not to the map.
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.56);
    g.addColorStop(0, "rgba(120, 90, 50, 0)");
    g.addColorStop(1, "rgba(120, 90, 50, 0.22)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    for (const rect of [o.area, o.dragging]) {
      if (!rect) continue;
      const n = norm(rect);
      const a = toScreen(cam, n.x0, n.y0);
      const z = toScreen(cam, n.x1, n.y1);
      ctx.fillStyle = "rgba(196, 70, 47, 0.08)";
      ctx.fillRect(a.px, a.py, z.px - a.px, z.py - a.py);
      ctx.strokeStyle = COL.select;
      ctx.lineWidth = 3;
      ctx.setLineDash(rect === o.dragging ? [10, 6] : []);
      ctx.strokeRect(a.px, a.py, z.px - a.px, z.py - a.py);
      ctx.setLineDash([]);
      brackets(ctx, a.px - 7, a.py - 7, z.px - a.px + 14, z.py - a.py + 14, COL.select, 5);
    }
  }

  /** The whole board, small, with the camera's view marked. */
  drawMini(ctx: CanvasRenderingContext2D, w: World, cam: Camera) {
    this.prepare(w);
    const c = ctx.canvas;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.art!.canvas, 0, 0, c.width, c.height);
    const k = c.width / w.width;
    for (const b of w.bots) {
      ctx.fillStyle = b.wake === "need" ? COL.need : b.state === "faint" ? COL.faint : COL.working;
      ctx.fillRect(b.x * k, b.y * k, Math.max(2, k), Math.max(2, k));
    }
    const vw = BUFFER.width / cam.s;
    const vh = BUFFER.height / cam.s;
    if (vw < w.width - 0.5 || vh < w.height - 0.5) {
      ctx.strokeStyle = COL.select;
      ctx.lineWidth = 2;
      ctx.strokeRect((cam.cx - vw / 2) * k + 1, (cam.cy - vh / 2) * k + 1, vw * k - 2, vh * k - 2);
    }
  }

  /** A round dot of a colour, at a pitch. */
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

  private glowSprite() {
    if (this.glow) return this.glow;
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d")!;
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 32);
    g.addColorStop(0, "rgba(255, 214, 110, 1)");
    g.addColorStop(0.35, "rgba(226, 170, 50, 0.75)");
    g.addColorStop(1, "rgba(212, 161, 42, 0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    this.glow = c;
    return c;
  }

}

/** Close up: the bot's pixel figure standing on the board, with a shadow at its feet. */
function standee(ctx: CanvasRenderingContext2D, seed: number, bot: World["bots"][number], cx: number, feet: number, h: number) {
  const w = (h * AW) / AH;
  ctx.fillStyle = "rgba(43, 36, 23, 0.28)";
  ctx.beginPath();
  ctx.ellipse(cx, feet - h * 0.06, w * 0.42, h * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  if (bot.wake) {
    ctx.strokeStyle = bot.wake === "need" ? COL.need : COL.plenty;
    ctx.lineWidth = Math.max(2, h * 0.04);
    ctx.beginPath();
    ctx.ellipse(cx, feet - h * 0.06, w * 0.5, h * 0.09, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  const look = bot.state === "faint" ? "faint" : bot.state === "asleep" ? "asleep" : "normal";
  const fig = avatarCanvas(seed, bot.id, bot.birth.familyRank, look, bot.wake);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(fig, cx - w / 2, feet - h * 0.98, w, h);
  ctx.imageSmoothingEnabled = smooth;
}

/** The player's mark: a gold star above their bot. */
function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
  }
  ctx.closePath();
  ctx.fillStyle = COL.plenty;
  ctx.strokeStyle = "#2b2417";
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.fill();
  ctx.stroke();
}

/** Far out: a little game pawn. */
function pawn(ctx: CanvasRenderingContext2D, cx: number, cy: number, h: number, color: string, wake: "need" | "plenty" | null) {
  const head = h * 0.22;
  ctx.fillStyle = "rgba(43, 36, 23, 0.25)";
  ctx.beginPath();
  ctx.ellipse(cx + h * 0.08, cy + h * 0.46, h * 0.32, h * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.strokeStyle = "#f3e7c9";
  ctx.lineWidth = Math.max(1, h * 0.07);
  ctx.beginPath();
  ctx.moveTo(cx - h * 0.3, cy + h * 0.45);
  ctx.quadraticCurveTo(cx - h * 0.26, cy, cx - h * 0.1, cy - h * 0.06);
  ctx.lineTo(cx + h * 0.1, cy - h * 0.06);
  ctx.quadraticCurveTo(cx + h * 0.26, cy, cx + h * 0.3, cy + h * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy - h * 0.2, head, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (wake) {
    ctx.strokeStyle = wake === "need" ? COL.need : COL.plenty;
    ctx.lineWidth = Math.max(2, h * 0.1);
    ctx.beginPath();
    ctx.arc(cx, cy - h * 0.2, head + h * 0.14, 0, Math.PI * 2);
    ctx.stroke();
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

function norm(r: Rect): Rect {
  return { x0: Math.min(r.x0, r.x1), y0: Math.min(r.y0, r.y1), x1: Math.max(r.x0, r.x1), y1: Math.max(r.y0, r.y1) };
}
