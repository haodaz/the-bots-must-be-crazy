// The smallest possible call to Muse Ember, to check the key and see a real receipt.
// Rehearsal by default ($0). Live only with META_API_KEY in .env.local and MODEL_LIVE=1.
// Usage: node scripts/ember-ping.ts            (rehearsal)
//        MODEL_LIVE=1 node scripts/ember-ping.ts (one real call, a fraction of a cent)

import { capUsd, spentUsd } from "../src/server/budget.ts";
import { liveAllowed, loadEnv, think } from "../src/server/meta.ts";

loadEnv();
const r = await think({
  purpose: "ping",
  instructions: "You are a test. Answer with one word.",
  input: "Reply with the word ready.",
  effort: "minimal",
  maxOutputTokens: 16,
});
console.log(`${liveAllowed() ? "LIVE" : "rehearsal"}: "${r.text}"`);
console.log(r.receipt);
console.log(`Spent so far: $${spentUsd().toFixed(5)} of the $${capUsd().toFixed(2)} cap.`);
