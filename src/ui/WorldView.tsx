"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LAWS, isNight, yieldAt } from "@/engine/laws.ts";
import { census, createWorld, ledger, step, type Bot, type World } from "@/engine/world.ts";

const TILE = 16;
const SPEEDS = [
  { label: "1×", ticks: 1 },
  { label: "10×", ticks: 10 },
  { label: "50×", ticks: 50 },
];
const COLORS = {
  ground: "#fbfaf6",
  gold: "200, 150, 42",
  bot: "#4a5064",
  digging: "#1d2233",
  faint: "#b9bdc8",
  asleep: "#9aa3b8",
  need: "#3b6fe0",
  plenty: "#c8962a",
};

const fmt = (n: number) => n.toLocaleString("en-US");

export default function WorldView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World>(createWorld(1));
  const [, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const selectedRef = useRef<number | null>(null);
  selectedRef.current = selected;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = worldRef.current;
    const dpr = window.devicePixelRatio || 1;
    const cw = w.width * TILE;
    const ch = w.height * TILE;
    if (canvas.width !== cw * dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
    }
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, 0, cw, ch);

    // Gold in the ground: the more metashi, the deeper the colour.
    for (let i = 0; i < w.gold.length; i++) {
      const g = w.gold[i];
      if (g <= 0) continue;
      const a = Math.min(1, Math.max(0.12, (Math.log10(g) - 2) / 4));
      ctx.fillStyle = `rgba(${COLORS.gold}, ${a})`;
      ctx.fillRect((i % w.width) * TILE + 1, Math.floor(i / w.width) * TILE + 1, TILE - 2, TILE - 2);
    }

    // Borders between lands, and their names.
    ctx.strokeStyle = "rgba(29,34,51,0.22)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    for (const land of w.lands.slice(1)) {
      ctx.beginPath();
      ctx.moveTo(land.x0 * TILE + 0.5, 0);
      ctx.lineTo(land.x0 * TILE + 0.5, ch);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.font = "600 9px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(29,34,51,0.5)";
    for (const land of w.lands) {
      const cx = ((land.x0 + land.x1) / 2) * TILE;
      const maxW = (land.x1 - land.x0) * TILE - 6;
      const lines = ctx.measureText(land.short).width > maxW ? land.short.replace(" & ", " &\n").split("\n") : [land.short];
      lines.forEach((line, i) => ctx.fillText(line, cx, ch - 6 - (lines.length - 1 - i) * 10));
    }

    for (const b of w.bots) drawBot(ctx, b, b.id === selectedRef.current);

    // Night: a soft dusk over the whole world.
    if (isNight(w.tick)) {
      ctx.fillStyle = "rgba(29,34,51,0.07)";
      ctx.fillRect(0, 0, cw, ch);
    }
  }, []);

  useEffect(() => {
    let raf = 0;
    let lastHud = 0;
    const loop = (now: number) => {
      if (playing) {
        for (let i = 0; i < SPEEDS[speed].ticks; i++) step(worldRef.current);
      }
      draw();
      if (now - lastHud > 120) {
        lastHud = now;
        setFrame((f) => f + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, draw]);

  const newWorld = () => {
    worldRef.current = createWorld(Math.floor(Math.random() * 1_000_000));
    setSelected(null);
  };

  const onPick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const w = worldRef.current;
    const tx = ((e.clientX - rect.left) / rect.width) * w.width;
    const ty = ((e.clientY - rect.top) / rect.height) * w.height;
    let best: Bot | null = null;
    let bestD = 2.2;
    for (const b of w.bots) {
      const d = Math.hypot(b.x + 0.5 - tx, b.y + 0.5 - ty);
      if (d < bestD) {
        best = b;
        bestD = d;
      }
    }
    setSelected(best ? best.id : null);
  };

  const w = worldRef.current;
  const l = ledger(w);
  const c = census(w);
  const day = Math.floor(w.tick / LAWS.DAY_TICKS) + 1;
  const halvingsDone = Math.floor(w.tick / LAWS.HALVING_TICKS);
  const nextHalving =
    halvingsDone < LAWS.MAX_HALVINGS ? (halvingsDone + 1) * LAWS.HALVING_TICKS - w.tick : null;
  const bot = selected !== null ? w.bots[selected] : null;

  return (
    <main className="page">
      <header className="top">
        <div>
          <h1>The Bots Must Be Crazy</h1>
          <p>
            World #{w.seed} · Day {day}{isNight(w.tick) ? " · night" : ""} · {LAWS.POPULATION} bots, born the way real babies
            are born this year. No minds yet.
          </p>
        </div>
        <div className="controls">
          <button className="btn" onClick={() => setPlaying((p) => !p)}>
            {playing ? "Pause" : "Play"}
          </button>
          {SPEEDS.map((s, i) => (
            <button key={s.label} className={`btn ${speed === i ? "on" : ""}`} onClick={() => setSpeed(i)}>
              {s.label}
            </button>
          ))}
          <button className="btn" onClick={newWorld}>
            New world
          </button>
        </div>
      </header>

      <div className="layout">
        <section className="stage">
          <canvas ref={canvasRef} onClick={onPick} style={{ aspectRatio: `${w.width} / ${w.height}` }} />
          <div className="legend">
            <span>
              <i className="dot" style={{ background: "rgba(200,150,42,.8)", borderRadius: 2 }} /> metashi in the ground
            </span>
            <span>
              <i className="dot" style={{ background: COLORS.digging }} /> digging
            </span>
            <span>
              <i className="dot" style={{ background: COLORS.faint }} /> starving
            </span>
            <span>
              <i className="dot" style={{ border: `2px solid ${COLORS.need}` }} /> need switch flipped
            </span>
            <span>
              <i className="dot" style={{ border: `2px solid ${COLORS.plenty}` }} /> plenty switch flipped
            </span>
            <span>Click a bot to read its instincts.</span>
          </div>
        </section>

        <aside className="side">
          <div className="card">
            <h2>The ledger</h2>
            <div className="row">
              <span className="k">In the ground</span>
              <span className="v">{fmt(l.ground)}</span>
            </div>
            <div className="row">
              <span className="k">In pockets</span>
              <span className="v">{fmt(l.pockets)}</span>
            </div>
            <div className="row">
              <span className="k">In land treasuries</span>
              <span className="v">{fmt(l.treasuries)}</span>
            </div>
            <div className="row total">
              <span>Total metashi</span>
              <span className="v">{fmt(l.total)}</span>
            </div>
            <p className="note">
              {l.total === LAWS.SUPPLY
                ? "The law holds: never more, never less than 21,000,000. Money spent on food goes back into the ground."
                : "The law is broken. This should never happen."}
            </p>
          </div>

          <div className="card">
            <h2>The world</h2>
            <div className="row">
              <span className="k">A swing digs</span>
              <span className="v">{yieldAt(w.tick)} metashi</span>
            </div>
            <div className="row">
              <span className="k">Next halving</span>
              <span className="v">
                {nextHalving === null ? "none left" : `in ${(nextHalving / LAWS.DAY_TICKS).toFixed(1)} days`}
              </span>
            </div>
            <div className="row">
              <span className="k">Digging · starving · broke</span>
              <span className="v">
                {c.mining} · {c.faint} · {c.broke}
              </span>
            </div>
            <div className="row">
              <span className="k">Richest ten hold</span>
              <span className="v">{Math.round(c.top10Share * 100)}% of pocket money</span>
            </div>
          </div>

          <div className="card">
            <h2>Minds</h2>
            <div className="jar">
              <Jar level={0} />
              <div>
                <div className="row" style={{ padding: 0 }}>
                  <span className="k">Real compute today</span>
                  <span className="v">$0.00</span>
                </div>
                <p className="note" style={{ marginTop: 2 }}>
                  No grain of sugar yet. No one can wake until it arrives.
                </p>
              </div>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <span className="k">Waiting to wake, by need</span>
              <span className="v">{c.readyByNeed}</span>
            </div>
            <div className="row">
              <span className="k">Waiting to wake, by plenty</span>
              <span className="v">{c.readyByPlenty}</span>
            </div>
          </div>

          {bot && (
            <div className="card">
              <h2>
                Bot #{bot.id} · {bot.state === "faint" ? "starving" : bot.state}
              </h2>
              <div className="row">
                <span className="k">Wallet</span>
                <span className="v">{fmt(bot.wallet)} metashi</span>
              </div>
              <div className="row">
                <span className="k">Hunger</span>
                <span className="v">{bot.hunger}</span>
              </div>
              <div className="tag">
                <b>Birth certificate</b>
                <br />
                born in {bot.birth.countryName} ({w.lands[bot.birth.land].short})
                <br />
                family: {familyLine(bot.birth.familyRank)}
                <br />
                family money: {fmt(bot.birth.inheritance)} metashi
                <br />
                school: {bot.birth.schoolYears} years · sees gold {bot.sight} tiles away
                <br />
                online, so has tools: {bot.birth.tools ? "yes" : "no"}
                <br />
                electricity: {bot.birth.electricity ? "yes" : "no, sleeps at night"}
                <br />
                bank account: {bot.birth.account ? "yes" : "no, welfare can't reach it"}
                <br />
                food here costs {w.lands[bot.birth.land].foodPrice} metashi
              </div>
              <div className="tag">
                <b>Life so far</b>
                <br />
                dug {fmt(bot.life.mined)} metashi, paid {fmt(bot.life.taxPaid)} in tax
                <br />
                {bot.life.meals} meals, {bot.life.welfareMeals} of them from welfare
                <br />
                richest moment: {fmt(bot.life.peakWallet)} metashi
                <br />
                starved {bot.life.faints} {bot.life.faints === 1 ? "time" : "times"}
                <br />
                time spent: {timeSplit(bot)}
              </div>
              <p className="note">
                {bot.wake
                  ? `Its ${bot.wake} switch flipped on day ${Math.floor((bot.wakeTick ?? 0) / LAWS.DAY_TICKS) + 1}. It is still asleep.`
                  : "Instincts, not a mind. It has never had a thought."}
              </p>
            </div>
          )}

          <div className="card">
            <h2>What happened</h2>
            <ul className="events">
              {[...w.events].reverse().map((e, i) => (
                <li key={`${e.tick}-${i}`}>
                  <span className="t">d{Math.floor(e.tick / LAWS.DAY_TICKS) + 1}</span>
                  {e.text}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}

function familyLine(rank: number) {
  const pct = Math.round(rank * 100);
  return pct >= 50 ? `richer than ${pct}% of families there` : `poorer than ${100 - pct}% of families there`;
}

function timeSplit(b: Bot) {
  const l = b.life;
  const total = l.ticksDigging + l.ticksSearching + l.ticksAsleep || 1;
  const p = (v: number) => `${Math.round((v / total) * 100)}%`;
  return `${p(l.ticksDigging)} digging, ${p(l.ticksSearching)} searching, ${p(l.ticksAsleep)} asleep`;
}

function drawBot(ctx: CanvasRenderingContext2D, b: Bot, selected: boolean) {
  const cx = b.x * TILE + TILE / 2;
  const cy = b.y * TILE + TILE / 2;
  if (b.wake) {
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.strokeStyle = b.wake === "need" ? COLORS.need : COLORS.plenty;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (selected) {
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.digging;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 2]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle =
    b.state === "faint" ? COLORS.faint : b.state === "asleep" ? COLORS.asleep : b.state === "mining" ? COLORS.digging : COLORS.bot;
  ctx.fill();
}

/** A glass jar for the day's real compute. Empty until the first grain arrives. */
function Jar({ level }: { level: number }) {
  const h = 30 * Math.max(0, Math.min(1, level));
  return (
    <svg width="34" height="42" viewBox="0 0 34 42" aria-hidden>
      <rect x="9" y="2" width="16" height="5" rx="1.5" fill="none" stroke="#9aa0b2" strokeWidth="1.5" />
      <path d="M8 8 h18 q3 0 3 3 v25 q0 4 -4 4 h-16 q-4 0 -4 -4 v-25 q0 -3 3 -3 z" fill="none" stroke="#9aa0b2" strokeWidth="1.5" />
      {h > 0 && <rect x="7" y={39 - h} width="20" height={h} rx="2" fill="#f3e6c4" />}
    </svg>
  );
}
