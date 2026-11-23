// List every English string the page can show, so each one can be translated.
// Usage: node scripts/i18n-keys.ts   (prints JSON array of keys)

import { readFileSync, readdirSync } from "node:fs";
import { DEFS } from "../src/engine/cards.ts";
import { EXPERIMENTS } from "../src/engine/impact.ts";
import { EARTH } from "../src/engine/earth.ts";
import { TERRAIN_NAMES } from "../src/engine/planet.ts";

export function i18nKeys(): string[] {
  const keys = new Set<string>();
  const files = ["src/ui", "src/engine"].flatMap((d) => readdirSync(d).map((f) => `${d}/${f}`)).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    // t("…"), tr("…"), announce(t("…")) and multi-line t(\n "…"
    for (const m of src.matchAll(/\b(?:t|tr)\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(JSON.parse(`"${m[1]}"`));
    // ternaries inside t(cond ? "…" : "…")
    for (const m of src.matchAll(/\b(?:t|tr)\(\s*[^"()]*\?\s*"((?:[^"\\]|\\.)*)"\s*:\s*[^"]*?"((?:[^"\\]|\\.)*)"(?:\s*:\s*"((?:[^"\\]|\\.)*)")?/g))
      for (const g of [m[1], m[2], m[3]]) if (g) keys.add(JSON.parse(`"${g}"`));
    // labels translated inside components: <Row k="…"> and <Bars label="…">
    for (const m of src.matchAll(/\b(?:k|label)="([^"]+)"/g)) keys.add(m[1]);
    // engine templates: log(w, kind, "…"), done("…"), no("…")
    for (const m of src.matchAll(/\b(?:log\(w, "[a-z-]+",|done\(|no\()\s*\n?\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(JSON.parse(`"${m[1]}"`));
  }
  for (const d of Object.values(DEFS)) [d.title, d.flavor, d.text].forEach((k) => keys.add(k));
  for (const e of EXPERIMENTS) [e.label, e.question].forEach((k) => keys.add(k));
  for (const l of EARTH.lands) keys.add(l.short);
  for (const k of TERRAIN_NAMES) keys.add(k);
  const dynamic = [
    "working", "starving", "asleep", "looking for work",
    "small area", "wide area", "vast area", "small", "wide", "vast",
    "need switch flipped", "plenty switch flipped",
    "Richest", "Hungriest", "Born with least", "Born with most", "Latest switch",
    "Observer", "God", "King", "Human",
    "Hands off. Just see.", "Weather, harvests, the sky's gold.", "One nation's laws and treasury.", "One ordinary life. One draw.",
    "Follow the live channels and the director. Nothing you do changes the world.",
    "Bring harvests and droughts, floods and seasons of plenty, or call down the sky's gold early.",
    "Rule one nation: schools, electricity, accounts, taxes, trade routes, aid and sanctions.",
    "Draw a birth certificate, once, with no redraw. Then live it, with a few choices at the crossroads.",
    "richer than {p}% of families there", "poorer than {p}% of families there",
    "Everyone", "Went hungry",
    "It had electricity and was online.", "It had electricity, but was never online.",
    "It was online, but had no electricity: its nights were dark.", "It had no electricity and was never online: its nights were dark.",
    "Born in {nation}.", "First wage: {amount} metashi.",
    "A toy model built to make the birth lottery felt, not a forecast. Effects are differences between paired worlds with the same seeds, inside this model only.",
  ];
  dynamic.forEach((k) => keys.add(k));
  keys.delete("");
  return [...keys].sort();
}

if (process.argv[1]?.endsWith("i18n-keys.ts")) console.log(JSON.stringify(i18nKeys(), null, 1));
