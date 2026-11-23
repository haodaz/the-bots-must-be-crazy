// Fetch the real-world numbers behind the birth lottery from the World Bank (CC BY 4.0).
// Usage: node scripts/fetch-world-data.ts   → writes data/world/countries.json
// No model is called; this is plain public data.

import { mkdirSync, writeFileSync } from "node:fs";

const API = "https://api.worldbank.org/v2";

const INDICATORS = {
  population: "SP.POP.TOTL",
  birthRate: "SP.DYN.CBRT.IN", // births per 1,000 people
  gdpPerCapitaPpp: "NY.GDP.PCAP.PP.CD",
  gdpPpp: "NY.GDP.MKTP.PP.CD",
  schoolYears: "HD.HCI.EYRS", // expected years of school
  internetPct: "IT.NET.USER.ZS",
  top10Share: "SI.DST.10TH.10", // income share held by the richest 10%
  landKm2: "AG.LND.TOTL.K2",
  electricityPct: "EG.ELC.ACCS.ZS", // access to electricity
  accountPct: "FX.OWN.TOTL.ZS", // adults with a bank or mobile-money account
  taxPctGdp: "GC.TAX.TOTL.GD.ZS", // tax revenue, % of GDP
  pppFactor: "PA.NUS.PPP", // PPP conversion factor, local currency per international $
  exchangeRate: "PA.NUS.FCRF", // official exchange rate, local currency per US$
  remittancePctGdp: "BX.TRF.PWKR.DT.GD.ZS", // personal remittances received, % of GDP
} as const;
type Key = keyof typeof INDICATORS;

type Meta = { id: string; iso2Code: string; name: string; region: { id: string; value: string } };

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

async function main() {
  const [, metas] = await json<[unknown, Meta[]]>(`${API}/country?format=json&per_page=400`);
  // Aggregates (World, regions, income groups) have region id "NA".
  const countries = metas.filter((m) => m.region.id !== "NA");

  const values: Record<string, Partial<Record<Key, { value: number; year: number }>>> = {};
  for (const [key, code] of Object.entries(INDICATORS) as [Key, string][]) {
    const [, rows] = await json<[unknown, { countryiso3code: string; date: string; value: number | null }[]]>(
      `${API}/country/all/indicator/${code}?format=json&mrnev=1&per_page=400`,
    );
    for (const r of rows ?? []) {
      if (r.value == null) continue;
      (values[r.countryiso3code] ??= {})[key] = { value: r.value, year: Number(r.date) };
    }
  }

  const rows = countries
    .map((m) => {
      const v = values[m.id] ?? {};
      const births = v.population && v.birthRate ? Math.round((v.population.value * v.birthRate.value) / 1000) : 0;
      return {
        iso3: m.id,
        name: m.name,
        region: m.region.value.trim(),
        births,
        population: v.population?.value ?? null,
        gdpPerCapitaPpp: v.gdpPerCapitaPpp?.value ?? null,
        gdpPpp: v.gdpPpp?.value ?? null,
        schoolYears: v.schoolYears?.value ?? null,
        internetPct: v.internetPct?.value ?? null,
        top10Share: v.top10Share?.value ?? null,
        landKm2: v.landKm2?.value ?? null,
        electricityPct: v.electricityPct?.value ?? null,
        accountPct: v.accountPct?.value ?? null,
        taxPctGdp: v.taxPctGdp?.value ?? null,
        // Price level: what a dollar's worth of living costs here, relative to the US (1 = US prices).
        priceLevel: v.pppFactor && v.exchangeRate ? v.pppFactor.value / v.exchangeRate.value : null,
        remittancePctGdp: v.remittancePctGdp?.value ?? null,
        years: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x!.year])),
      };
    })
    .filter((r) => r.births > 0)
    .sort((a, b) => b.births - a.births);

  mkdirSync("data/world", { recursive: true });
  writeFileSync(
    "data/world/countries.json",
    JSON.stringify(
      {
        source: "World Bank Open Data (https://data.worldbank.org), CC BY 4.0",
        indicators: INDICATORS,
        note: "Most recent non-empty value per country (mrnev=1). births = population × crude birth rate / 1000. priceLevel = PPP conversion factor / official exchange rate. Missing values are filled from the regional median at load time.",
        fetched: new Date().toISOString().slice(0, 10),
        countries: rows,
      },
      null,
      1,
    ),
  );
  const total = rows.reduce((a, r) => a + r.births, 0);
  console.log(`${rows.length} countries, ${(total / 1e6).toFixed(1)}M births a year`);
  for (const r of rows.slice(0, 8)) console.log(`  ${r.name}: ${((r.births / total) * 100).toFixed(1)}%`);
}

main();
