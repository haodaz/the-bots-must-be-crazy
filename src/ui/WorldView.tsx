"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ERA_TICKS, LAWS, isNight, rainOf } from "@/engine/laws.ts";
import { census, createWorld, ledger, step, type Bot, type World, type WorldEvent } from "@/engine/world.ts";
import { AreaCard, BotCard, CountryCard, Portrait, fmt, stateLabel } from "./cards.tsx";
import { BUFFER, COL, MapRenderer, clampCamera, fitCamera, toScreen, toWorld, type Camera, type Rect } from "./map.ts";

const SPEEDS = [
  { label: "1×", ticks: 1 },
  { label: "10×", ticks: 10 },
  { label: "50×", ticks: 50 },
];

/** The opening, in seconds. */
const INTRO = { fall: 1.8, burst: 2.6, land: 4.0, settle: 4.4, borders: 5.6, born: 7.4, end: 8.4 };
const FOLLOW_ZOOM = 6;

type Selection =
  | { kind: "bot"; id: number }
  | { kind: "country"; ci: number }
  | { kind: "area"; rect: Rect }
  | null;
type Cutin = { key: number; text: string; kind: "need" | "gold" };
type Particle = { tx: number; ty: number; delay: number; lift: number };
type Drag = { mode: "maybe" | "box" | "pan"; px: number; py: number; cam: Camera; rect: Rect | null };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export default function WorldView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World>(createWorld(1));
  const rendererRef = useRef<MapRenderer | null>(null);
  const camRef = useRef<Camera>(fitCamera(worldRef.current));
  const zoomTargetRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const introStartRef = useRef<number | null>(null);
  const lastEventRef = useRef<WorldEvent | null>(null);
  const lastCutRef = useRef(0);
  const rotateRef = useRef(0);
  const dragRef = useRef<Drag | null>(null);

  const [, setFrame] = useState(0);
  const [intro, setIntro] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [selection, setSelection] = useState<Selection>(null);
  const [followId, setFollowId] = useState<number | null>(null);
  const [director, setDirector] = useState(false);
  const [cutin, setCutin] = useState<Cutin | null>(null);

  const followRef = useRef(followId);
  followRef.current = followId;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const directorRef = useRef(director);
  directorRef.current = director;

  const follow = useCallback((id: number | null) => {
    setFollowId(id);
    if (id == null) {
      zoomTargetRef.current = null;
      return;
    }
    const w = worldRef.current;
    zoomTargetRef.current = fitCamera(w).s * FOLLOW_ZOOM;
  }, []);

  const startWorld = useCallback(
    (planet: "earth" | "new") => {
      const seed = Math.floor(Math.random() * 1_000_000);
      const w = createWorld(seed, {}, { planet });
      worldRef.current = w;
      camRef.current = fitCamera(w);
      lastEventRef.current = w.events[w.events.length - 1] ?? null;
      particlesRef.current = makeParticles(w);
      introStartRef.current = null;
      setIntro(0);
      setSelection(null);
      follow(null);
    },
    [follow],
  );

  useEffect(() => {
    rendererRef.current = new MapRenderer();
    particlesRef.current = makeParticles(worldRef.current);
    lastEventRef.current = worldRef.current.events[worldRef.current.events.length - 1] ?? null;
  }, []);

  // Wheel zooms around the cursor (a non-passive listener, so the page doesn't scroll).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const w = worldRef.current;
      const { px, py } = bufferPoint(canvas, e.clientX, e.clientY);
      const cam = camRef.current;
      const at = toWorld(cam, px, py);
      const s = cam.s * Math.exp(-e.deltaY * 0.0016);
      zoomTargetRef.current = null;
      const next = followRef.current != null ? { ...cam, s } : { s, cx: at.x - (px - BUFFER.width / 2) / s, cy: at.y - (py - BUFFER.height / 2) / s };
      camRef.current = clampCamera(w, next);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  // Keyboard: arrows or WASD to pan, + and − to zoom, Esc to clear.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const w = worldRef.current;
      const cam = camRef.current;
      const step_ = 60 / cam.s;
      const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0], ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1] };
      if (moves[e.key]) {
        follow(null);
        camRef.current = clampCamera(w, { ...cam, cx: cam.cx + moves[e.key][0] * step_, cy: cam.cy + moves[e.key][1] * step_ });
      } else if (e.key === "+" || e.key === "=") zoomBy(1.4);
      else if (e.key === "-") zoomBy(1 / 1.4);
      else if (e.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [follow]);

  function zoomBy(f: number) {
    zoomTargetRef.current = null;
    camRef.current = clampCamera(worldRef.current, { ...camRef.current, s: camRef.current.s * f });
  }

  useEffect(() => {
    let raf = 0;
    let lastHud = 0;
    const loop = (now: number) => {
      const canvas = canvasRef.current;
      const r = rendererRef.current;
      const w = worldRef.current;
      if (canvas && r) {
        if (canvas.width !== BUFFER.width) {
          canvas.width = BUFFER.width;
          canvas.height = BUFFER.height;
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
          let cam = camRef.current;
          if (zoomTargetRef.current != null) cam = { ...cam, s: cam.s + (zoomTargetRef.current - cam.s) * 0.12 };
          if (followRef.current != null) {
            const b = w.bots[followRef.current];
            cam = { ...cam, cx: cam.cx + (b.x + 0.5 - cam.cx) * 0.12, cy: cam.cy + (b.y + 0.5 - cam.cy) * 0.12 };
          }
          camRef.current = cam = clampCamera(w, cam);
          const sel = selectionRef.current;
          r.draw(ctx, w, cam, {
            selectedId: sel?.kind === "bot" ? sel.id : null,
            followId: followRef.current,
            area: sel?.kind === "area" ? sel.rect : null,
            dragging: dragRef.current?.mode === "box" ? dragRef.current.rect : null,
            highlightCountry: sel?.kind === "country" ? sel.ci : null,
          });
          const mini = miniRef.current;
          if (mini) {
            if (mini.width !== w.width) {
              mini.width = w.width;
              mini.height = w.height;
            }
            r.drawMini(mini.getContext("2d")!, w, cam);
          }
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

  /** New events: cut-ins for big moments; the director (if on) cuts to whoever they happened to. */
  function watchEvents(now: number) {
    const w = worldRef.current;
    const fresh: WorldEvent[] = [];
    for (let i = w.events.length - 1; i >= 0 && w.events[i] !== lastEventRef.current; i--) fresh.unshift(w.events[i]);
    if (w.events.length) lastEventRef.current = w.events[w.events.length - 1];
    for (const e of fresh) {
      if (e.kind === "wake-ready" && e.botId != null) {
        const b = w.bots[e.botId];
        setCutin({ key: now + e.botId, kind: b.wake === "need" ? "need" : "gold", text: `Bot #${b.id} · ${b.birth.countryName} · ${b.wake} switch flipped` });
        if (directorRef.current && now - lastCutRef.current > 4000) {
          lastCutRef.current = now;
          follow(e.botId);
        }
      } else if (e.kind === "rain") {
        setCutin({ key: now, kind: "gold", text: e.text.split(".")[0] });
      }
    }
    if (directorRef.current && now - lastCutRef.current > 12000) {
      lastCutRef.current = now;
      const picks = channels(w).filter((c) => c.id !== followRef.current);
      follow(picks[rotateRef.current++ % picks.length].id);
    }
  }

  // Pointer: left-drag draws a red selection box, a click picks; right-drag (or shift-drag) pans.
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (intro >= 0) return;
    const { px, py } = bufferPoint(e.currentTarget, e.clientX, e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);
    const pan = e.button === 2 || e.button === 1 || e.shiftKey;
    dragRef.current = { mode: pan ? "pan" : "maybe", px, py, cam: camRef.current, rect: null };
    if (pan) follow(null);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const { px, py } = bufferPoint(e.currentTarget, e.clientX, e.clientY);
    if (d.mode === "pan") {
      camRef.current = clampCamera(worldRef.current, { ...d.cam, cx: d.cam.cx - (px - d.px) / d.cam.s, cy: d.cam.cy - (py - d.py) / d.cam.s });
      return;
    }
    if (d.mode === "maybe" && Math.hypot(px - d.px, py - d.py) > 14) d.mode = "box";
    if (d.mode === "box") {
      const a = toWorld(camRef.current, d.px, d.py);
      const b = toWorld(camRef.current, px, py);
      d.rect = { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.mode === "box" && d.rect) {
      setSelection({ kind: "area", rect: d.rect });
      return;
    }
    if (d.mode !== "maybe") return;
    const w = worldRef.current;
    const pt = toWorld(camRef.current, d.px, d.py);
    let best: Bot | null = null;
    let bestD = Math.max(0.9, 14 / camRef.current.s);
    for (const b of w.bots) {
      const dist = Math.hypot(b.x + 0.5 - pt.x, b.y + 0.5 - pt.y);
      if (dist < bestD) [best, bestD] = [b, dist];
    }
    if (best) {
      setSelection({ kind: "bot", id: best.id });
      if (followRef.current != null) follow(best.id);
      return;
    }
    const tx = Math.floor(pt.x);
    const ty = Math.floor(pt.y);
    const ci = tx >= 0 && ty >= 0 && tx < w.width && ty < w.height ? w.geo.cells[ty * w.width + tx] : -1;
    setSelection(ci >= 0 ? { kind: "country", ci } : null);
  };

  const onMini = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons !== 1 && e.type !== "pointerdown") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const w = worldRef.current;
    follow(null);
    camRef.current = clampCamera(w, {
      ...camRef.current,
      s: Math.max(camRef.current.s, fitCamera(w).s * 2.5),
      cx: ((e.clientX - rect.left) / rect.width) * w.width,
      cy: ((e.clientY - rect.top) / rect.height) * w.height,
    });
  };

  const w = worldRef.current;
  const l = ledger(w);
  const c = census(w);
  const cam = camRef.current;
  const day = Math.floor(w.tick / LAWS.DAY_TICKS) + 1;
  const dayFrac = (w.tick % LAWS.DAY_TICKS) / LAWS.DAY_TICKS;
  const night = isNight(w.tick);
  const nextRainIn = ERA_TICKS - (w.tick % ERA_TICKS);
  const nextRain = Math.min(w.sky, rainOf(w.rains));
  const followed = followId != null ? w.bots[followId] : null;
  const lastAbout = followed ? [...w.events].reverse().find((e) => e.botId === followed.id) : null;
  const chans = channels(w);
  const introOn = intro >= 0;
  const zoomedOut = cam.s < fitCamera(w).s * 2.2;

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
          <button className={`pbtn ${w.geo.kind === "earth" ? "on" : ""}`} onClick={() => startWorld("earth")}>
            Earth
          </button>
          <button className={`pbtn ${w.geo.kind === "planet" ? "on" : ""}`} onClick={() => startWorld("new")}>
            New planet
          </button>
          <Link className="pbtn gold" href="/report" style={{ textDecoration: "none" }}>
            Impact report
          </Link>
        </div>
      </header>

      <div className="main">
        <section>
          <div className="panel screen">
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onContextMenu={(e) => e.preventDefault()}
              style={{ aspectRatio: `${BUFFER.width} / ${BUFFER.height}`, touchAction: "none" }}
            />
            <div className="overlay">
              {introOn ? (
                <GenesisCaption t={intro} w={w} onSkip={() => setIntro(-1)} />
              ) : (
                <>
                  <MapLabels w={w} cam={cam} zoomedOut={zoomedOut} />
                  <div className="live-tag">
                    <span className="chip live">● LIVE</span>
                    <span className="chip">{w.geo.kind === "earth" ? "Earth" : `Planet ${w.geo.name}`}</span>
                    <span className="chip">{followed ? `Following Bot #${followed.id}` : zoomedOut ? "Whole world" : "Exploring"}</span>
                    {night && <span className="chip">Night</span>}
                  </div>
                  <div className="zoom-box">
                    <button className="pbtn" onClick={() => zoomBy(1.5)} aria-label="Zoom in" style={{ pointerEvents: "auto" }}>
                      +
                    </button>
                    <button className="pbtn" onClick={() => zoomBy(1 / 1.5)} aria-label="Zoom out" style={{ pointerEvents: "auto" }}>
                      −
                    </button>
                    <button
                      className="pbtn"
                      onClick={() => {
                        follow(null);
                        camRef.current = fitCamera(w);
                      }}
                      style={{ pointerEvents: "auto" }}
                    >
                      Fit
                    </button>
                  </div>
                  <canvas ref={miniRef} className="minimap" onPointerDown={onMini} onPointerMove={onMini} />
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
          <p className="note" style={{ margin: "10px 2px 0" }}>
            Scroll to zoom · drag to draw a selection box · right-drag or shift-drag to move · click a bot or a country · the minimap jumps
          </p>

          <div className="channels">
            <button className={`channel ${followId == null ? "on" : ""}`} onClick={() => (follow(null), (camRef.current = fitCamera(w)))}>
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
              <DirectorIcon />
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
              onCountry={() => setSelection({ kind: "country", ci: w.bots[selection.id].birth.countryIdx })}
            />
          ) : selection?.kind === "country" ? (
            <CountryCard w={w} ci={selection.ci} onBot={(id) => setSelection({ kind: "bot", id })} />
          ) : selection?.kind === "area" ? (
            <AreaCard w={w} rect={selection.rect} onBot={(id) => setSelection({ kind: "bot", id })} onCountry={(ci) => setSelection({ kind: "country", ci })} />
          ) : (
            <div className="panel">
              <div className="panel-h">How to watch</div>
              <div className="panel-b" style={{ fontSize: 13.5, lineHeight: 1.55 }}>
                Gold is money: it glows where an economy is, like city lights at night. Bots work there to earn it and spend it back
                on food. Click a bot for its birth certificate, a country for its story, or drag a box to see everyone in an area.
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
                <span className="k">Still in the sky</span>
                <span className="v">{fmt(l.sky)}</span>
              </div>
              <div className="kv">
                <span className="k">In the economies</span>
                <span className="v">{fmt(l.economy)}</span>
              </div>
              <div className="kv">
                <span className="k">In pockets</span>
                <span className="v">{fmt(l.pockets)}</span>
              </div>
              <div className="kv">
                <span className="k">In treasuries</span>
                <span className="v">{fmt(l.treasuries)}</span>
              </div>
              <div className="kv" style={{ borderTop: "2px dashed var(--line)", marginTop: 4, paddingTop: 6 }}>
                <span style={{ fontWeight: 600 }}>Total metashi</span>
                <span className="v">{fmt(l.total)}</span>
              </div>
              <div className="kv">
                <span className="k">Next halving rain</span>
                <span className="v">
                  {fmt(nextRain)} in {(nextRainIn / LAWS.DAY_TICKS).toFixed(1)} d
                </span>
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

function bufferPoint(el: HTMLElement, clientX: number, clientY: number) {
  const r = el.getBoundingClientRect();
  return { px: ((clientX - r.left) / r.width) * BUFFER.width, py: ((clientY - r.top) / r.height) * BUFFER.height };
}

/** Region names when the whole world is in view; country names when zoomed in. */
function MapLabels({ w, cam, zoomedOut }: { w: World; cam: Camera; zoomedOut: boolean }) {
  const places = zoomedOut
    ? w.lands.map((land, i) => {
        const tiles = w.countries.filter((c) => c.land === i).flatMap((c) => c.tiles);
        return { key: land.name, label: land.short, tiles, big: true };
      })
    : w.countries
        .map((c) => ({ key: c.iso3, label: c.name, tiles: c.tiles, big: false }))
        .filter((p) => p.tiles.length >= 3);
  const shown = places
    .map((p) => {
      const x = p.tiles.reduce((a, t) => a + (t % w.width), 0) / p.tiles.length + 0.5;
      const y = p.tiles.reduce((a, t) => a + Math.floor(t / w.width), 0) / p.tiles.length + 0.5;
      const { px, py } = toScreen(cam, x, y);
      return { ...p, px, py };
    })
    .filter((p) => p.px > 40 && p.px < BUFFER.width - 40 && p.py > 30 && p.py < BUFFER.height - 30)
    .sort((a, b) => b.tiles.length - a.tiles.length)
    .slice(0, zoomedOut ? 7 : 18);
  return (
    <div className="map-labels">
      {shown.map((p) => (
        <span key={p.key} className={p.big ? "big" : ""} style={{ left: `${(p.px / BUFFER.width) * 100}%`, top: `${(p.py / BUFFER.height) * 100}%` }}>
          {p.label}
        </span>
      ))}
    </div>
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

/** The opening's gold rain lands on the economies, at the whole-world view. */
function makeParticles(w: World): Particle[] {
  const cam = fitCamera(w);
  const lit: Array<[number, number]> = [];
  for (let i = 0; i < w.money.length; i++) {
    if (w.money[i] <= 0) continue;
    const n = Math.max(1, Math.min(6, Math.round(Math.log10(w.money[i]) - 2)));
    for (let k = 0; k < n; k++) lit.push([i % w.width, Math.floor(i / w.width)]);
  }
  let s = w.seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const stride = Math.max(1, Math.floor(lit.length / 900));
  return lit
    .filter((_, i) => i % stride === 0)
    .map(([x, y]) => {
      const { px, py } = toScreen(cam, x + rnd(), y + rnd());
      return { tx: px, ty: py, delay: rnd() * 0.8, lift: 0.15 + rnd() * 0.35 };
    });
}

function drawGenesis(ctx: CanvasRenderingContext2D, r: MapRenderer, w: World, t: number, particles: Particle[]) {
  const cam = fitCamera(w);
  r.draw(ctx, w, cam, {
    landReveal: clamp01((t - INTRO.burst) / (INTRO.land - INTRO.burst)),
    economy: clamp01((t - (INTRO.settle - 0.5)) / 0.6),
    borders: clamp01((t - INTRO.settle) / (INTRO.borders - INTRO.settle)),
    botsShown: Math.floor(clamp01((t - INTRO.borders) / (INTRO.born - INTRO.borders)) * w.bots.length),
  });
  const u = 7;
  const cx = BUFFER.width / 2;
  const cy = BUFFER.height * 0.36;

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
      const x = cx + (m.dx * u + Math.sin(t * 5 + m.dx) * 6 * u * (1 - k)) * shrink;
      const y = -40 * u + (cy + 40 * u) * k;
      const color = toGold ? COL.gold : m.kind === "bill" ? "#7f9a72" : "#a9a9a2";
      const dot = r.dot(color, u);
      const [cols, rows] = m.kind === "bill" ? [11, 5] : [3, 3];
      for (let rr = 0; rr < rows; rr++) {
        for (let cc = 0; cc < cols; cc++) {
          if (m.kind === "coin" && (rr - 1) ** 2 + (cc - 1) ** 2 > 1.5) continue;
          ctx.drawImage(dot, x + (cc - cols / 2) * u * shrink, y + (rr - rows / 2) * u * shrink);
        }
      }
      if (m.kind === "bill" && !toGold) ctx.drawImage(r.dot("#4f6646", u), x - u / 2, y - u / 2);
    }
  }

  // The burst: gold rains down onto the economies it will become.
  if (t >= INTRO.burst && t < INTRO.settle + 0.3) {
    const gold = r.dot(COL.gold, 6);
    for (const q of particles) {
      const k = ease(clamp01((t - INTRO.burst - q.delay) / 1.0));
      if (k <= 0) continue;
      const ctrlY = cy - BUFFER.height * q.lift;
      const x = cx + (q.tx - cx) * k;
      const y = (1 - k) * (1 - k) * cy + 2 * (1 - k) * k * ctrlY + k * k * q.ty;
      ctx.drawImage(gold, x - 3, y - 3);
    }
  }
}

function GenesisCaption({ t, w, onSkip }: { t: number; w: World; onSkip: () => void }) {
  let big: string | null = null;
  let line: string | null = null;
  if (t < INTRO.fall) {
    big = "$4.20";
    line = "Somewhere, $4.20 slipped out of a stranger's pocket.";
  } else if (t < INTRO.settle) {
    const k = ease(clamp01((t - INTRO.fall) / (INTRO.settle - 0.6 - INTRO.fall)));
    big = `${fmt(k * rainOf(0))} metashi`;
    line = t < INTRO.burst ? "On the way down, it turned to gold: the first of 21,000,000." : "It landed the way the world's wealth lands today.";
  } else if (t < INTRO.borders) {
    line = w.geo.kind === "earth" ? "217 countries, drawn from the real world." : `A new planet, ${w.geo.name}. The 217 countries on it are real.`;
  } else {
    const born = Math.floor(clamp01((t - INTRO.borders) / (INTRO.born - INTRO.borders)) * LAWS.POPULATION);
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

function PixelIcon({ rows, color, size = 28 }: { rows: string[]; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${rows[0].length} ${rows.length}`} shapeRendering="crispEdges" aria-hidden style={{ flex: "none" }}>
      {rows.flatMap((row, y) => [...row].map((ch, x) => (ch === "x" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={color} /> : null)))}
    </svg>
  );
}

function SunMoon({ night }: { night: boolean }) {
  return night ? (
    <PixelIcon color={COL.need} rows={["..xxx..", ".xx....", "xx.....", "xx.....", "xx.....", ".xx....", "..xxx.."]} />
  ) : (
    <PixelIcon color={COL.gold} rows={["...x...", ".x.x.x.", "..xxx..", "xxxxxxx", "..xxx..", ".x.x.x.", "...x..."]} />
  );
}

function WideIcon() {
  return (
    <PixelIcon
      size={34}
      color="#5b5142"
      rows={["xxxxxxxxx", "x.......x", "x.xx..x.x", "x.xxx.x.x", "x..x....x", "x....xx.x", "x...xxx.x", "x.......x", "xxxxxxxxx"]}
    />
  );
}

function DirectorIcon() {
  return (
    <PixelIcon
      size={34}
      color="#2b2417"
      rows={["x.x.x.x..", "xxxxxxx..", ".........", "xxxxxxx..", "x.....x.x", "x.....xxx", "x.....x.x", "xxxxxxx..", "........."]}
    />
  );
}

/** The day's jar of real compute. Empty until the first grain arrives. */
function Jar() {
  return (
    <PixelIcon
      size={36}
      color="#2b2417"
      rows={["..xxxxx..", "..x...x..", ".xx...xx.", "x.......x", "x.......x", "x.......x", "x.......x", "x.......x", "x.......x", "x.......x", ".xxxxxxx."]}
    />
  );
}
