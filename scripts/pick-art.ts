// Two jobs, both free (no model calls):
//   node scripts/pick-art.ts sheet            → data/local/art-sheet-<set>.png, every variant side by side, to choose from
//   node scripts/pick-art.ts keep id=v ...    → shrink the chosen variants into public/art and write src/art/manifest.ts
// Raw images from gen-art.ts live in data/local/art (large, not committed); the game ships the small copies.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { JOBS } from "../src/art/prompts.ts";

const RAW = "data/local/art";
const OUT = "public/art";
const MANIFEST = "src/art/manifest.ts";
const [cmd, ...rest] = process.argv.slice(2);

const variantsOf = (id: string) =>
  readdirSync(RAW)
    .filter((f) => f.startsWith(`${id}-v`) && f.endsWith(".webp"))
    .sort();

if (cmd === "sheet") {
  for (const set of ["card", "role", "back", "intro"] as const) {
    const jobs = JOBS.filter((j) => j.set === set);
    const wide = set === "intro";
    const cw = wide ? 420 : 240;
    const ch = wide ? 240 : 240;
    const label = 22;
    const cols = 2;
    const rowsPerSheet = jobs.length;
    const W = cols * (cw + 8) + 8;
    const H = rowsPerSheet * (ch + label + 8) + 8;
    const parts: Array<{ input: Buffer; left: number; top: number }> = [];
    for (const [r, job] of jobs.entries()) {
      const y = 8 + r * (ch + label + 8);
      parts.push({ input: Buffer.from(`<svg width="${W}" height="${label}"><text x="8" y="16" font-family="Helvetica" font-size="15">${job.id}</text></svg>`), left: 0, top: y });
      for (const [c, f] of variantsOf(job.id).slice(0, cols).entries()) {
        const img = await sharp(`${RAW}/${f}`).resize(cw, ch, { fit: "cover" }).png().toBuffer();
        parts.push({ input: img, left: 8 + c * (cw + 8), top: y + label });
      }
    }
    if (!parts.length) continue;
    await sharp({ create: { width: W, height: H, channels: 3, background: "#efe6d2" } })
      .composite(parts)
      .png()
      .toFile(`data/local/art-sheet-${set}.png`);
    console.log(`data/local/art-sheet-${set}.png`);
  }
} else if (cmd === "keep") {
  mkdirSync(OUT, { recursive: true });
  const picks: Record<string, number> = {};
  if (existsSync(MANIFEST)) {
    for (const m of readFileSync(MANIFEST, "utf8").matchAll(/"([\w-]+)": "\/art\/[\w-]+\.webp", \/\/ v(\d+)/g)) picks[m[1]] = Number(m[2]);
  }
  for (const a of rest) {
    const [id, v] = a.split("=");
    picks[id] = Number(v);
  }
  for (const [id, v] of Object.entries(picks)) {
    const job = JOBS.find((j) => j.id === id);
    if (!job) throw new Error(`No such illustration: ${id}`);
    const src = `${RAW}/${id}-v${v}.webp`;
    if (!existsSync(src)) throw new Error(`Missing ${src}`);
    const width = job.set === "intro" ? 1600 : 640;
    await sharp(src).resize({ width }).webp({ quality: 80 }).toFile(`${OUT}/${id}.webp`);
  }
  const lines = Object.entries(picks)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, v]) => `  "${id}": "/art/${id}.webp", // v${v}`);
  writeFileSync(
    MANIFEST,
    `// Which generated illustration the game uses for each slot: the kept variant, shrunk for the web (scripts/pick-art.ts).
// A slot that is missing here falls back to the card's engraved emblem.

export const ART: Partial<Record<string, string>> = {
${lines.join("\n")}
};
`,
  );
  console.log(`Kept ${Object.keys(picks).length} illustrations.`);
} else {
  console.log("Usage: node scripts/pick-art.ts sheet | keep id=v ...");
}
