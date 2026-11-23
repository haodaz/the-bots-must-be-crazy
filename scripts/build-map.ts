// Turn real country borders into the world's pixel map.
// Borders: Natural Earth 1:110m admin-0 countries (public domain). Capitals: World Bank country metadata.
// Usage: node scripts/build-map.ts   → data/world/map.json

import { readFileSync, writeFileSync } from "node:fs";

const NE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";

/** 2.25° per tile, longitude −180..180, latitude 78..−57 (Antarctica left out). */
const WIDTH = 160;
const HEIGHT = 60;
const STEP = 2.25;
const LAT0 = 78;

/** Natural Earth codes that the World Bank spells differently, or folds into another country. */
const ALIAS: Record<string, string> = { KOS: "XKX", SOL: "SOM", CYN: "CYP", PSX: "PSE" };

/** Capitals the World Bank metadata leaves without coordinates. */
const KNOWN: Record<string, [number, number]> = {
  PSE: [31.9, 35.2],
  CHI: [49.2, -2.1],
  CUW: [12.1, -68.9],
  GIB: [36.14, -5.35],
  SXM: [18.03, -63.05],
  MAF: [18.07, -63.08],
};

type Ring = number[][];
type Feature = {
  properties: { ISO_A3_EH: string; ADM0_A3: string; NAME: string };
  geometry: { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };
};

function inRing(x: number, y: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(x: number, y: number, rings: Ring[]) {
  if (!inRing(x, y, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) if (inRing(x, y, rings[k])) return false;
  return true;
}

async function main() {
  const ne = (await (await fetch(NE_URL)).json()) as { features: Feature[] };
  const wb = JSON.parse(readFileSync("data/world/countries.json", "utf8")) as {
    countries: { iso3: string; name: string; lat: number | null; lon: number | null }[];
  };
  const codes = wb.countries.map((c) => c.iso3);
  const index = new Map(codes.map((c, i) => [c, i]));

  // -1 = sea, -2 = land with no World Bank country (e.g. Taiwan, Western Sahara).
  const cells = new Array(WIDTH * HEIGHT).fill(-1);
  const unmatched = new Set<string>();
  for (const f of ne.features) {
    let code = f.properties.ISO_A3_EH !== "-99" ? f.properties.ISO_A3_EH : f.properties.ADM0_A3;
    code = ALIAS[code] ?? code;
    const ci = index.get(code);
    if (ci == null) unmatched.add(`${f.properties.NAME} (${code})`);
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const rings of polys) {
      const xs = rings[0].map((p) => p[0]);
      const ys = rings[0].map((p) => p[1]);
      const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      for (let ty = 0; ty < HEIGHT; ty++) {
        const lat = LAT0 - (ty + 0.5) * STEP;
        if (lat < minY || lat > maxY) continue;
        for (let tx = 0; tx < WIDTH; tx++) {
          const lon = -180 + (tx + 0.5) * STEP;
          if (lon < minX || lon > maxX) continue;
          if (inPolygon(lon, lat, rings)) cells[ty * WIDTH + tx] = ci ?? -2;
        }
      }
    }
  }

  // Countries too small to cover a tile centre get the tile at their capital (an island, a city state).
  const tileOf = (lat: number, lon: number) => {
    const tx = Math.min(WIDTH - 1, Math.max(0, Math.floor((lon + 180) / STEP)));
    const ty = Math.min(HEIGHT - 1, Math.max(0, Math.floor((LAT0 - lat) / STEP)));
    return ty * WIDTH + tx;
  };
  const counts = new Map<number, number>();
  for (const c of cells) if (c >= 0) counts.set(c, (counts.get(c) ?? 0) + 1);
  const placed: string[] = [];
  const missing: string[] = [];
  for (const c of wb.countries) {
    if ((c.lat == null || c.lon == null) && KNOWN[c.iso3]) [c.lat, c.lon] = KNOWN[c.iso3];
  }
  // Take the capital's tile, unless that would leave another country with no land: then the nearest free spot.
  const free = (t: number) => cells[t] < 0 || (counts.get(cells[t]) ?? 0) > 1;
  wb.countries.forEach((c, i) => {
    if (counts.get(i)) return;
    if (c.lat == null || c.lon == null) return missing.push(c.name);
    const want = tileOf(c.lat, c.lon);
    let t = want;
    if (!free(want)) {
      let bestD = Infinity;
      for (let k = 0; k < cells.length; k++) {
        if (!free(k)) continue;
        const d = Math.hypot((k % WIDTH) - (want % WIDTH), Math.floor(k / WIDTH) - Math.floor(want / WIDTH));
        if (d < bestD) [t, bestD] = [k, d];
      }
    }
    if (cells[t] >= 0) counts.set(cells[t], (counts.get(cells[t]) ?? 1) - 1);
    cells[t] = i;
    counts.set(i, 1);
    placed.push(c.name);
  });

  // Capital tiles, for where the economy concentrates and where babies are most often born.
  const capitals = wb.countries.map((c, i) => {
    if (c.lat == null || c.lon == null) return -1;
    const t = tileOf(c.lat, c.lon);
    if (cells[t] === i) return t;
    // The capital's tile went to a neighbour or the sea: use the country's tile nearest to it.
    let best = -1;
    let bestD = Infinity;
    cells.forEach((v, k) => {
      if (v !== i) return;
      const d = Math.hypot((k % WIDTH) - (t % WIDTH), Math.floor(k / WIDTH) - Math.floor(t / WIDTH));
      if (d < bestD) [best, bestD] = [k, d];
    });
    return best;
  });

  writeFileSync(
    "data/world/map.json",
    JSON.stringify({
      source: "Borders: Natural Earth 1:110m admin-0 countries (public domain). Capitals: World Bank country metadata.",
      width: WIDTH,
      height: HEIGHT,
      step: STEP,
      lat0: LAT0,
      codes,
      capitals,
      cells,
    }),
  );
  console.log(`map ${WIDTH}×${HEIGHT}: ${cells.filter((c) => c >= 0).length} land tiles with a country`);
  console.log(`placed at their capital: ${placed.length} (${placed.slice(0, 12).join(", ")}${placed.length > 12 ? ", …" : ""})`);
  console.log(`no tile at all: ${missing.join(", ") || "none"}`);
  console.log(`Natural Earth countries without World Bank data: ${[...unmatched].join(", ") || "none"}`);
}

main();
