// The score. No model on the Meta Model API makes sound, so Muse Ember writes the music as notes, the way a composer
// writes a score, and the browser plays it with a small synthesizer (src/ui/music.ts). A score is a handful of themes,
// one for each kind of moment in the game; each theme has a key, a tempo and a few voices written in a compact text form
// that a model can write and a person can read:
//
//   notes: "0:4 2:2 4:2 7:8"   scale degree : length in sixteenths ("r" is a rest, "0+2+4" a chord, "3b" / "3#" bend
//                              a degree down or up a semitone; 7 is the root an octave up, -1 the degree just below)
//   drums: "k...h...s...h..."  one character per sixteenth: k kick, s snare, h hat, o open hat, t tick, . nothing
//
// Everything a model writes is checked and clamped here, so a sloppy score still plays.

export const THEMES = ["story", "genesis", "calm", "hard", "rain", "wakeNeed", "wakePlenty", "faint", "end"] as const;
export type ThemeId = (typeof THEMES)[number];

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
} as const;
export type Scale = keyof typeof SCALES;

export const INSTRUMENTS = ["lead", "flute", "bell", "pluck", "pad", "bass"] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

export type Voice = { instrument: Instrument; octave: number; gain: number; notes: string };
export type Theme = { id: ThemeId; bpm: number; root: number; scale: Scale; bars: number; voices: Voice[]; drums: string };
export type Score = { title: string; note: string; themes: Theme[] };

/** One note to play: when (in sixteenths from the start of the theme), how long, and which MIDI pitches. */
export type NoteEvent = { step: number; len: number; midi: number[]; instrument: Instrument; gain: number };
export type DrumEvent = { step: number; hit: "k" | "s" | "h" | "o" | "t" };

/** What each theme is for, told to the composer and shown on the listening page. */
export const THEME_BRIEF: Record<ThemeId, { loop: boolean; bars: [number, number]; brief: string }> = {
  story: { loop: true, bars: [8, 16], brief: "Under the five illustrated story pages before the game: babies born all over the world, where you land decides a lot, a small planet held in two hands. Tender, slow, a little music box. Introduce the main motif here." },
  genesis: { loop: true, bars: [4, 8], brief: "The opening: $4.20 falls from a stranger's pocket, turns to gold and rains over a small new planet; nations appear; 100 bots are born. Wonder and sparkle, building gently. Bells welcome." },
  calm: { loop: true, bars: [16, 16], brief: "The main loop while the world lives, for many minutes: bots walk to work, eat, sleep, save. Warm, modest, unhurried; must not tire the ear when it repeats. Main motif, lightly." },
  hard: { loop: true, bars: [8, 16], brief: "The same world in hard times: many bots have fainted from hunger. Same motif, darker mode or lower, sparser, patient, not melodramatic." },
  rain: { loop: false, bars: [1, 2], brief: "A short sting when a halving rain of gold falls on the economies: a quick glittering run of bells." },
  wakeNeed: { loop: false, bars: [1, 2], brief: "A short sting when a bot close to starving wakes and gets a mind: low, hesitant, a question." },
  wakePlenty: { loop: false, bars: [1, 2], brief: "A short sting when a bot with savings wakes and gets a mind: bright, rising, curious." },
  faint: { loop: false, bars: [1, 1], brief: "A very short, soft falling figure when a bot faints from hunger. It will play often, so keep it quiet and brief." },
  end: { loop: false, bars: [4, 8], brief: "The end of a round: a hundred years have passed, each bot's real-world twin is revealed. Reflective, resolving, the main motif one last time." },
};

/** The shape of a score, for the model (structured output). */
export const SCORE_SCHEMA = {
  name: "score",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["title", "note", "themes"],
    properties: {
      title: { type: "string", description: "A short title for the whole score." },
      note: { type: "string", description: "One or two sentences from the composer: the main motif and the idea." },
      themes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "bpm", "root", "scale", "bars", "voices", "drums"],
          properties: {
            id: { type: "string", enum: [...THEMES] },
            bpm: { type: "integer", description: "Tempo, 50 to 140." },
            root: { type: "integer", description: "MIDI note of the key's root, 48 to 64 (60 is middle C)." },
            scale: { type: "string", enum: Object.keys(SCALES) },
            bars: { type: "integer", description: "Length in bars of 4/4 (16 sixteenths each)." },
            voices: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["instrument", "octave", "gain", "notes"],
                properties: {
                  instrument: { type: "string", enum: [...INSTRUMENTS] },
                  octave: { type: "integer", description: "Shift from the root's octave, -2 to 2." },
                  gain: { type: "number", description: "Loudness, 0.1 to 1." },
                  notes: { type: "string", description: "Tokens degree:length separated by spaces; lengths in sixteenths must add up to bars × 16." },
                },
              },
            },
            drums: { type: "string", description: "One character per sixteenth (k s h o t .), or empty for none." },
          },
        },
      },
    },
  },
} as const;

const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/** Check a score from the model: unknown themes and instruments are dropped, numbers are clamped. */
export function cleanScore(raw: unknown): Score {
  const o = (raw ?? {}) as Record<string, unknown>;
  const themes: Theme[] = [];
  for (const th of Array.isArray(o.themes) ? o.themes : []) {
    const t = th as Record<string, unknown>;
    if (!THEMES.includes(t.id as ThemeId) || themes.some((x) => x.id === t.id)) continue;
    const id = t.id as ThemeId;
    const [lo, hi] = THEME_BRIEF[id].bars;
    const voices: Voice[] = [];
    for (const v of Array.isArray(t.voices) ? t.voices : []) {
      const x = v as Record<string, unknown>;
      if (!INSTRUMENTS.includes(x.instrument as Instrument) || typeof x.notes !== "string") continue;
      voices.push({ instrument: x.instrument as Instrument, octave: Math.round(clamp(x.octave, -2, 2, 0)), gain: clamp(x.gain, 0.05, 1, 0.5), notes: x.notes.slice(0, 4000) });
    }
    themes.push({
      id,
      bpm: Math.round(clamp(t.bpm, 50, 140, 90)),
      root: Math.round(clamp(t.root, 45, 67, 60)),
      scale: (t.scale as Scale) in SCALES ? (t.scale as Scale) : "major",
      bars: Math.round(clamp(t.bars, lo, hi, lo)),
      voices: voices.slice(0, 5),
      drums: typeof t.drums === "string" ? t.drums.slice(0, 1024) : "",
    });
  }
  return { title: typeof o.title === "string" ? o.title.slice(0, 80) : "Score", note: typeof o.note === "string" ? o.note.slice(0, 400) : "", themes };
}

/** A scale degree (with an optional semitone bend) as a MIDI pitch. */
export function degreeToMidi(degree: number, bend: number, root: number, scale: Scale, octave: number) {
  const s = SCALES[scale];
  const oct = Math.floor(degree / s.length);
  const i = ((degree % s.length) + s.length) % s.length;
  return root + 12 * (oct + octave) + s[i] + bend;
}

/** Read one voice's notes into events, fitted to the theme's length (cut if too long, a rest if too short). */
export function parseVoice(v: Voice, th: Theme): NoteEvent[] {
  const total = th.bars * 16;
  const out: NoteEvent[] = [];
  let step = 0;
  for (const tok of v.notes.trim().split(/\s+/)) {
    if (step >= total) break;
    const m = tok.match(/^([^:]+):(\d+(?:\.\d+)?)$/);
    if (!m) continue;
    const len = Math.max(1, Math.min(64, Math.round(Number(m[2]))));
    if (m[1] !== "r") {
      const midi = m[1]
        .split("+")
        .map((d) => d.match(/^(-?\d+)([#b]?)$/))
        .filter((x): x is RegExpMatchArray => x != null)
        .map((x) => degreeToMidi(Number(x[1]), x[2] === "#" ? 1 : x[2] === "b" ? -1 : 0, th.root, th.scale, v.octave))
        .filter((p) => p >= 24 && p <= 108);
      if (midi.length) out.push({ step, len: Math.min(len, total - step), midi, instrument: v.instrument, gain: v.gain });
    }
    step += len;
  }
  return out;
}

/** Read the drum line, repeated to fill the theme. */
export function parseDrums(th: Theme): DrumEvent[] {
  const pat = th.drums.replace(/[^ksoht.]/g, "");
  if (!pat || !/[ksoht]/.test(pat)) return [];
  const out: DrumEvent[] = [];
  for (let step = 0; step < th.bars * 16; step++) {
    const c = pat[step % pat.length];
    if (c !== ".") out.push({ step, hit: c as DrumEvent["hit"] });
  }
  return out;
}
