// What we have spent, from the receipt ledger, and the usage trace the submission asks for.
// Usage: node scripts/ledger.ts            (summary)
//        node scripts/ledger.ts --export   (also writes reports/usage-trace.md)

import { mkdirSync, writeFileSync } from "node:fs";
import { capUsd, readLedger } from "../src/server/budget.ts";

const all = readLedger();
const live = all.filter((r) => r.mode === "live");
const spent = live.reduce((a, r) => a + r.costUsd, 0);
const by = new Map<string, { calls: number; cost: number; input: number; cached: number; output: number; images: number }>();
for (const r of live) {
  const key = `${r.model} · ${r.purpose.split(":")[0]}`;
  const b = by.get(key) ?? { calls: 0, cost: 0, input: 0, cached: 0, output: 0, images: 0 };
  b.calls++;
  b.cost += r.costUsd;
  b.input += r.usage.input;
  b.cached += r.usage.cached;
  b.output += r.usage.output;
  b.images += r.images;
  by.set(key, b);
}
console.log(`Live calls: ${live.length} · rehearsals: ${all.length - live.length}`);
console.log(`Spent: $${spent.toFixed(5)} of the $${capUsd().toFixed(2)} cap (credits: $10.00).`);
for (const [k, b] of by) console.log(`  ${k}: ${b.calls} calls, $${b.cost.toFixed(5)}, in ${b.input} (cached ${b.cached}), out ${b.output}, images ${b.images}`);

if (process.argv.includes("--export")) {
  const lines = [
    "# Usage trace",
    "",
    `Every live call to a Meta model during the hackathon, from the app's own receipt ledger. Total: **$${spent.toFixed(4)}** in ${live.length} calls.`,
    "",
    "| When (UTC) | Model | Purpose | Input tokens | Cached | Output tokens | Reasoning | Images | Cost (US$) |",
    "|---|---|---|---:|---:|---:|---:|---:|---:|",
    ...live.map(
      (r) =>
        `| ${r.at.replace("T", " ").slice(0, 19)} | ${r.model} | ${r.purpose} | ${r.usage.input} | ${r.usage.cached} | ${r.usage.output} | ${r.usage.reasoning} | ${r.images} | ${r.costUsd.toFixed(6)} |`,
    ),
    "",
  ];
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/usage-trace.md", lines.join("\n"));
  console.log("Wrote reports/usage-trace.md");
}
