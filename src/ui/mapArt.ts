// Paints a planet once, like an old map on a game board: parchment, inked coastlines with ripples,
// terrain drawn as little glyphs, dotted borders, a compass rose and a cartouche with the planet's name.
// Everything is drawn in code from the world's tiles; no images, no model.

import type { World } from "@/engine/world.ts";

/** Art pixels per tile. */
export const ART = 20;
/** Mask pixels per tile (the coastline is smoothed at this resolution, then scaled up). */
const M = 10;

const PAPER = [236, 225, 200];
const LAND = [218, 197, 152];
const INK = [86, 66, 40];

/** Terrain tints mixed into the land: ice, tundra, forest, grass, desert, mountains. */
const TINT: Record<number, number[]> = {
  1: [240, 236, 226],
  2: [212, 204, 176],
  3: [176, 178, 128],
  4: [206, 196, 140],
  5: [230, 206, 150],
  6: [184, 160, 122],
};

function hash(n: number) {
  let t = (n * 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function boxBlur(src: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / n;
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / n;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/** Distance (in mask pixels) from each sea pixel to the nearest land, by a two-pass chamfer transform. */
function seaDistance(land: Uint8Array, w: number, h: number) {
  const INF = 1e6;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = land[i] ? 0 : INF;
  const a = 1;
  const b = Math.SQRT2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + a);
      if (y > 0) v = Math.min(v, d[i - w] + a);
      if (x > 0 && y > 0) v = Math.min(v, d[i - w - 1] + b);
      if (x < w - 1 && y > 0) v = Math.min(v, d[i - w + 1] + b);
      d[i] = v;
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + a);
      if (y < h - 1) v = Math.min(v, d[i + w] + a);
      if (x < w - 1 && y < h - 1) v = Math.min(v, d[i + w + 1] + b);
      if (x > 0 && y < h - 1) v = Math.min(v, d[i + w - 1] + b);
      d[i] = v;
    }
  return d;
}

/** The painted planet, plus a tile of the same bare paper so the sea can run on past the map's edges. */
export type MapArt = { canvas: HTMLCanvasElement; paper: HTMLCanvasElement; landMask: Uint8Array; maskW: number; maskH: number };

/** Words painted on the map (in the reader's language). */
export type ArtCaption = { title: string; sub: string };

export function buildArt(w: World, caption?: ArtCaption): MapArt {
  const geo = w.geo;
  const mw = w.width * M;
  const mh = w.height * M;

  // 1. A smooth land mask: tiles, blurred, thresholded.
  const raw = new Float32Array(mw * mh);
  for (let y = 0; y < mh; y++)
    for (let x = 0; x < mw; x++) raw[y * mw + x] = geo.terrain[Math.floor(y / M) * w.width + Math.floor(x / M)] !== 0 ? 1 : 0;
  const soft = boxBlur(boxBlur(raw, mw, mh, 4), mw, mh, 3);
  const land = new Uint8Array(mw * mh);
  for (let i = 0; i < land.length; i++) land[i] = soft[i] > 0.5 ? 1 : 0;
  const dist = seaDistance(land, mw, mh);

  // 2. Paint the mask-resolution layer pixel by pixel: paper, ripples, land, coast.
  const small = document.createElement("canvas");
  small.width = mw;
  small.height = mh;
  const sctx = small.getContext("2d")!;
  const img = sctx.createImageData(mw, mh);
  const px = img.data;
  const terrainSoft = new Map<number, Float32Array>();
  for (const t of [1, 2, 3, 4, 5, 6]) {
    const f = new Float32Array(mw * mh);
    for (let i = 0; i < f.length; i++) f[i] = geo.terrain[Math.floor(Math.floor(i / mw) / M) * w.width + Math.floor((i % mw) / M)] === t ? 1 : 0;
    terrainSoft.set(t, boxBlur(f, mw, mh, 5));
  }
  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const i = y * mw + x;
      const n = (hash(i) - 0.5) * 10 + (hash((x >> 3) * 977 + (y >> 3) * 131) - 0.5) * 8;
      let c: number[];
      if (land[i]) {
        // Land: parchment tan, tinted by the terrain around it.
        let r = LAND[0];
        let g = LAND[1];
        let b = LAND[2];
        for (const [t, f] of terrainSoft) {
          const k = f[i] * 0.55;
          if (k <= 0) continue;
          r = r * (1 - k) + TINT[t][0] * k;
          g = g * (1 - k) + TINT[t][1] * k;
          b = b * (1 - k) + TINT[t][2] * k;
        }
        c = [r, g, b];
        const coast =
          (x > 0 && !land[i - 1]) || (x < mw - 1 && !land[i + 1]) || (y > 0 && !land[i - mw]) || (y < mh - 1 && !land[i + mw]);
        if (coast) c = INK;
      } else {
        // Sea: the bare paper, with ink ripples following the coast.
        c = PAPER.slice();
        const d = dist[i];
        const ripple = (at: number, a: number) => (Math.abs(d - at) < 0.6 ? a : 0);
        const k = Math.max(ripple(3.5, 0.42), ripple(8, 0.26), ripple(14, 0.14));
        if (k) c = c.map((v, j) => v * (1 - k) + INK[j] * k);
      }
      px[i * 4] = Math.max(0, Math.min(255, c[0] + n));
      px[i * 4 + 1] = Math.max(0, Math.min(255, c[1] + n));
      px[i * 4 + 2] = Math.max(0, Math.min(255, c[2] + n * 0.8));
      px[i * 4 + 3] = 255;
    }
  }
  sctx.putImageData(img, 0, 0);

  // 3. Scale up softly to full art resolution, then draw ink on top.
  const canvas = document.createElement("canvas");
  canvas.width = w.width * ART;
  canvas.height = w.height * ART;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
  const onLand = (ax: number, ay: number) => land[Math.floor(ay / (ART / M)) * mw + Math.floor(ax / (ART / M))] === 1;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let ty = 0; ty < w.height; ty++) {
    for (let tx = 0; tx < w.width; tx++) {
      const i = ty * w.width + tx;
      const t = geo.terrain[i];
      if (!t) continue;
      const X = tx * ART;
      const Y = ty * ART;
      const r = hash(i * 7 + 3);
      ctx.strokeStyle = `rgba(${INK.join(",")}, 0.75)`;
      ctx.fillStyle = `rgba(${INK.join(",")}, 0.22)`;
      ctx.lineWidth = 1.4;
      if (t === 6 && r < 0.8) {
        // A little inked mountain, shaded on one side.
        const cx = X + ART * (0.3 + hash(i) * 0.4);
        const base = Y + ART * 0.8;
        const hgt = ART * (0.55 + hash(i + 9) * 0.3);
        if (!onLand(cx, base)) continue;
        ctx.beginPath();
        ctx.moveTo(cx - ART * 0.42, base);
        ctx.lineTo(cx, base - hgt);
        ctx.lineTo(cx + ART * 0.42, base);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, base - hgt);
        ctx.lineTo(cx + ART * 0.42, base);
        ctx.lineTo(cx + ART * 0.08, base);
        ctx.closePath();
        ctx.fill();
      } else if (t === 3 && r < 0.75) {
        // Two or three small trees.
        for (let k = 0; k < 2 + Math.floor(hash(i + 5) * 2); k++) {
          const cx = X + ART * (0.2 + hash(i * 3 + k) * 0.6);
          const cy = Y + ART * (0.35 + hash(i * 5 + k) * 0.45);
          if (!onLand(cx, cy + 4)) continue;
          ctx.beginPath();
          ctx.arc(cx, cy, ART * 0.16, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(96, 112, 64, 0.55)";
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx, cy + ART * 0.16);
          ctx.lineTo(cx, cy + ART * 0.3);
          ctx.stroke();
        }
      } else if (t === 5) {
        // Desert stipple.
        ctx.fillStyle = `rgba(${INK.join(",")}, 0.35)`;
        for (let k = 0; k < 6; k++) {
          const dx = X + hash(i * 11 + k) * ART;
          const dy = Y + hash(i * 13 + k) * ART;
          if (onLand(dx, dy)) ctx.fillRect(dx, dy, 1.6, 1.6);
        }
        if (r < 0.25) {
          // A dune line.
          const cx = X + ART * 0.5;
          const cy = Y + ART * 0.6;
          if (onLand(cx, cy)) {
            ctx.beginPath();
            ctx.arc(cx, cy + ART * 0.3, ART * 0.38, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
          }
        }
      } else if (t === 1) {
        // Ice hatching.
        ctx.strokeStyle = `rgba(${INK.join(",")}, 0.3)`;
        for (let k = 0; k < 2; k++) {
          const sx = X + hash(i * 17 + k) * ART * 0.6;
          const sy = Y + ART * (0.3 + k * 0.35);
          if (!onLand(sx, sy)) continue;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + ART * 0.4, sy);
          ctx.stroke();
        }
      } else if (t === 4 && r < 0.2) {
        // A tuft of grass.
        const cx = X + ART * 0.5;
        const cy = Y + ART * 0.65;
        if (!onLand(cx, cy)) continue;
        ctx.strokeStyle = `rgba(${INK.join(",")}, 0.45)`;
        ctx.beginPath();
        ctx.moveTo(cx - 3, cy - 4);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + 3, cy - 4);
        ctx.stroke();
      }
    }
  }

  // 4. Dotted borders between nations.
  ctx.strokeStyle = `rgba(${INK.join(",")}, 0.5)`;
  ctx.lineWidth = 1.6;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  for (let ty = 0; ty < w.height; ty++) {
    for (let tx = 0; tx < w.width; tx++) {
      const i = ty * w.width + tx;
      const c = geo.cells[i];
      if (c < 0) continue;
      if (tx + 1 < w.width && geo.cells[i + 1] >= 0 && geo.cells[i + 1] !== c) {
        ctx.moveTo((tx + 1) * ART, ty * ART);
        ctx.lineTo((tx + 1) * ART, (ty + 1) * ART);
      }
      if (ty + 1 < w.height && geo.cells[i + w.width] >= 0 && geo.cells[i + w.width] !== c) {
        ctx.moveTo(tx * ART, (ty + 1) * ART);
        ctx.lineTo((tx + 1) * ART, (ty + 1) * ART);
      }
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // 5. A compass rose in the emptiest stretch of sea, and a cartouche with the planet's name.
  const spot = emptiestSea(w, land, mw, mh);
  compass(ctx, spot.x * (ART / M), spot.y * (ART / M), ART * 3.2);
  cartouche(ctx, w, land, mw, mh, caption);

  // The edges are aged on the screen, not on the map, so the planet sits in one sea that fills the window.
  return { canvas, paper: paperTile(), landMask: land, maskW: mw, maskH: mh };
}

/** A tile of bare sea paper with the same grain as the map, at the map's resolution. */
function paperTile() {
  const T = 64;
  const small = document.createElement("canvas");
  small.width = small.height = T;
  const sctx = small.getContext("2d")!;
  const img = sctx.createImageData(T, T);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const i = y * T + x;
      const n = (hash(i + 99991) - 0.5) * 10 + (hash((x >> 3) * 977 + (y >> 3) * 131 + 7777) - 0.5) * 8;
      img.data[i * 4] = Math.max(0, Math.min(255, PAPER[0] + n));
      img.data[i * 4 + 1] = Math.max(0, Math.min(255, PAPER[1] + n));
      img.data[i * 4 + 2] = Math.max(0, Math.min(255, PAPER[2] + n * 0.8));
      img.data[i * 4 + 3] = 255;
    }
  sctx.putImageData(img, 0, 0);
  const tile = document.createElement("canvas");
  tile.width = tile.height = T * (ART / M);
  const ctx = tile.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(small, 0, 0, tile.width, tile.height);
  return tile;
}

function emptiestSea(w: World, land: Uint8Array, mw: number, mh: number) {
  let best = { x: mw * 0.1, y: mh * 0.8, score: -1 };
  const r = M * 4;
  for (let y = r; y < mh - r; y += M) {
    for (let x = r; x < mw - r; x += M) {
      let sea = 0;
      for (let dy = -r; dy <= r; dy += 4) for (let dx = -r; dx <= r; dx += 4) sea += land[(y + dy) * mw + x + dx] ? 0 : 1;
      // Keep clear of the corners, where the screen puts its tags, buttons, minimap and the name plaque.
      if (x < mw * 0.18 || x > mw * 0.8 || y < mh * 0.2 || y > mh * 0.82) continue;
      const score = sea * 10 - Math.abs(y - mh * 0.6) * 0.05;
      if (score > best.score) best = { x, y, score };
    }
  }
  return best;
}

function compass(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = `rgba(${INK.join(",")}, 0.8)`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.56, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 8; k++) {
    const long = k % 2 === 0;
    const a = (k * Math.PI) / 4;
    const len = long ? r : r * 0.55;
    const wid = long ? r * 0.12 : r * 0.08;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, -len);
    ctx.lineTo(wid, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fillStyle = k === 0 ? "rgba(196, 70, 47, 0.85)" : `rgba(${INK.join(",")}, 0.85)`;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -len);
    ctx.lineTo(-wid, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fillStyle = "rgba(212, 161, 42, 0.85)";
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = `rgba(${INK.join(",")}, 0.9)`;
  ctx.font = `600 ${Math.round(r * 0.28)}px "Pixelify Sans", serif`;
  ctx.textAlign = "center";
  ctx.fillText("N", 0, -r - r * 0.12);
  ctx.restore();
}

function cartouche(ctx: CanvasRenderingContext2D, w: World, land: Uint8Array, mw: number, mh: number, caption?: ArtCaption) {
  // Bottom-left: the other corners belong to the screen's tags, buttons and minimap.
  void land;
  void mw;
  void mh;
  const W = ART * 30;
  const H = ART * 6;
  const x = ART * 2;
  const y = w.height * ART - H - ART * 1.6;
  ctx.save();
  ctx.fillStyle = "rgba(247, 238, 214, 0.92)";
  ctx.strokeStyle = `rgba(${INK.join(",")}, 0.9)`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x + H * 0.4, y);
  ctx.lineTo(x + W - H * 0.4, y);
  ctx.quadraticCurveTo(x + W, y + H / 2, x + W - H * 0.4, y + H);
  ctx.lineTo(x + H * 0.4, y + H);
  ctx.quadraticCurveTo(x, y + H / 2, x + H * 0.4, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(212, 161, 42, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + H * 0.45, y + 6, W - H * 0.9, H - 12);
  ctx.fillStyle = `rgba(${INK.join(",")}, 0.95)`;
  ctx.textAlign = "center";
  ctx.font = `700 ${Math.round(H * 0.42)}px "Pixelify Sans", serif`;
  ctx.font = `700 ${Math.round(H * 0.42)}px "Pixelify Sans", "Noto Sans SC", serif`;
  ctx.fillText(caption?.title ?? `Planet ${w.geo.name}`, x + W / 2, y + H * 0.52);
  ctx.font = `500 ${Math.round(H * 0.2)}px "IBM Plex Sans", "Noto Sans SC", sans-serif`;
  ctx.fillText(caption?.sub ?? `${w.countries.length} nations · ${w.lands.length} lands · ${w.bots.length} souls`, x + W / 2, y + H * 0.82);
  ctx.restore();
}
