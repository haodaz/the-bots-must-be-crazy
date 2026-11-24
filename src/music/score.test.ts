import { describe, expect, it } from "vitest";
import { cleanScore, degreeToMidi, parseDrums, parseVoice, type Theme } from "./score.ts";

const theme = (over: Partial<Theme> = {}): Theme => ({ id: "calm", bpm: 90, root: 60, scale: "major", bars: 1, voices: [], drums: "", ...over });

describe("score", () => {
  it("turns scale degrees into pitches, across octaves and with bends", () => {
    expect(degreeToMidi(0, 0, 60, "major", 0)).toBe(60);
    expect(degreeToMidi(2, 0, 60, "major", 0)).toBe(64);
    expect(degreeToMidi(7, 0, 60, "major", 0)).toBe(72);
    expect(degreeToMidi(-1, 0, 60, "major", 0)).toBe(59);
    expect(degreeToMidi(2, -1, 60, "major", 0)).toBe(63);
    expect(degreeToMidi(0, 0, 60, "minor", -1)).toBe(48);
  });

  it("reads notes, chords and rests, and fits them to the theme", () => {
    const th = theme();
    const ev = parseVoice({ instrument: "lead", octave: 0, gain: 0.5, notes: "0:4 r:4 0+2+4:4 4b:8 9:4" }, th);
    expect(ev.map((e) => [e.step, e.len, e.midi])).toEqual([
      [0, 4, [60]],
      [8, 4, [60, 64, 67]],
      [12, 4, [66]],
    ]);
  });

  it("repeats a drum line and ignores stray characters", () => {
    const d = parseDrums(theme({ bars: 2, drums: "k...|h...|s...|h..." }));
    expect(d.length).toBe(8);
    expect(d[0]).toEqual({ step: 0, hit: "k" });
  });

  it("cleans a sloppy score: unknown themes and instruments dropped, numbers clamped", () => {
    const s = cleanScore({
      title: "T",
      themes: [
        { id: "calm", bpm: 999, root: 10, scale: "weird", bars: 3, voices: [{ instrument: "kazoo", notes: "0:4" }, { instrument: "bass", octave: 9, gain: 2, notes: "0:16" }], drums: 5 },
        { id: "nope", voices: [] },
        { id: "calm", voices: [] },
      ],
    });
    expect(s.themes).toHaveLength(1);
    expect(s.themes[0]).toMatchObject({ bpm: 140, root: 45, scale: "major", bars: 16, drums: "" });
    expect(s.themes[0].voices).toEqual([{ instrument: "bass", octave: 2, gain: 1, notes: "0:16" }]);
  });
});
