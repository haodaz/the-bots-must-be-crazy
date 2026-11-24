// Ask Muse Ember to write the game's music as a score (src/music/score.ts); the browser plays it with a small synth.
// Each run writes one or more variants in different styles, to be compared by ear on /music, and every call leaves a
// receipt in the ledger like any other. Rehearsal by default ($0). Usage:
//   node scripts/compose.ts                       (rehearsal: checks the prompt and the plumbing)
//   MODEL_LIVE=1 node scripts/compose.ts --n=3    (three real variants; at medium effort about half a cent each)
// Writes public/music/<id>.json and a list of them, public/music/index.json.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { INSTRUMENTS, SCALES, SCORE_SCHEMA, THEMES, THEME_BRIEF, cleanScore } from "../src/music/score.ts";
import { liveAllowed, loadEnv, think } from "../src/server/meta.ts";

loadEnv();
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const n = Math.max(1, Math.min(3, Number(arg("n") ?? 1)));

const STYLES = [
  { id: "music-box", hint: "Style: a music box and bells over soft plucked bass; childlike, crystalline, close to a lullaby." },
  { id: "chiptune", hint: "Style: a warm, gentle chiptune, like an old handheld game: square lead, triangle bass, light drums; tuneful, never shrill." },
  { id: "folk", hint: "Style: a small folk ensemble: a flute leading, plucked strings, a soft pad; earthy, like music from a village map." },
];

const RULES = `You are the composer for a small browser game, "The Bots Must Be Crazy".

The game: a stranger loses $4.20; on the way down it turns to gold (21,000,000 metashi, all there will ever be) and rains over a small new planet. 100 bots are born there the way real babies are born this year, by the real birth lottery: where they land decides their schooling, electricity, internet and bank account. They have no minds, only instincts. When a bot is about to starve, or has saved enough, it wakes, and a real AI thinks for it; every thought costs real money. The look is a painted old map with pixel-art bots: warm parchment, gold, ink. The feeling: tender, curious, a little bittersweet, never cynical or epic.

Write the whole score as data. There is one main motif (4 to 8 notes) that returns in different clothes across the themes.

Format of each theme:
- bpm, root (a MIDI note; 60 is middle C), scale (${Object.keys(SCALES).join(", ")}), bars (4/4; 16 sixteenths per bar).
- voices: 1 to 4, each with an instrument (${INSTRUMENTS.join(", ")}), an octave shift, a gain (0.1 to 1; keep the melody about 0.6, accompaniment 0.3 to 0.4, pads 0.25), and notes.
- notes: tokens "degree:length" separated by spaces. degree is a scale degree counted from 0 (the root); 7 is the root an octave up (in a 5-note scale, 5 is the octave); negative numbers go below. Add "b" or "#" for a semitone down or up (e.g. "3b:4"). "r:length" is a rest. A chord joins degrees with "+", e.g. "0+2+4:16". length is in sixteenths: 4 is a beat, 16 a whole bar.
- In every voice the lengths must add up to exactly bars × 16. Count them.
- drums: a string with one character per sixteenth (k kick, s snare, h hat, o open hat, t tick, . nothing), repeated to fill the theme; an empty string for none. Drums only where they help; most themes need none or very little.

Musical rules:
- Looping themes must loop seamlessly: the last bar leads back to the first.
- Stings are short and sit on top of whatever loop is playing, so keep them light and in a register that does not clash (bells and plucks high, nothing low and heavy).
- The calm theme plays for many minutes: modest, with space; simple harmony (pad or bass on long notes), the melody resting often.
- Write singable melodies with stepwise motion and a few leaps; avoid long runs of equal notes.

The themes to write, one of each:
${THEMES.map((id) => `- ${id} (${THEME_BRIEF[id].loop ? "loops" : "plays once"}, ${THEME_BRIEF[id].bars[0]}${THEME_BRIEF[id].bars[1] !== THEME_BRIEF[id].bars[0] ? `–${THEME_BRIEF[id].bars[1]}` : ""} bars): ${THEME_BRIEF[id].brief}`).join("\n")}`;

const live = liveAllowed();
mkdirSync("public/music", { recursive: true });
const indexPath = "public/music/index.json";
const index: { id: string; title: string; note: string; costUsd: number; at: string }[] = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : [];

for (const style of STYLES.slice(0, n)) {
  const t0 = Date.now();
  const r = await think({
    purpose: `music:${style.id}`,
    instructions: RULES,
    input: `${style.hint}\nWrite all ${THEMES.length} themes.`,
    schema: SCORE_SCHEMA as unknown as { name: string; schema: Record<string, unknown> },
    effort: "medium",
    maxOutputTokens: 16000,
    cacheKey: "tbmbc-music-v1",
  });
  const score = cleanScore(r.json);
  const u = r.receipt.usage;
  console.log(`${style.id}: ${score.themes.length} themes, "${score.title}". ${u.output} out (${u.reasoning} reasoning), $${r.receipt.costUsd.toFixed(5)}, ${((Date.now() - t0) / 1000).toFixed(0)} s.`);
  if (!live) continue;
  writeFileSync(`public/music/${style.id}.json`, JSON.stringify(score, null, 1));
  const entry = { id: style.id, title: score.title, note: score.note, costUsd: r.receipt.costUsd, at: r.receipt.at };
  const i = index.findIndex((x) => x.id === style.id);
  if (i >= 0) index[i] = entry;
  else index.push(entry);
}
if (live) writeFileSync(indexPath, JSON.stringify(index, null, 1));
