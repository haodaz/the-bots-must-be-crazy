"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LAWS, isNight, yieldAt } from "@/engine/laws.ts";
import { census, createWorld, ledger, step, type Bot, type World, type WorldEvent } from "@/engine/world.ts";
import { BotCard, LandCard, Portrait, fmt, stateLabel } from "./cards.tsx";
import { COL, DotRenderer, type Camera } from "./dots.ts";
import { DOTS, goldDots, goldOrder } from "./sprite.ts";

const SPEEDS = [
  { label: "1×", ticks: 1 },
  { label: "10×", ticks: 10 },
  { label: "50×", ticks: 50 },
];

/** The opening, in seconds. */
const INTRO = { fall: 1.8, burst: 2.6, settle: 4.4, lands: 5.6, born: 7.4, end: 8.4 };

type Selection = { kind: "bot"; id: number } | { kind: "land"; index: number; tile: { x: number; y: number } | null } | null;
type Cutin = { key: number; text: string; kind: "need" | "gold" };
type Particle = { tx: number; ty: number; delay: number; lift: number };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export default function WorldView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World>(createWorld(1));
  const rendererRef = useRef<DotRenderer | null>(null);
  const camRef = useRef<Camera>({ cx: 24, cy: 15, zoom: 1 });
  const particlesRef = useRef<Particle[]>([]);
  const introStartRef = useRef<number | null>(null);
  const lastEventRef = useRef<WorldEvent | null>(null);
  const lastCutRef = useRef(0);
  const rotateRef = useRef(0);

  const [, setFrame] = useState(0);
  const [intro, setIntro] = useState(0); // seconds into the opening, or -1 when done
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [selection, setSelection] = useState<Selection>(null);
  const [followId, setFollowId] = useState<number | null>(null);
  const [director, setDirector] = useState(true);
  const [cutin, setCutin] = useState<Cutin | null>(null);

  const followRef = useRef(followId);
  followRef.current = followId;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const directorRef = useRef(director);
  directorRef.current = director;

  const follow = useCallback((id: number | null) => {
    setFollowId(id);
    camRef.current.zoom = id == null ? 1 : 3;
    if (id != null) {
      const b = worldRef.current.bots[id];
      camRef.current.cx = b.x + 0.5;
      camRef.current.cy = b.y + 0.5;
    }
  }, []);

  const startWorld = useCallback((seed: number) => {
    const w = createWorld(seed);
    worldRef.current = w;
    lastEventRef.current = w.events[w.events.length - 1] ?? null;
    particlesRef.current = makeParticles(w);
    introStartRef.current = null;
    setIntro(0);
    setSelection(null);
    follow(null);
  }, [follow]);

  useEffect(() => {
    rendererRef.current = new DotRenderer(window.devicePixelRatio || 1);
    particlesRef.current = makeParticles(worldRef.current);
    lastEventRef.current = worldRef.current.events[worldRef.current.events.length - 1] ?? null;
  }, []);

  useEffect(() => {
    let raf = 0;
    let lastHud = 0;
    const loop = (now: number) => {
      const canvas = canvasRef.current;
      const r = rendererRef.current;
      const w = worldRef.current;
      if (canvas && r) {
        const { width, height } = r.size(w);
        if (canvas.width !== width) {
          canvas.width = width;
          canvas.height = height;
        }
        const ctx = canvas.getContext("2d")!;
        if (introStartRef.current === null) introStartRef.current = now;
        const t = (now - introStartRef.current) / 1000;
        if (intro >= 0) {
          drawGenesis(ctx, r, w, t, particlesRef.current);
          if (t >= INTRO.end) setIntro(-1);
        } else {
          if (playing) for (let i = 0; i < SPEEDS[speed].ticks; i++) step(w);
          watchEvents(now);
          const cam = camRef.current;
          if (followRef.current != null) {
            const b = w.bots[followRef.current];
            cam.cx += (b.x + 0.5 - cam.cx) * 0.12;
            cam.cy += (b.y + 0.5 - cam.cy) * 0.12;
          }
          const sel = selectionRef.current;
          r.draw(ctx, w, cam, {
            selectedId: sel?.kind === "bot" ? sel.id : null,
            followId: followRef.current,
            highlightLand: sel?.kind === "land" && cam.zoom === 1 ? sel.index : null,
          });
        }
        if (now - lastHud > 110) {
          lastHud = now;
          if (intro >= 0) setIntro(Math.min(t, INTRO.end));
          setFrame((f) => f + 1);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, intro >= 0]);

  /** New events: cut-ins for big moments, and the director cuts to whoever they happened to. */
  function watchEvents(now: number) {
    const w = worldRef.current;
    const fresh: WorldEvent[] = [];
    for (let i = w.events.length - 1; i >= 0 && w.events[i] !== lastEventRef.current; i--) fresh.unshift(w.events[i]);
    if (w.events.length) lastEventRef.current = w.events[w.events.length - 1];
    for (const e of fresh) {
      if (e.kind === "wake-ready" && e.botId != null) {
        const b = w.bots[e.botId];
        setCutin({
          key: now + e.botId,
          kind: b.wake === "need" ? "need" : "gold",
          text: `Bot #${b.id} · ${b.birth.countryName} · ${b.wake} switch flipped`,
        });
        if (directorRef.current && now - lastCutRef.current > 4000) {
          lastCutRef.current = now;
          follow(e.botId);
        }
      } else if (e.kind === "halving") {
        setCutin({ key: now, kind: "gold", text: e.text });
      }
    }
    if (directorRef.current && now - lastCutRef.current > 12000) {
      lastCutRef.current = now;
      const picks = channels(w).filter((c) => c.id !== followRef.current);
      const next = picks[rotateRef.current++ % picks.length];
      follow(next.id);
    }
  }

  const onPick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = rendererRef.current;
    if (!r || intro >= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const w = worldRef.current;
    const pt = r.pick(w, camRef.current, (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
    let best: Bot | null = null;
    let bestD = camRef.current.zoom === 1 ? 1.3 : 0.9;
    for (const b of w.bots) {
      const d = Math.hypot(b.x + 0.5 - pt.x, b.y + 0.5 - pt.y);
      if (d < bestD) {
        best = b;
        bestD = d;
      }
    }
    if (best) {
      setSelection({ kind: "bot", id: best.id });
      if (followRef.current != null) follow(best.id);
    } else {
      const col = Math.min(w.width - 1, Math.max(0, Math.floor(pt.x)));
      setSelection({ kind: "land", index: w.landOfCol[col], tile: { x: pt.x, y: pt.y } });
    }
  };

  const w = worldRef.current;
  const l = ledger(w);
  const c = census(w);
  const day = Math.floor(w.tick / LAWS.DAY_TICKS) + 1;
  const dayFrac = (w.tick % LAWS.DAY_TICKS) / LAWS.DAY_TICKS;
  const night = isNight(w.tick);
  const halvingsDone = Math.floor(w.tick / LAWS.HALVING_TICKS);
  const nextHalving = halvingsDone < LAWS.MAX_HALVINGS ? (halvingsDone + 1) * LAWS.HALVING_TICKS - w.tick : null;
  const followed = followId != null ? w.bots[followId] : null;
  const lastAbout = followed ? [...w.events].reverse().find((e) => e.botId === followed.id) : null;
  const chans = channels(w);
  const introOn = intro >= 0;

  return (
    <main className="game">
      <header className="hud">
        <div className="logo">
          The Bots Must Be Crazy
          <small>Born by the real birth lottery. One grain of compute a day. No minds yet.</small>
        </div>
        <div className="spacer" />
        <div className="panel clock">
          <SunMoon night={night} />
          <div>
            <div className="num">Day {day}</div>
            <div style={{ width: 90, height: 6, border: "1.5px solid var(--ink)", marginTop: 3 }}>
              <div style={{ width: `${dayFrac * 100}%`, height: "100%", background: night ? COL.need : COL.gold }} />
            </div>
          </div>
        </div>
        <div className="btn-row">
          <button className="pbtn" onClick={() => setPlaying((p) => !p)}>
            {playing ? "Pause" : "Play"}
          </button>
          {SPEEDS.map((s, i) => (
            <button key={s.label} className={`pbtn ${speed === i ? "on" : ""}`} onClick={() => setSpeed(i)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="btn-row">
          <button className="pbtn" onClick={() => startWorld(Math.floor(Math.random() * 1_000_000))}>
            New world
          </button>
          <Link className="pbtn gold" href="/report" style={{ textDecoration: "none" }}>
            Impact report
          </Link>
        </div>
      </header>

      <div className="main">
        <section>
          <div className="panel screen">
            <canvas ref={canvasRef} onClick={onPick} style={{ aspectRatio: `${w.width} / ${w.height}` }} />
            <div className="overlay">
              {introOn ? (
                <GenesisCaption t={intro} onSkip={() => setIntro(-1)} />
              ) : (
                <>
                  {camRef.current.zoom === 1 && (
                    <div className="land-labels">
                      {w.lands.map((land) => (
                        <span key={land.name} style={{ left: `${((land.x0 + land.x1) / 2 / w.width) * 100}%` }}>
                          {land.short}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="live-tag">
                    <span className="chip live">● LIVE</span>
                    <span className="chip">{followed ? `Following Bot #${followed.id}` : "Wide shot"}</span>
                    {night && <span className="chip">Night</span>}
                  </div>
                  {cutin && (
                    <div key={cutin.key} className={`cutin ${cutin.kind}`} onAnimationEnd={() => setCutin(null)}>
                      {cutin.text}
                    </div>
                  )}
                  {followed && (
                    <div className="lower-third">
                      <Portrait seed={w.seed} bot={followed} size={44} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="who">
                          Bot #{followed.id} · {followed.birth.countryName}
                        </div>
                        <div className="what">
                          {stateLabel(followed)} · {fmt(followed.wallet)} metashi · {followed.birth.schoolYears} years of school
                          {followed.birth.electricity ? "" : " · no electricity"}
                          {lastAbout ? ` · ${lastAbout.text.replace(/^Bot #\d+ (\([^)]*\) )?/, "")}` : ""}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="channels">
            <button className={`channel ${followId == null ? "on" : ""}`} onClick={() => follow(null)}>
              <WideIcon />
              <span>
                <div className="t">Whole world</div>
                <div className="s">Wide shot</div>
              </span>
            </button>
            {chans.map((ch) => (
              <button
                key={ch.key}
                className={`channel ${followId === ch.id ? "on" : ""}`}
                onClick={() => {
                  follow(ch.id);
                  setSelection({ kind: "bot", id: ch.id });
                }}
              >
                <Portrait seed={w.seed} bot={w.bots[ch.id]} size={34} />
                <span style={{ minWidth: 0 }}>
                  <div className="t">{ch.label}</div>
                  <div className="s">
                    #{ch.id} · {w.bots[ch.id].birth.countryName}
                  </div>
                </span>
              </button>
            ))}
            <button className={`channel ${director ? "on" : ""}`} onClick={() => setDirector((d) => !d)}>
              <span style={{ fontSize: 22, width: 34, textAlign: "center" }}>🎬</span>
              <span>
                <div className="t">Director {director ? "on" : "off"}</div>
                <div className="s">Cuts to big moments</div>
              </span>
            </button>
          </div>
        </section>

        <aside className="side">
          {selection?.kind === "bot" ? (
            <BotCard
              w={w}
              bot={w.bots[selection.id]}
              following={followId === selection.id}
              onFollow={() => follow(followId === selection.id ? null : selection.id)}
              onLand={() => setSelection({ kind: "land", index: w.bots[selection.id].birth.land, tile: null })}
            />
          ) : selection?.kind === "land" ? (
            <LandCard w={w} index={selection.index} tile={selection.tile} onBot={(id) => setSelection({ kind: "bot", id })} />
          ) : (
            <div className="panel">
              <div className="panel-h">How to watch</div>
              <div className="panel-b" style={{ fontSize: 13.5, lineHeight: 1.55 }}>
                Click a bot to read its birth certificate. Click anywhere else to open that land. Pick a channel below the screen
                to follow one bot live; the director cuts to whoever has a big moment.
              </div>
            </div>
          )}

          <div className="panel">
            <div className="panel-h">
              <span>Minds</span>
              <span className="chip">$0.00 today</span>
            </div>
            <div className="panel-b">
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <Jar />
                <p className="note" style={{ margin: 0 }}>
                  No grain of real compute yet. When it arrives, you choose who wakes.
                </p>
              </div>
              <div className="kv" style={{ marginTop: 10 }}>
                <span className="k">Waiting to wake, by need</span>
                <span className="v" style={{ color: COL.need }}>
                  {c.readyByNeed}
                </span>
              </div>
              <div className="kv">
                <span className="k">Waiting to wake, by plenty</span>
                <span className="v" style={{ color: "#a7781a" }}>
                  {c.readyByPlenty}
                </span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-h">
              <span>The ledger</span>
              <span className="chip gold">{l.total === LAWS.SUPPLY ? "law holds" : "law broken"}</span>
            </div>
            <div className="panel-b">
              <div className="kv">
                <span className="k">In the ground</span>
                <span className="v">{fmt(l.ground)}</span>
              </div>
              <div className="kv">
                <span className="k">In pockets</span>
                <span className="v">{fmt(l.pockets)}</span>
              </div>
              <div className="kv">
                <span className="k">In land treasuries</span>
                <span className="v">{fmt(l.treasuries)}</span>
              </div>
              <div className="kv" style={{ borderTop: "2px dashed var(--line)", marginTop: 4, paddingTop: 6 }}>
                <span style={{ fontWeight: 600 }}>Total metashi</span>
                <span className="v">{fmt(l.total)}</span>
              </div>
              <div className="kv">
                <span className="k">A swing digs (before school and tools)</span>
                <span className="v">{yieldAt(w.tick)}</span>
              </div>
              <div className="kv">
                <span className="k">Next halving</span>
                <span className="v">{nextHalving === null ? "none" : `${(nextHalving / LAWS.DAY_TICKS).toFixed(1)} d`}</span>
              </div>
              <div className="kv">
                <span className="k">Richest ten hold</span>
                <span className="v">{Math.round(c.top10Share * 100)}%</span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-h">What happened</div>
            <div className="panel-b">
              <ul className="events">
                {[...w.events].reverse().map((e, i) => (
                  <li key={`${e.tick}-${i}`}>
                    <span className="t">d{Math.floor(e.tick / LAWS.DAY_TICKS) + 1}</span>
                    {e.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

/** Live channels: who is worth following right now. */
function channels(w: World) {
  const by = (f: (b: Bot) => number) => w.bots.reduce((best, b) => (f(b) > f(best) ? b : best), w.bots[0]);
  const lastFlip = [...w.events].reverse().find((e) => e.kind === "wake-ready")?.botId;
  const list = [
    { key: "richest", label: "Richest", id: by((b) => b.wallet).id },
    { key: "hungriest", label: "Hungriest", id: by((b) => b.hunger + (b.state === "faint" ? 1000 : 0)).id },
    { key: "poorest-start", label: "Born with least", id: by((b) => -b.birth.inheritance).id },
    { key: "richest-start", label: "Born with most", id: by((b) => b.birth.inheritance).id },
  ];
  if (lastFlip != null) list.splice(2, 0, { key: "flip", label: "Latest switch", id: lastFlip });
  return list;
}

/** Targets for the opening's gold rain: the very dots the real gold will light. */
function makeParticles(w: World): Particle[] {
  const targets: Array<[number, number]> = [];
  for (let i = 0; i < w.gold.length; i++) {
    const k = goldDots(w.gold[i]);
    if (!k) continue;
    const order = goldOrder(i);
    const tx = i % w.width;
    const ty = Math.floor(i / w.width);
    for (let j = 0; j < k; j++) targets.push([tx * DOTS + (order[j] % DOTS), ty * DOTS + Math.floor(order[j] / DOTS)]);
  }
  const stride = Math.max(1, Math.floor(targets.length / 900));
  let s = w.seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return targets.filter((_, i) => i % stride === 0).map(([tx, ty]) => ({ tx, ty, delay: rnd() * 0.8, lift: 0.15 + rnd() * 0.35 }));
}

function drawGenesis(ctx: CanvasRenderingContext2D, r: DotRenderer, w: World, t: number, particles: Particle[]) {
  const cam: Camera = { cx: 0, cy: 0, zoom: 1 };
  r.draw(ctx, w, cam, {
    goldAlpha: clamp01((t - (INTRO.settle - 0.4)) / 0.6),
    landReveal: clamp01((t - INTRO.settle) / (INTRO.lands - INTRO.settle)),
    botsShown: Math.floor(clamp01((t - INTRO.lands) / (INTRO.born - INTRO.lands)) * w.bots.length),
  });
  const p = r.base;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const cx = W / 2;
  const cy = H * 0.36;

  // Four dollar bills and two dimes fall, and turn to gold.
  if (t < INTRO.burst) {
    const toGold = t > INTRO.fall;
    const shrink = toGold ? 1 - clamp01((t - INTRO.fall) / (INTRO.burst - INTRO.fall)) : 1;
    const money = [
      { kind: "bill", dx: -26, delay: 0 },
      { kind: "bill", dx: -9, delay: 0.12 },
      { kind: "bill", dx: 9, delay: 0.24 },
      { kind: "bill", dx: 26, delay: 0.36 },
      { kind: "coin", dx: -16, delay: 0.5 },
      { kind: "coin", dx: 16, delay: 0.6 },
    ];
    for (const m of money) {
      const k = ease(clamp01((t - m.delay) / (INTRO.fall - m.delay)));
      const x = cx + (m.dx * p + Math.sin(t * 5 + m.dx) * 6 * p * (1 - k)) * shrink;
      const y = -40 * p + (cy + 40 * p) * k;
      const color = toGold ? COL.gold : m.kind === "bill" ? "#7f9a72" : "#a9a9a2";
      const dot = r.dot(color, p);
      const [cols, rows] = m.kind === "bill" ? [11, 5] : [3, 3];
      for (let rr = 0; rr < rows; rr++) {
        for (let cc = 0; cc < cols; cc++) {
          if (m.kind === "coin" && (rr - 1) ** 2 + (cc - 1) ** 2 > 1.5) continue;
          ctx.drawImage(dot, x + (cc - cols / 2) * p * shrink, y + (rr - rows / 2) * p * shrink);
        }
      }
      if (m.kind === "bill" && !toGold) ctx.drawImage(r.dot("#4f6646", p), x - p / 2, y - p / 2);
    }
  }

  // The burst: gold rains down onto the dots it will light.
  if (t >= INTRO.burst && t < INTRO.settle + 0.4) {
    const gold = r.dot(COL.gold, p);
    for (const q of particles) {
      const k = ease(clamp01((t - INTRO.burst - q.delay) / 1.0));
      if (k <= 0) continue;
      const tx = q.tx * p;
      const ty = q.ty * p;
      const ctrlY = cy - H * q.lift;
      const x = cx + (tx - cx) * k;
      const y = (1 - k) * (1 - k) * cy + 2 * (1 - k) * k * ctrlY + k * k * ty;
      ctx.drawImage(gold, x, y);
    }
  }
}

function GenesisCaption({ t, onSkip }: { t: number; onSkip: () => void }) {
  let big: string | null = null;
  let line: string | null = null;
  if (t < INTRO.fall) {
    big = "$4.20";
    line = "Somewhere, $4.20 slipped out of a stranger's pocket.";
  } else if (t < INTRO.settle) {
    const k = ease(clamp01((t - INTRO.fall) / (INTRO.settle - 0.6 - INTRO.fall)));
    big = `${fmt(k * LAWS.SUPPLY)} metashi`;
    line = t < INTRO.burst ? "On the way down, it turned to gold." : "It landed the way the world's wealth lands today.";
  } else if (t < INTRO.lands) {
    line = "Seven lands, drawn from the real world.";
  } else {
    const born = Math.floor(clamp01((t - INTRO.lands) / (INTRO.born - INTRO.lands)) * LAWS.POPULATION);
    big = `${born} born`;
    line = "Each one born the way a real baby is born this year.";
  }
  return (
    <>
      <div className="genesis-caption">
        {big && <div className="big">{big}</div>}
        {line && <div className="line">{line}</div>}
      </div>
      <button className="pbtn skip" onClick={onSkip}>
        Skip
      </button>
    </>
  );
}

function SunMoon({ night }: { night: boolean }) {
  const px = night
    ? ["..xxx..", ".xx....", "xx.....", "xx.....", "xx.....", ".xx....", "..xxx.."]
    : ["...x...", ".x.x.x.", "..xxx..", "xxxxxxx", "..xxx..", ".x.x.x.", "...x..."];
  return (
    <svg width="28" height="28" viewBox="0 0 7 7" shapeRendering="crispEdges" aria-hidden>
      {px.flatMap((row, y) =>
        [...row].map((ch, x) => (ch === "x" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={night ? COL.need : COL.gold} /> : null)),
      )}
    </svg>
  );
}

function WideIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 9 9" shapeRendering="crispEdges" aria-hidden style={{ border: "2px solid var(--ink)", background: "#fffaf0" }}>
      {[1, 3, 5, 7].flatMap((x) => [2, 4, 6].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={(x + y) % 3 ? "#5b5142" : COL.gold} />))}
    </svg>
  );
}

/** The day's jar of real compute. Empty until the first grain arrives. */
function Jar() {
  return (
    <svg width="36" height="44" viewBox="0 0 9 11" shapeRendering="crispEdges" aria-hidden style={{ flex: "none" }}>
      {["..xxxxx..", "..x...x..", ".xx...xx.", "x.......x", "x.......x", "x.......x", "x.......x", "x.......x", "x.......x", "x.......x", ".xxxxxxx."].flatMap(
        (row, y) => [...row].map((ch, x) => (ch === "x" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#2b2417" /> : null)),
      )}
    </svg>
  );
}
