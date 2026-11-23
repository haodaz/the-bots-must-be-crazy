// Generate the game's illustrations with Muse Image, through the budget gate.
// Rehearsal by default: prints the plan and its cost, makes no images, spends $0.
// Usage: node scripts/gen-art.ts [--only=card-harvest,intro-1-pocket] [--set=card|role|back|intro] [--variants=2]
//        MODEL_LIVE=1 node scripts/gen-art.ts ...   (real images, $0.01 each)
// Images land in public/art/<id>-v<n>.webp; pick the keepers in src/art/manifest.ts.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { JOBS, promptFor } from "../src/art/prompts.ts";
import { capUsd, PRICES, spentUsd } from "../src/server/budget.ts";
import { liveAllowed, loadEnv, paint } from "../src/server/meta.ts";

loadEnv();
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const only = arg("only")?.split(",");
const set = arg("set");
const variants = Number(arg("variants") ?? 2);
const jobs = JOBS.filter((j) => (!only || only.includes(j.id)) && (!set || j.set === set));

const live = liveAllowed();
const cost = jobs.length * variants * PRICES["muse-image-1.0"].image;
console.log(`${live ? "LIVE" : "Rehearsal"}: ${jobs.length} illustrations × ${variants} variants = ${jobs.length * variants} images, about $${cost.toFixed(2)}.`);
console.log(`Spent so far: $${spentUsd().toFixed(4)} of the $${capUsd().toFixed(2)} cap.`);

mkdirSync("public/art", { recursive: true });
for (const job of jobs) {
  for (let v = 1; v <= variants; v++) {
    const path = `public/art/${job.id}-v${v}.webp`;
    if (live && existsSync(path)) {
      console.log(`  skip ${path} (already there)`);
      continue;
    }
    const r = await paint({ purpose: `art:${job.id}-v${v}`, prompt: promptFor(job), size: job.size });
    if (r.b64) {
      writeFileSync(path, Buffer.from(r.b64, "base64"));
      console.log(`  ${path}  $${r.receipt.costUsd.toFixed(2)}`);
    } else {
      console.log(`  (rehearsal) ${job.id}-v${v}: ${job.subject.slice(0, 70)}…`);
    }
  }
}
console.log(`Done. Spent so far: $${spentUsd().toFixed(4)}.`);
