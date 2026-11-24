// The band: a small synthesizer in the browser (Web Audio) that plays the score Muse Ember wrote (src/music/score.ts).
// One looping theme plays at a time and crossfades when the moment changes; short stings play on top for events; a few
// sound effects are made from scratch. Nothing sounds until the visitor turns music on (browsers also require a click).

import { parseDrums, parseVoice, type DrumEvent, type Instrument, type NoteEvent, type Score, type Theme, type ThemeId } from "@/music/score.ts";

type Prepared = { theme: Theme; notes: NoteEvent[]; drums: DrumEvent[]; step: number; length: number };
type Loop = { id: ThemeId; bus: GainNode; next: number; p: Prepared };

const PREF = "tbmbc.music";
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export function musicPref(): boolean {
  try {
    return localStorage.getItem(PREF) === "on";
  } catch {
    return false;
  }
}

class Band {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfxBus!: GainNode;
  private wet!: GainNode;
  private noise!: AudioBuffer;
  private themes = new Map<ThemeId, Prepared>();
  private loop: Loop | null = null;
  private wanted: ThemeId | null = null;
  private lastSting = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  on = false;
  score: Score | null = null;

  setScore(score: Score) {
    this.score = score;
    this.themes.clear();
    for (const theme of score.themes) {
      const step = 60 / theme.bpm / 4;
      this.themes.set(theme.id, { theme, notes: theme.voices.flatMap((v) => parseVoice(v, theme)), drums: parseDrums(theme), step, length: theme.bars * 16 * step });
    }
    if (this.loop) {
      const id = this.loop.id;
      this.fadeOut(0.3);
      this.wanted = null;
      this.want(id);
    }
  }

  has(id: ThemeId) {
    return this.themes.has(id);
  }

  /** Turn the music on. Must be called from a click or key press (browsers allow sound only after one). */
  start() {
    if (!this.ctx) this.build();
    void this.ctx!.resume();
    this.on = true;
    this.save();
    this.master.gain.setTargetAtTime(0.55, this.ctx!.currentTime, 0.2);
    if (!this.timer) this.timer = setInterval(() => this.tick(), 60);
    const w = this.wanted;
    this.wanted = null;
    if (w) this.want(w);
  }

  stop() {
    this.on = false;
    this.save();
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    this.fadeOut(0.3);
  }

  private save() {
    try {
      localStorage.setItem(PREF, this.on ? "on" : "off");
    } catch {}
  }

  /** The loop that fits the moment. Repeated calls with the same theme do nothing. */
  want(id: ThemeId | null) {
    if (id === this.wanted) return;
    this.wanted = id;
    if (!this.on || !this.ctx) return;
    this.fadeOut(1.6);
    const p = id ? this.themes.get(id) : undefined;
    if (!id || !p) return;
    const bus = this.ctx.createGain();
    bus.gain.value = 0;
    bus.gain.setTargetAtTime(1, this.ctx.currentTime + 0.05, 0.5);
    bus.connect(this.music);
    this.loop = { id, bus, next: this.ctx.currentTime + 0.1, p };
  }

  /** A short theme on top of the loop. `gap` keeps frequent events from piling up (seconds). */
  sting(id: ThemeId, gap = 2.5) {
    if (!this.on || !this.ctx) return;
    const p = this.themes.get(id);
    if (!p) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastSting.get(id) ?? -99) < gap) return;
    this.lastSting.set(id, now);
    const bus = this.ctx.createGain();
    bus.gain.value = 0.8;
    bus.connect(this.music);
    this.play(p, now + 0.03, bus);
    setTimeout(() => bus.disconnect(), (p.length + 4) * 1000);
  }

  /** Sound effects, made from scratch. */
  sfx(kind: "coin" | "flip" | "click") {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    if (kind === "coin") {
      this.voice("bell", 88, t, 0.12, 0.35, this.sfxBus);
      this.voice("bell", 93, t + 0.07, 0.3, 0.3, this.sfxBus);
    } else if (kind === "flip") {
      this.noiseHit(t, 0.12, 0.25, "bandpass", 2400, 0.8, this.sfxBus);
    } else {
      this.noiseHit(t, 0.03, 0.12, "highpass", 4000, 1, this.sfxBus);
    }
  }

  // ---- inside ----

  private build() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    // A gentle limiter so chords and stings never clip.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.music = ctx.createGain();
    this.music.gain.value = 0.8;
    this.music.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.7;
    this.sfxBus.connect(this.master);
    // A small room: a convolver fed by a made-up impulse (decaying noise).
    const verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.2);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    verb.buffer = ir;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.28;
    this.wet.connect(verb).connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const n = this.noise.getChannelData(0);
    for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
  }

  private fadeOut(time: number) {
    const l = this.loop;
    if (!l || !this.ctx) return;
    this.loop = null;
    l.bus.gain.cancelScheduledValues(this.ctx.currentTime);
    l.bus.gain.setTargetAtTime(0, this.ctx.currentTime, time / 4);
    setTimeout(() => l.bus.disconnect(), time * 1000 + 6000);
  }

  /** The scheduler: keeps the next pass of the loop booked a little ahead of time. */
  private tick() {
    const ctx = this.ctx;
    const l = this.loop;
    if (!ctx || !l || !this.on) return;
    while (l.next < ctx.currentTime + 0.5) {
      this.play(l.p, l.next, l.bus);
      l.next += l.p.length;
      if (!l.p.theme.voices.length && !l.p.drums.length) break;
    }
  }

  private play(p: Prepared, at: number, bus: GainNode) {
    for (const e of p.notes) for (const m of e.midi) this.voice(e.instrument, m, at + e.step * p.step, e.len * p.step, e.gain / Math.sqrt(e.midi.length), bus);
    for (const d of p.drums) this.drum(d.hit, at + d.step * p.step, bus);
  }

  /** One note on one instrument. */
  private voice(inst: Instrument, midi: number, t: number, dur: number, gain: number, bus: GainNode) {
    const ctx = this.ctx!;
    const f = hz(midi);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.connect(bus);
    const send = inst === "bass" || inst === "lead" ? 0.3 : 1;
    const toWet = ctx.createGain();
    toWet.gain.value = send;
    env.connect(toWet).connect(this.wet);
    const oscs: OscillatorNode[] = [];
    const osc = (type: OscillatorType, freq: number, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      oscs.push(o);
      return o;
    };
    let end = t + dur;
    const g = env.gain;
    if (inst === "lead") {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2600;
      osc("square", f).connect(lp).connect(env);
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(gain * 0.16, t + 0.012);
      g.setTargetAtTime(gain * 0.1, t + 0.02, 0.08);
      g.setTargetAtTime(0, end, 0.04);
      end += 0.3;
    } else if (inst === "flute") {
      const o = osc("sine", f);
      const o2 = osc("triangle", f * 2);
      const o2g = ctx.createGain();
      o2g.gain.value = 0.12;
      const lfo = osc("sine", 5.2);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.4, dur));
      lfo.connect(depth).connect(o.frequency);
      o.connect(env);
      o2.connect(o2g).connect(env);
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(gain * 0.32, t + 0.07);
      g.setTargetAtTime(gain * 0.26, t + 0.08, 0.2);
      g.setTargetAtTime(0, end, 0.07);
      end += 0.5;
    } else if (inst === "bell") {
      const car = osc("sine", f);
      const mod = osc("sine", f * 3.5);
      const idx = ctx.createGain();
      idx.gain.setValueAtTime(f * 1.4, t);
      idx.gain.exponentialRampToValueAtTime(f * 0.05, t + 1.2);
      mod.connect(idx).connect(car.frequency);
      car.connect(env);
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(gain * 0.3, t + 0.004);
      g.exponentialRampToValueAtTime(0.0005, t + Math.max(0.8, Math.min(2.4, dur + 1.2)));
      end = t + Math.max(0.8, Math.min(2.4, dur + 1.2)) + 0.05;
    } else if (inst === "pluck") {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(f * 8, t);
      lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.3);
      osc("triangle", f).connect(lp).connect(env);
      osc("sawtooth", f, 4).connect(lp);
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(gain * 0.3, t + 0.004);
      const d = Math.min(1.2, 0.25 + dur * 0.6);
      g.exponentialRampToValueAtTime(0.0005, t + d);
      end = t + d + 0.05;
    } else if (inst === "pad") {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1100;
      lp.Q.value = 0.4;
      osc("sawtooth", f, -8).connect(lp);
      osc("sawtooth", f, 8).connect(lp);
      osc("triangle", f / 2).connect(lp);
      lp.connect(env);
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(gain * 0.09, t + Math.min(0.6, dur * 0.4));
      g.setTargetAtTime(0, end, 0.25);
      end += 1.2;
    } else {
      osc("triangle", f).connect(env);
      osc("sine", f / 2).connect(env);
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(gain * 0.4, t + 0.01);
      g.setTargetAtTime(gain * 0.3, t + 0.02, 0.15);
      g.setTargetAtTime(0, end - 0.02, 0.03);
      end += 0.2;
    }
    for (const o of oscs) {
      o.start(t);
      o.stop(end);
    }
    oscs[0].onended = () => {
      env.disconnect();
      toWet.disconnect();
    };
  }

  private drum(hit: DrumEvent["hit"], t: number, bus: GainNode) {
    const ctx = this.ctx!;
    if (hit === "k") {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + 0.25);
    } else if (hit === "s") {
      this.noiseHit(t, 0.14, 0.22, "bandpass", 1800, 0.7, bus);
    } else if (hit === "h") {
      this.noiseHit(t, 0.04, 0.08, "highpass", 7000, 1, bus);
    } else if (hit === "o") {
      this.noiseHit(t, 0.22, 0.07, "highpass", 6500, 1, bus);
    } else {
      this.noiseHit(t, 0.02, 0.1, "bandpass", 3000, 3, bus);
    }
  }

  private noiseHit(t: number, dur: number, gain: number, type: BiquadFilterType, freq: number, q: number, bus: GainNode) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
}

/** One band for the whole page. */
export const band = new Band();
