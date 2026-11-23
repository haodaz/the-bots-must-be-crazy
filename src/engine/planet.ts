// Geography: the real Earth, or a new planet each time.
// A planet is only the skin. Its seas, coasts and terrain are new, but its countries are the 217 real ones,
// each given land in proportion to its real area, so the birth lottery underneath stays real.

import { EARTH, type Earth } from "./earth.ts";
import { landNames, nationNames } from "./names.ts";
import { nextFloat, nextInt, type HasRng } from "./rng.ts";

export const TERRAIN = { SEA: 0, ICE: 1, TUNDRA: 2, FOREST: 3, GRASS: 4, DESERT: 5, MOUNTAIN: 6 } as const;
export const TERRAIN_NAMES = ["sea", "ice", "tundra", "forest", "grassland", "desert", "mountains"];

export type Palette = {
  name: string;
  /** Indexed by terrain. */
  terrain: string[];
  seaDeep: string;
  border: string;
};

export type Geography = {
  kind: "earth" | "planet";
  name: string;
  width: number;
  height: number;
  /** Country index per tile (into EARTH.countries); −1 sea, −2 land with no country. */
  cells: number[];
  terrain: number[];
  /** Capital tile per country index, or −1 if the country has no land here. */
  capitals: number[];
  palette: Palette;
  /** What the nations and lands are called in this world (made up on a planet). */
  nationNames: string[];
  landNames: string[];
};

export const WIDTH = 160;
export const HEIGHT = 60;

/** Light palettes only: a planet changes colour, but the page keeps one light tone. */
export const PALETTES: Palette[] = [
  {
    name: "Parchment",
    terrain: ["#cfdcd8", "#f4f1ea", "#dcd6c4", "#a9bb94", "#cdd3a4", "#e8d4a6", "#b9a68d"],
    seaDeep: "#bfd0cc",
    border: "rgba(43,36,23,0.38)",
  },
  {
    name: "Lilac",
    terrain: ["#d8d6e8", "#f7f2ef", "#e4d7d3", "#b3b99a", "#d9d2ad", "#efcfaf", "#bfa79c"],
    seaDeep: "#c9c6de",
    border: "rgba(60,40,60,0.36)",
  },
  {
    name: "Mint",
    terrain: ["#cfe3dc", "#f5f3ec", "#dfdccb", "#9fbf9c", "#d4dcae", "#ecd3b4", "#ad9f8f"],
    seaDeep: "#bcd7cd",
    border: "rgba(30,50,40,0.36)",
  },
  {
    name: "Dusk",
    terrain: ["#d3dbe6", "#f6f1ec", "#e3d6cf", "#b4a991", "#dccaa3", "#efc7a2", "#b7998c"],
    seaDeep: "#c2cddc",
    border: "rgba(55,40,35,0.38)",
  },
  {
    name: "Sage",
    terrain: ["#d5ddd0", "#f4f2ea", "#ddd8c7", "#a2ae8c", "#cfcf9f", "#e5cfa0", "#a99c86"],
    seaDeep: "#c4cfbe",
    border: "rgba(45,45,30,0.38)",
  },
];

const idx = (x: number, y: number) => y * WIDTH + x;
const N4: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function neighbours(i: number): number[] {
  const x = i % WIDTH;
  const y = Math.floor(i / WIDTH);
  const out: number[] = [];
  for (const [dx, dy] of N4) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < WIDTH && ny < HEIGHT) out.push(idx(nx, ny));
  }
  return out;
}

const dist2 = (a: number, b: number) => ((a % WIDTH) - (b % WIDTH)) ** 2 + (Math.floor(a / WIDTH) - Math.floor(b / WIDTH)) ** 2;

/** Smooth value noise: a coarse random grid, eased between its points. */
function noiseLayer(s: HasRng, cellsX: number, cellsY: number) {
  const g = Array.from({ length: (cellsX + 1) * (cellsY + 1) }, () => nextFloat(s));
  const at = (gx: number, gy: number) => g[gy * (cellsX + 1) + gx];
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const fx = (x / WIDTH) * cellsX;
    const fy = (y / HEIGHT) * cellsY;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = sm(fx - x0);
    const ty = sm(fy - y0);
    const a = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const b = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return a * (1 - ty) + b * ty;
  };
}

function fractal(s: HasRng) {
  const layers = [
    [noiseLayer(s, 4, 2), 1],
    [noiseLayer(s, 8, 4), 0.5],
    [noiseLayer(s, 16, 6), 0.25],
    [noiseLayer(s, 32, 12), 0.12],
  ] as const;
  return (x: number, y: number) => layers.reduce((a, [f, amp]) => a + f(x, y) * amp, 0);
}

/** Connected groups of tiles for which `pred` holds. */
function components(pred: (i: number) => boolean): number[][] {
  const seen = new Uint8Array(WIDTH * HEIGHT);
  const out: number[][] = [];
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    if (seen[i] || !pred(i)) continue;
    const comp: number[] = [];
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const t = stack.pop()!;
      comp.push(t);
      for (const n of neighbours(t)) if (!seen[n] && pred(n)) (seen[n] = 1), stack.push(n);
    }
    out.push(comp);
  }
  return out;
}

/** Terrain from latitude, height and moisture: ice at the poles, deserts in the subtropics, forests where it is wet. */
function terrainFor(s: HasRng, land: boolean[], elevation: (i: number) => number): number[] {
  const moist = fractal(s);
  const landElev = land.map((l, i) => (l ? elevation(i) : -Infinity)).filter((v) => v > -Infinity).sort((a, b) => a - b);
  const mountainAt = landElev[Math.floor(landElev.length * 0.88)] ?? Infinity;
  return land.map((l, i) => {
    if (!l) return TERRAIN.SEA;
    const x = i % WIDTH;
    const y = Math.floor(i / WIDTH);
    const lat = Math.abs(y + 0.5 - HEIGHT / 2) / (HEIGHT / 2);
    const m = moist(x, y) / 1.87;
    if (lat > 0.88) return TERRAIN.ICE;
    if (elevation(i) >= mountainAt) return TERRAIN.MOUNTAIN;
    if (lat > 0.72) return TERRAIN.TUNDRA;
    if ((Math.abs(lat - 0.33) < 0.14 && m < 0.5) || m < 0.3) return TERRAIN.DESERT;
    if (m > 0.58 || lat < 0.12) return TERRAIN.FOREST;
    return TERRAIN.GRASS;
  });
}

/** Grow regions from seed tiles over allowed tiles, each up to its target size, then hand out leftovers to the nearest. */
function grow(tiles: number[], seeds: number[], targets: number[], s: HasRng): Map<number, number> {
  const allowed = new Set(tiles);
  const owner = new Map<number, number>();
  const size = seeds.map(() => 1);
  const fronts = seeds.map((t, k) => {
    owner.set(t, k);
    return [t];
  });
  let active = true;
  while (active) {
    active = false;
    for (let k = 0; k < seeds.length; k++) {
      if (size[k] >= targets[k] || !fronts[k].length) continue;
      active = true;
      const pick = nextInt(s, 0, fronts[k].length - 1);
      const t = fronts[k][pick];
      const free = neighbours(t).filter((n) => allowed.has(n) && !owner.has(n));
      if (!free.length) {
        fronts[k].splice(pick, 1);
        continue;
      }
      const n = free[nextInt(s, 0, free.length - 1)];
      owner.set(n, k);
      size[k]++;
      fronts[k].push(n);
    }
  }
  // Whatever is left (islands, corners) goes to the nearest owned tile's owner.
  const owned = [...owner.keys()];
  for (const t of tiles) {
    if (owner.has(t)) continue;
    let best = owned[0];
    let bestD = Infinity;
    for (const o of owned) {
      const d = dist2(t, o);
      if (d < bestD) [best, bestD] = [o, d];
    }
    owner.set(t, owner.get(best)!);
  }
  return owner;
}

/** Seeds spread out over the given tiles: each new seed is the farthest of a few random candidates. */
function spreadSeeds(tiles: number[], n: number, s: HasRng): number[] {
  const seeds = [tiles[nextInt(s, 0, tiles.length - 1)]];
  const taken = new Set(seeds);
  while (seeds.length < Math.min(n, tiles.length)) {
    let best = -1;
    let bestD = -1;
    for (let k = 0; k < 24; k++) {
      const c = tiles[nextInt(s, 0, tiles.length - 1)];
      if (taken.has(c)) continue;
      const d = Math.min(...seeds.map((q) => dist2(c, q)));
      if (d > bestD) [best, bestD] = [c, d];
    }
    if (best < 0) best = tiles.find((t) => !taken.has(t))!;
    seeds.push(best);
    taken.add(best);
  }
  return seeds;
}

/** A new planet: Earth-like share of land, a few big continents, Earth-like terrain, and the real countries on it. */
export function generatePlanet(seed: number, earth: Earth = EARTH): Geography {
  const s: HasRng = { rng: (seed * 2654435761) ^ 0x5f3759df };
  const elev = fractal(s);
  const values = Array.from({ length: WIDTH * HEIGHT }, (_, i) => {
    const x = i % WIDTH;
    const y = Math.floor(i / WIDTH);
    const edge = Math.min(x, WIDTH - 1 - x, y, HEIGHT - 1 - y);
    return elev(x, y) - (edge < 3 ? (3 - edge) * 0.12 : 0);
  });
  // Earth's share of land in the same latitude band is about 31%.
  const sorted = [...values].sort((a, b) => b - a);
  const sea = sorted[Math.floor(values.length * 0.31)];
  let land = values.map((v) => v > sea);

  // No dust: drop tiny islands, fill tiny lakes.
  for (const comp of components((i) => land[i])) if (comp.length < 8) for (const t of comp) land[t] = false;
  for (const comp of components((i) => !land[i])) if (comp.length < 10) for (const t of comp) land[t] = true;
  land = [...land];

  const terrain = terrainFor(s, land, (i) => values[i]);
  const landTiles = land.map((l, i) => (l ? i : -1)).filter((i) => i >= 0);

  // Seven regions, as big as the real ones are (by land area).
  const regionTargets = earth.lands.map((l) => Math.max(10, Math.round(landTiles.length * l.landShare)));
  // Shuffle which land grows from which seed (Fisher–Yates: the same on every JavaScript engine).
  const order = earth.lands.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = nextInt(s, 0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const regionSeeds = spreadSeeds(landTiles, order.length, s);
  const regionOwner = grow(
    landTiles,
    regionSeeds,
    order.map((r) => regionTargets[r]),
    s,
  );
  // A region boxed in on a small island borrows land from the neighbour with the most to spare.
  const members = order.map((r) => earth.countries.filter((c) => c.region === earth.lands[r].name).length);
  const need = members.map((m) => Math.max(10, m * 4));
  const sizeOf = () => {
    const n = order.map(() => 0);
    for (const t of landTiles) n[regionOwner.get(t)!]++;
    return n;
  };
  let sizes = sizeOf();
  for (let k = 0; k < order.length; k++) {
    let guard = 0;
    while (sizes[k] < need[k] && guard++ < 2000) {
      const surplus = (r: number) => sizes[r] - need[r];
      let best = -1;
      for (const t of landTiles) {
        const o = regionOwner.get(t)!;
        if (o === k || surplus(o) <= 0) continue;
        if (!neighbours(t).some((n) => regionOwner.get(n) === k)) continue;
        if (best < 0 || surplus(o) > surplus(regionOwner.get(best)!)) best = t;
      }
      if (best < 0) {
        // No neighbour at all: start an outpost inside the region with the most to spare.
        const donor = sizes.indexOf(Math.max(...sizes));
        best = landTiles.find((t) => regionOwner.get(t) === donor)!;
      }
      regionOwner.set(best, k);
      sizes = sizeOf();
    }
  }

  // Countries inside each region, sized by real land area (at least one tile each).
  const cells = new Array(WIDTH * HEIGHT).fill(-1);
  const capitals = new Array(earth.countries.length).fill(-1);
  earth.lands.forEach((landInfo, r) => {
    const k = order.indexOf(r);
    const tiles = landTiles.filter((t) => regionOwner.get(t) === k);
    const members = earth.countries.map((c, i) => ({ c, i })).filter(({ c }) => c.region === landInfo.name);
    if (!tiles.length || !members.length) return;
    const areaSum = members.reduce((a, m) => a + Math.max(1, m.c.landKm2), 0);
    const seeds = spreadSeeds(tiles, members.length, s);
    const targets = members.map((m) => Math.max(1, Math.round((tiles.length * Math.max(1, m.c.landKm2)) / areaSum)));
    const owner = grow(tiles, seeds, targets, s);
    for (const t of tiles) cells[t] = members[owner.get(t)!].i;
    members.forEach((m, j) => {
      if (j < seeds.length) capitals[m.i] = seeds[j];
    });
    // A crowded region may run out of room: a country left with no land takes a tile from the biggest one.
    for (const m of members) {
      if (tiles.some((t) => cells[t] === m.i)) continue;
      const sizes = new Map<number, number>();
      for (const t of tiles) sizes.set(cells[t], (sizes.get(cells[t]) ?? 0) + 1);
      const biggest = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const give = tiles.find((t) => cells[t] === biggest && capitals[biggest] !== t)!;
      cells[give] = m.i;
      capitals[m.i] = give;
    }
  });
  // A country that got no seed (more countries than tiles) shares its neighbour's capital tile.
  earth.countries.forEach((c, i) => {
    if (capitals[i] >= 0) return;
    const peer = earth.countries.findIndex((p, j) => p.region === c.region && capitals[j] >= 0);
    capitals[i] = peer >= 0 ? capitals[peer] : landTiles[0];
  });

  return {
    kind: "planet",
    name: planetName(s),
    nationNames: nationNames(s, earth.countries.length),
    landNames: landNames(s, earth.lands.length),
    width: WIDTH,
    height: HEIGHT,
    cells,
    terrain,
    capitals,
    palette: PALETTES[nextInt(s, 0, PALETTES.length - 1)],
  };
}

/** The real Earth, from Natural Earth borders, with terrain sketched from real geography. */
export function earthGeography(earth: Earth = EARTH): Geography {
  const m = earth.map;
  const terrain = m.cells.map((c, i) => {
    if (c === -1) return TERRAIN.SEA;
    const lon = -180 + ((i % m.width) + 0.5) * m.step;
    const lat = m.lat0 - (Math.floor(i / m.width) + 0.5) * m.step;
    return earthTerrain(lat, lon, i);
  });
  return {
    kind: "earth",
    name: "Earth",
    nationNames: earth.countries.map((c) => c.name),
    landNames: earth.lands.map((l) => l.short),
    width: m.width,
    height: m.height,
    cells: [...m.cells],
    terrain,
    capitals: [...m.capitals],
    palette: PALETTES[0],
  };
}

type Box = [latMin: number, latMax: number, lonMin: number, lonMax: number];
const inBox = (lat: number, lon: number, [a, b, c, d]: Box) => lat >= a && lat <= b && lon >= c && lon <= d;

/** Rough boxes around the world's great deserts, mountains and ice; enough for a pixel map, not for a survey. */
const EARTH_ICE: Box[] = [[60, 84, -60, -18]];
const EARTH_MOUNTAINS: Box[] = [
  [27, 39, 70, 102], // Himalaya and Tibet
  [-45, 5, -78, -66], // Andes
  [35, 58, -125, -105], // Rockies
  [44, 48, 5, 16], // Alps
];
const EARTH_DESERTS: Box[] = [
  [15, 33, -17, 35], // Sahara
  [13, 33, 35, 60], // Arabia
  [25, 37, 52, 66], // Iran and Afghanistan
  [24, 30, 68, 75], // Thar
  [36, 48, 58, 115], // Central Asia, Taklamakan, Gobi
  [-30, -17, 12, 26], // Namib and Kalahari
  [-32, -19, 116, 142], // Australian interior
  [-30, -16, -72, -67], // Atacama
  [29, 38, -118, -103], // North American southwest
  [-3, 11, 38, 51], // Horn of Africa
];

function earthTerrain(lat: number, lon: number, i: number): number {
  if (EARTH_ICE.some((b) => inBox(lat, lon, b)) || lat < -55) return TERRAIN.ICE;
  if (EARTH_MOUNTAINS.some((b) => inBox(lat, lon, b))) return TERRAIN.MOUNTAIN;
  if (lat > 66) return TERRAIN.TUNDRA;
  if (EARTH_DESERTS.some((b) => inBox(lat, lon, b))) return TERRAIN.DESERT;
  if (Math.abs(lat) < 10 || (lat > 50 && lat <= 66)) return TERRAIN.FOREST;
  // Elsewhere, a mix of grassland and forest.
  return ((i * 2654435761) >>> 0) % 5 < 3 ? TERRAIN.GRASS : TERRAIN.FOREST;
}

function planetName(s: HasRng) {
  const a = ["Ka", "Lo", "Mi", "Ra", "Su", "Te", "Vo", "Ne", "Ri", "Sa", "Do", "Ae", "Or", "Il", "Ve", "Ta"];
  const b = ["ra", "lis", "mon", "thea", "dor", "vin", "sa", "ren", "la", "nox", "mira", "tal"];
  return `${a[nextInt(s, 0, a.length - 1)]}${b[nextInt(s, 0, b.length - 1)]}-${nextInt(s, 2, 99)}`;
}
