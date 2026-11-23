// The real world behind the birth lottery. World Bank Open Data (CC BY 4.0), fetched by scripts/fetch-world-data.ts.
// Countries are grouped into the World Bank's seven regions; each region becomes one land in the world.

import raw from "../../data/world/countries.json" with { type: "json" };
import rawMap from "../../data/world/map.json" with { type: "json" };

export type Country = {
  iso3: string;
  name: string;
  region: string;
  capital: string | null;
  /** Babies born here in a year (population × crude birth rate). */
  births: number;
  gdpPerCapitaPpp: number;
  gdpPpp: number;
  landKm2: number;
  /** Expected years of school. */
  schoolYears: number;
  internetPct: number;
  electricityPct: number;
  /** Adults with a bank or mobile-money account. */
  accountPct: number;
  /** Income share held by the richest 10%. */
  top10Share: number;
  taxPctGdp: number;
  /** Cost of living relative to the US (1 = US prices). */
  priceLevel: number;
  remittancePctGdp: number;
  /** Fields that were missing and filled from the regional median. */
  filled: string[];
};

export type Land = {
  name: string;
  short: string;
  countries: Country[];
  birthsShare: number;
  gdpShare: number;
  landShare: number;
  /** Births-weighted averages across the land's countries. */
  priceLevel: number;
  taxPctGdp: number;
};

/** The pixel world map: one country index per tile (−1 sea, −2 land with no World Bank data). */
export type EarthMap = { source: string; width: number; height: number; step: number; lat0: number; cells: number[]; capitals: number[] };

export type Earth = { source: string; fetched: string; countries: Country[]; lands: Land[]; totalBirths: number; map: EarthMap };

/** West to east, roughly as on a map. */
const LANDS: Array<[string, string]> = [
  ["North America", "North America"],
  ["Latin America & Caribbean", "Latin America"],
  ["Europe & Central Asia", "Europe & Central Asia"],
  ["Sub-Saharan Africa", "Sub-Saharan Africa"],
  ["Middle East, North Africa, Afghanistan & Pakistan", "Middle East & N. Africa"],
  ["South Asia", "South Asia"],
  ["East Asia & Pacific", "East Asia & Pacific"],
];

const FIELDS = [
  "gdpPerCapitaPpp",
  "schoolYears",
  "internetPct",
  "electricityPct",
  "accountPct",
  "top10Share",
  "taxPctGdp",
  "priceLevel",
  "remittancePctGdp",
] as const;

type RawCountry = { iso3: string; name: string; region: string; capital: string | null; births: number; gdpPpp: number | null; landKm2: number | null } & Record<
  (typeof FIELDS)[number],
  number | null
>;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

function build(): Earth {
  const data = raw as unknown as { source: string; fetched: string; countries: RawCountry[] };
  const byRegion = new Map<string, RawCountry[]>();
  for (const c of data.countries) byRegion.set(c.region, [...(byRegion.get(c.region) ?? []), c]);

  const countries: Country[] = data.countries.map((c) => {
    const peers = byRegion.get(c.region) ?? [];
    const filled: string[] = [];
    const get = (k: (typeof FIELDS)[number]) => {
      if (c[k] != null) return c[k] as number;
      filled.push(k);
      return median(peers.map((p) => p[k]).filter((v): v is number => v != null));
    };
    const out = Object.fromEntries(FIELDS.map((k) => [k, get(k)])) as Record<(typeof FIELDS)[number], number>;
    return {
      iso3: c.iso3,
      name: c.name,
      region: c.region,
      capital: c.capital,
      births: c.births,
      gdpPpp: c.gdpPpp ?? 0,
      landKm2: c.landKm2 ?? 0,
      ...out,
      filled,
    };
  });

  const totalBirths = countries.reduce((a, c) => a + c.births, 0);
  const totalGdp = countries.reduce((a, c) => a + c.gdpPpp, 0);
  const totalLand = data.countries.reduce((a, c) => a + (c.landKm2 ?? 0), 0);

  const lands: Land[] = LANDS.map(([name, short]) => {
    const cs = countries.filter((c) => c.region === name);
    const births = cs.reduce((a, c) => a + c.births, 0);
    const avg = (k: "priceLevel" | "taxPctGdp") => cs.reduce((a, c) => a + c[k] * c.births, 0) / births;
    const landKm2 = data.countries.filter((c) => c.region === name).reduce((a, c) => a + (c.landKm2 ?? 0), 0);
    return {
      name,
      short,
      countries: cs,
      birthsShare: births / totalBirths,
      gdpShare: cs.reduce((a, c) => a + c.gdpPpp, 0) / totalGdp,
      landShare: landKm2 / totalLand,
      priceLevel: avg("priceLevel"),
      taxPctGdp: avg("taxPctGdp"),
    };
  });

  const unplaced = countries.filter((c) => !LANDS.some(([n]) => n === c.region));
  if (unplaced.length) throw new Error(`Countries with no land: ${unplaced.map((c) => c.name).join(", ")}`);

  const map = rawMap as unknown as EarthMap & { codes: string[] };
  if (map.codes.some((code, i) => countries[i]?.iso3 !== code)) throw new Error("map.json is out of date: run scripts/build-map.ts");

  return { source: data.source, fetched: data.fetched, countries, lands, totalBirths, map };
}

export const EARTH: Earth = build();

/** Inverse of the standard normal CDF (Acklam's approximation). */
export function invNorm(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q0 = Math.min(Math.max(p, 1e-9), 1 - 1e-9);
  if (q0 < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(q0));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (q0 > 1 - 0.02425) return -invNorm(1 - q0);
  const q = q0 - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * Spread of a log-normal income distribution whose richest 10% hold `top10Share` percent of all income.
 * Top-10% share of a log-normal = 1 − Φ(z₀.₉ − σ), so σ = z₀.₉ − Φ⁻¹(1 − share).
 */
export function sigmaFromTop10(top10Share: number): number {
  const s = Math.min(Math.max(top10Share / 100, 0.11), 0.8);
  return Math.max(0.05, invNorm(0.9) - invNorm(1 - s));
}
