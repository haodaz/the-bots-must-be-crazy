"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ERA_TICKS, LAWS, isNight, rainOf } from "@/engine/laws.ts";
import { census, createWorld, ledger, step, type Bot, type World, type WorldEvent } from "@/engine/world.ts";
import { AreaCard, BotCard, CountryCard, Portrait, fmt, stateLabel } from "./cards.tsx";
import { DEFS, HAND_MAX, HAND_START, PLAYS_PER_DAY, REACH, TURN_DAYS, dealDeck, playCard, type Card, type Role } from "@/engine/cards.ts";

const TURN_TICKS = TURN_DAYS * LAWS.DAY_TICKS;
import { GameCard, RoleCard } from "./GameCard.tsx";
import { LangSwitch, useLang } from "@/i18n.tsx";
import { Archive } from "./Archive.tsx";
import { Prologue, RoleTips, markSeen, seen } from "./Story.tsx";
import { BUFFER, COL, MAX_ZOOM, MapRenderer, clampCamera, fitCamera, toScreen, toWorld, type Camera, type Rect } from "./map.ts";

const SPEEDS = [
  { label: "1×", ticks: 1 },
  { label: "10×", ticks: 10 },
  { label: "50×", ticks: 50 },
];

/** The opening, in seconds. */
const INTRO = { fall: 1.8, burst: 3.4, land: 4.8, settle: 6.2, borders: 7.4, born: 9.2, end: 10.2 };
const FOLLOW_ZOOM = 6;

type Selection =
  | { kind: "bot"; id: number }
  | { kind: "country"; ci: number }
  | { kind: "area"; rect: Rect }
  | null;
type Cutin = { key: number; text: string; kind: "need" | "gold" };
type Particle = { tx: number; ty: number; delay: number; lift: number };
/** The player's seat at the table: a role, a deck, a hand, a day's plays. */
type Player = {
  role: Role | null;
  deck: Card[];
  hand: Card[];
  plays: number;
  kingdom: number | null;
  meId: number | null;
  chosen: number | null;
  pickKingdom: boolean;
  reveal: boolean;
  day: number;
  /** Card players take turns: the world waits at the start of each day until they press on. */
  waiting: boolean;
};
const newPlayer = (): Player => ({
  role: null,
  deck: [],
  hand: [],
  plays: 0,
  kingdom: null,
  meId: null,
  chosen: null,
  pickKingdom: false,
  reveal: false,
  day: 0,
  waiting: false,
});
const FAMILY_COLOR = { god: "#7fa7c9", king: "#b8463a", human: "#7e9b4f" } as const;

type Drag = { mode: "maybe" | "box" | "pan"; box: boolean; px: number; py: number; cam: Camera; rect: Rect | null };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export default function WorldView() {
  const { t } = useLang();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World>(createWorld(1, {}, { planet: "new" }));
  const rendererRef = useRef<MapRenderer | null>(null);
  const camRef = useRef<Camera>(fitCamera(worldRef.current));
  const zoomTargetRef = useRef<number | null>(null);
  /** While a zoom eases in, this world point stays under this screen point (buffer px). */
  const zoomAnchorRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const introStartRef = useRef<number | null>(null);
  const lastEventRef = useRef<WorldEvent | null>(null);
  const lastCutRef = useRef(0);
  const rotateRef = useRef(0);
  const dragRef = useRef<Drag | null>(null);
  const playerRef = useRef<Player>(newPlayer());
  const captionRef = useRef<{ title: string; sub: string } | undefined>(undefined);
  const aimRef = useRef<{ x: number; y: number } | null>(null);

  const [, setFrame] = useState(0);
  const [intro, setIntro] = useState(0);
  // The story shows before the first opening; afterwards it can be opened again from the top bar.
  const [story, setStory] = useState(() => !seen("story"));
  const storyRef = useRef(story);
  storyRef.current = story;
  const [tips, setTips] = useState<Role | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [boxMode, setBoxMode] = useState(false);
  const [grabbing, setGrabbing] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [followId, setFollowId] = useState<number | null>(null);
  const [director, setDirector] = useState(false);
  const [cutin, setCutin] = useState<Cutin | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [archive, setArchive] = useState(false);
  const endedRef = useRef(false);

  // The side panel opens when something is picked, and otherwise stays out of the map's way.
  useEffect(() => {
    if (selection) setDrawer(true);
  }, [selection]);

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
      playerRef.current = newPlayer();
      endedRef.current = false;
      setArchive(false);
      setIntro(0);
      setSelection(null);
      follow(null);
    },
    [follow],
  );

  // The board fills the window: its buffer follows the canvas size (capped, for speed).
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      let W = Math.round(el.clientWidth * dpr);
      let H = Math.round(el.clientHeight * dpr);
      const k = Math.min(1, 3000 / Math.max(1, W));
      W = Math.max(1, Math.round(W * k));
      H = Math.max(1, Math.round(H * k));
      if (W === BUFFER.width && H === BUFFER.height && el.width === W) return;
      const wasFit = camRef.current.s <= fitCamera(worldRef.current).s * 1.01;
      BUFFER.width = W;
      BUFFER.height = H;
      el.width = W;
      el.height = H;
      camRef.current = wasFit ? fitCamera(worldRef.current) : clampCamera(worldRef.current, camRef.current);
      particlesRef.current = makeParticles(worldRef.current);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    rendererRef.current = new MapRenderer();
    particlesRef.current = makeParticles(worldRef.current);
    lastEventRef.current = worldRef.current.events[worldRef.current.events.length - 1] ?? null;
  }, []);

  // Wheel and trackpad pinch zoom the map around the cursor (non-passive listeners, so the page neither scrolls
  // nor zooms). A pinch arrives as a wheel event with ctrlKey and small steps, so it gets a stronger factor.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const w = worldRef.current;
      const { px, py } = bufferPoint(canvas, e.clientX, e.clientY);
      const cam = camRef.current;
      const at = toWorld(cam, px, py);
      const s = cam.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0016));
      zoomTargetRef.current = null;
      zoomAnchorRef.current = null;
      const next = followRef.current != null ? { ...cam, s } : { s, cx: at.x - (px - BUFFER.width / 2) / s, cy: at.y - (py - BUFFER.height / 2) / s };
      camRef.current = clampCamera(w, next);
    };
    // A pinch anywhere else on the board (over a panel, the cards) must not zoom the whole page either.
    const noPageZoom = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    const noGesture = (e: Event) => e.preventDefault();
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("wheel", noPageZoom, { passive: false });
    window.addEventListener("gesturestart", noGesture);
    window.addEventListener("gesturechange", noGesture);
    return () => {
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("wheel", noPageZoom);
      window.removeEventListener("gesturestart", noGesture);
      window.removeEventListener("gesturechange", noGesture);
    };
  }, []);

  /** Double-click: ease in twice as close, keeping the spot under the cursor. */
  const onDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (intro >= 0) return;
    const { px, py } = bufferPoint(e.currentTarget, e.clientX, e.clientY);
    const at = toWorld(camRef.current, px, py);
    zoomAnchorRef.current = followRef.current != null ? null : { x: at.x, y: at.y, px, py };
    zoomTargetRef.current = camRef.current.s * 2;
  };

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
        r.caption = captionRef.current;
        if (canvas.width !== BUFFER.width || canvas.height !== BUFFER.height) {
          canvas.width = BUFFER.width;
          canvas.height = BUFFER.height;
        }
        const ctx = canvas.getContext("2d")!;
        // The opening waits while the story is open.
        if (introStartRef.current === null || storyRef.current) introStartRef.current = now;
        const t = (now - introStartRef.current) / 1000;
        if (intro >= 0) {
          drawGenesis(ctx, r, w, t, particlesRef.current);
          if (t >= INTRO.end) setIntro(-1);
        } else {
          const p = playerRef.current;
          if (!endedRef.current && w.tick >= LAWS.LIFE_DAYS * LAWS.DAY_TICKS) {
            endedRef.current = true;
            setArchive(true);
          }
          if (playing && p.role !== null && !p.reveal && !p.waiting && !endedRef.current) {
            for (let i = 0; i < SPEEDS[speed].ticks; i++) {
              step(w);
              // Card players: stop at the start of each turn (every few years), for their play.
              if (p.role !== "watch" && w.tick % TURN_TICKS === 0) break;
            }
          }
          newDay();
          watchEvents(now);
          let cam = camRef.current;
          if (zoomTargetRef.current != null) {
            cam = { ...cam, s: cam.s + (zoomTargetRef.current - cam.s) * 0.12 };
            const a = zoomAnchorRef.current;
            if (a) cam = { ...cam, cx: a.x - (a.px - BUFFER.width / 2) / cam.s, cy: a.y - (a.py - BUFFER.height / 2) / cam.s };
            if (Math.abs(zoomTargetRef.current - cam.s) < cam.s * 0.004 || cam.s >= fitCamera(w).s * MAX_ZOOM) {
              zoomTargetRef.current = null;
              zoomAnchorRef.current = null;
            }
          }
          if (followRef.current != null) {
            const b = w.bots[followRef.current];
            cam = { ...cam, cx: cam.cx + (b.x + 0.5 - cam.cx) * 0.12, cy: cam.cy + (b.y + 0.5 - cam.cy) * 0.12 };
          }
          camRef.current = cam = clampCamera(w, cam);
          const sel = selectionRef.current;
          const card = p.hand.find((c) => c.uid === p.chosen);
          const def = card ? DEFS[card.kind] : null;
          const aim = aimRef.current;
          const hoverNation = aim ? w.geo.cells[Math.floor(aim.y) * w.width + Math.floor(aim.x)] ?? -1 : -1;
          r.draw(ctx, w, cam, {
            selectedId: sel?.kind === "bot" ? sel.id : null,
            followId: followRef.current,
            area: sel?.kind === "area" ? sel.rect : null,
            dragging: dragRef.current?.mode === "box" ? dragRef.current.rect : null,
            highlightCountry:
              (def?.target === "nation" || p.pickKingdom) && hoverNation >= 0
                ? hoverNation
                : sel?.kind === "country"
                  ? sel.ci
                  : p.kingdom,
            aim: def?.target === "area" && aim && card ? { x: aim.x, y: aim.y, r: REACH[card.reach], color: FAMILY_COLOR[def.family] } : null,
            meId: p.meId,
          });
          const mini = miniRef.current;
          if (mini) {
            if (mini.width !== 320) {
              mini.width = 320;
              mini.height = 120;
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

  /** A new turn (every few years): draw a card (if the hand has room and the deck has cards) and get back the turn's play. */
  function newDay() {
    const p = playerRef.current;
    const turn = Math.floor(worldRef.current.tick / TURN_TICKS);
    if (turn === p.day) return;
    p.day = turn;
    const year = Math.floor(worldRef.current.tick / LAWS.DAY_TICKS);
    if (!p.role || p.role === "watch") return;
    p.plays = PLAYS_PER_DAY;
    p.waiting = true;
    const drew = p.deck.length > 0 && p.hand.length < HAND_MAX;
    if (drew) p.hand.push(p.deck.shift()!);
    setCutin({
      key: performance.now(),
      kind: "gold",
      text: t(drew ? "Year {n}. You drew a card. Play, then press on." : p.deck.length ? "Year {n}. Your hand is full. Play, then press on." : "Year {n}. Your deck is empty. Play, then press on.", { n: year + 1 }),
    });
  }

  function chooseRole(role: Role) {
    const w = worldRef.current;
    const p = playerRef.current;
    p.role = role;
    p.day = Math.floor(w.tick / TURN_TICKS);
    if (role !== "watch") {
      p.deck = dealDeck({ rng: w.seed * 31 + role.length * 7919 }, role);
      p.hand = p.deck.splice(0, HAND_START);
      p.plays = PLAYS_PER_DAY;
      p.waiting = true;
    }
    if (role === "king") p.pickKingdom = true;
    if (!seen(`role-${role}`)) setTips(role);
    if (role === "human") {
      // One draw, no redraw: the bots were born by the real lottery, so any of them is a fair draw.
      p.meId = Math.floor(Math.random() * w.bots.length);
      p.reveal = true;
      follow(p.meId);
      setSelection({ kind: "bot", id: p.meId });
    }
    setFrame((f) => f + 1);
  }

  function announce(text: string, kind: "need" | "gold" = "gold") {
    setCutin({ key: performance.now(), kind, text });
  }

  function play(card: Card, ctx: { at?: { x: number; y: number }; ci?: number }) {
    const p = playerRef.current;
    const r = playCard(worldRef.current, card, { ...ctx, kingdom: p.kingdom ?? undefined, botId: p.meId ?? undefined });
    if (!r.ok) {
      announce(t(r.key, r.params), "need");
      return;
    }
    p.hand = p.hand.filter((c) => c.uid !== card.uid);
    p.plays--;
    p.chosen = null;
    announce(t(r.key, r.params));
    setFrame((f) => f + 1);
  }

  function onCard(card: Card) {
    const p = playerRef.current;
    if (p.plays <= 0) return announce(t("You have played this turn's card. Wait for the next turn."), "need");
    const target = DEFS[card.kind].target;
    if (p.chosen === card.uid) {
      if (target === "world" || target === "kingdom" || target === "self") play(card, {});
      else p.chosen = null;
    } else p.chosen = card.uid;
    setFrame((f) => f + 1);
  }

  /** The turn button: let the years run, or skip ahead to the next turn if they are already running. */
  function nextDay() {
    const w = worldRef.current;
    const p = playerRef.current;
    if (p.waiting) {
      p.waiting = false;
      p.chosen = null;
    } else {
      const target = (Math.floor(w.tick / TURN_TICKS) + 1) * TURN_TICKS;
      while (w.tick < target) step(w);
      newDay();
    }
    setFrame((f) => f + 1);
  }

  /** New events: cut-ins for big moments; the director (if on) cuts to whoever they happened to. */
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
          text: t(b.wake === "need" ? "Bot #{id} · {nation} · need switch flipped" : "Bot #{id} · {nation} · plenty switch flipped", { id: b.id, nation: b.birth.countryName }),
        });
        if (directorRef.current && now - lastCutRef.current > 4000) {
          lastCutRef.current = now;
          follow(e.botId);
        }
      } else if (e.kind === "rain") {
        setCutin({ key: now, kind: "gold", text: t(e.key, e.params).split(/[.。]/)[0] });
      }
    }
    if (directorRef.current && now - lastCutRef.current > 12000) {
      lastCutRef.current = now;
      const picks = channels(w).filter((c) => c.id !== followRef.current);
      follow(picks[rotateRef.current++ % picks.length].id);
    }
  }

  // Pointer: drag moves the map, a click picks. In box mode (the button, or holding Shift) a drag draws the red
  // selection box instead. Right-drag always moves.
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (intro >= 0) return;
    const { px, py } = bufferPoint(e.currentTarget, e.clientX, e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);
    const box = e.button === 0 && (boxMode || e.shiftKey);
    dragRef.current = { mode: e.button === 0 ? "maybe" : "pan", box, px, py, cam: camRef.current, rect: null };
    if (e.button !== 0) {
      follow(null);
      setGrabbing(true);
    }
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    const { px, py } = bufferPoint(e.currentTarget, e.clientX, e.clientY);
    aimRef.current = toWorld(camRef.current, px, py);
    if (!d) return;
    if (d.mode === "pan") {
      camRef.current = clampCamera(worldRef.current, { ...d.cam, cx: d.cam.cx - (px - d.px) / d.cam.s, cy: d.cam.cy - (py - d.py) / d.cam.s });
      return;
    }
    if (d.mode === "maybe" && Math.hypot(px - d.px, py - d.py) > (d.box ? 14 : 6)) {
      d.mode = d.box ? "box" : "pan";
      if (d.mode === "pan") {
        follow(null);
        setGrabbing(true);
        camRef.current = clampCamera(worldRef.current, { ...d.cam, cx: d.cam.cx - (px - d.px) / d.cam.s, cy: d.cam.cy - (py - d.py) / d.cam.s });
        return;
      }
    }
    if (d.mode === "box") {
      const a = toWorld(camRef.current, d.px, d.py);
      const b = toWorld(camRef.current, px, py);
      d.rect = { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    setGrabbing(false);
    if (!d) return;
    if (d.mode === "box" && d.rect) {
      setSelection({ kind: "area", rect: d.rect });
      return;
    }
    if (d.mode !== "maybe") return;
    const w = worldRef.current;
    const pt = toWorld(camRef.current, d.px, d.py);
    // Cards and the king's choice take the click first.
    const p = playerRef.current;
    const nationAt = w.geo.cells[Math.floor(pt.y) * w.width + Math.floor(pt.x)] ?? -1;
    if (p.pickKingdom) {
      if (nationAt < 0) return announce(t("Choose land: click a nation to rule."), "need");
      p.kingdom = nationAt;
      p.pickKingdom = false;
      setSelection({ kind: "country", ci: nationAt });
      announce(t("You rule {nation}.", { nation: w.countries[nationAt].name }));
      return;
    }
    const card = p.hand.find((c) => c.uid === p.chosen);
    if (card) {
      const target = DEFS[card.kind].target;
      if (target === "area") return play(card, { at: pt });
      if (target === "nation") {
        if (nationAt < 0) return announce(t("Choose a nation, not the sea."), "need");
        return play(card, { ci: nationAt });
      }
    }
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
  const day = Math.min(LAWS.LIFE_DAYS, Math.floor(w.tick / LAWS.DAY_TICKS) + 1);
  const dayFrac = (w.tick % LAWS.DAY_TICKS) / LAWS.DAY_TICKS;
  const night = isNight(w.tick);
  const nextRainIn = ERA_TICKS - (w.tick % ERA_TICKS);
  const nextRain = Math.min(w.sky, rainOf(w.rains));
  const nextTurnYear = (Math.floor(w.tick / TURN_TICKS) + 1) * TURN_DAYS + 1;
  const followed = followId != null ? w.bots[followId] : null;
  const lastAbout = followed ? [...w.events].reverse().find((e) => e.botId === followed.id) : null;
  const chans = channels(w);
  const introOn = intro >= 0;
  captionRef.current = {
    title: t("Planet {name}", { name: w.geo.name }),
    sub: t("{a} nations · {b} lands · {c} souls", { a: w.countries.length, b: w.lands.length, c: w.bots.length }),
  };
  const player = playerRef.current;
  const playing_ = player.role != null && player.role !== "watch";
  const chosenCard = player.hand.find((c) => c.uid === player.chosen);
  const zoomedOut = cam.s < fitCamera(w).s * 2.2;

  return (
    <main className="board-screen">
      <canvas
        ref={canvasRef}
        className={`board ${boxMode ? "box-mode" : grabbing ? "grabbing" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      />

      <div className="board-overlay">
        {introOn ? (
          <GenesisCaption t={intro} w={w} onSkip={() => setIntro(-1)} />
        ) : (
          <>
            <MapLabels w={w} cam={cam} zoomedOut={zoomedOut} />
            {cutin && (
              <div key={cutin.key} className={`cutin ${cutin.kind}`} onAnimationEnd={() => setCutin(null)}>
                {cutin.text}
              </div>
            )}
          </>
        )}
      </div>

      <header className="hud-top">
        <div className="panel plaque logo">
          {t("The Bots Must Be Crazy")}
          <small>{t("Born by the real birth lottery. One grain of compute a year. No minds yet.")}</small>
        </div>
        <div className="panel plaque clock">
          <SunMoon night={night} />
          <div>
            <div className="num">{t("Year {n}", { n: day })}</div>
            <div style={{ width: 90, height: 6, border: "1.5px solid var(--ink)", marginTop: 3 }}>
              <div style={{ width: `${dayFrac * 100}%`, height: "100%", background: night ? COL.need : COL.gold }} />
            </div>
          </div>
        </div>
        <div className="spacer" />
        <div className="btn-row">
          <button className="pbtn" onClick={() => setPlaying((p) => !p)}>
            {playing ? t("Pause") : t("Play")}
          </button>
          {SPEEDS.map((sp, i) => (
            <button key={sp.label} className={`pbtn ${speed === i ? "on" : ""}`} onClick={() => setSpeed(i)}>
              {sp.label}
            </button>
          ))}
          <button
            className="pbtn"
            onClick={() => {
              setPlaying(false);
              setStory(true);
            }}
          >
            {t("Story")}
          </button>
          <button className="pbtn" onClick={() => startWorld("new")}>
            {t("New planet")}
          </button>
          <button className="pbtn" onClick={() => setArchive(true)}>
            {t("Archive")}
          </button>
          <Link className="pbtn gold" href="/report" style={{ textDecoration: "none" }}>
            {t("Impact report")}
          </Link>
          <LangSwitch />
        </div>
      </header>

      {!introOn && (
        <div className="hud-left">
          <div className="btn-row">
            <span className="chip live">● {t("LIVE")}</span>
            <span className="chip">{t("Planet {name}", { name: w.geo.name })}</span>
            <span className="chip">{followed ? t("Following Bot #{id}", { id: followed.id }) : zoomedOut ? t("Whole world") : t("Exploring")}</span>
            {night && <span className="chip">{t("Night")}</span>}
            {player.role && (
              <button className="chip gold chip-btn" title={t("How to play")} onClick={() => setTips(player.role)}>
                {player.role === "watch"
                  ? t("You are the Observer")
                  : player.role === "god"
                  ? t("You are God")
                  : player.role === "king"
                    ? player.kingdom != null
                      ? t("King of {nation}", { nation: w.countries[player.kingdom].name })
                      : t("King, choosing")
                    : t("You are Bot #{id}", { id: player.meId ?? 0 })}
                {" ?"}
              </button>
            )}
          </div>
          <div className="btn-row">
            <button className="pbtn" onClick={() => zoomBy(1.5)} aria-label="Zoom in">
              +
            </button>
            <button className="pbtn" onClick={() => zoomBy(1 / 1.5)} aria-label="Zoom out">
              −
            </button>
            <button
              className="pbtn"
              onClick={() => {
                follow(null);
                camRef.current = fitCamera(w);
              }}
            >
              {t("Fit")}
            </button>
            <button className={`pbtn ${boxMode ? "on" : ""}`} onClick={() => setBoxMode((v) => !v)} title={t("Drag a box to see everyone in an area. Or hold Shift and drag.")}>
              {t("Select area")}
            </button>
          </div>
          <canvas ref={miniRef} className="minimap" onPointerDown={onMini} onPointerMove={onMini} />
        </div>
      )}


      {followed && !introOn && (
        <div className={`lower-third ${playing_ ? "with-hand" : ""}`}>
          <Portrait seed={w.seed} bot={followed} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="who">
              Bot #{followed.id} · {followed.birth.countryName}
            </div>
            <div className="what">
              {t("{state} · {amount} metashi · {years} years of school", { state: t(stateLabel(followed)), amount: fmt(followed.wallet), years: followed.birth.schoolYears })}
              {followed.birth.electricity ? "" : ` · ${t("no electricity")}`}
              {lastAbout ? ` · ${t(lastAbout.key, lastAbout.params)}` : ""}
            </div>
          </div>
        </div>
      )}

      {!introOn && (
        <aside className={`drawer ${drawer ? "" : "closed"} ${playing_ ? "with-hand" : ""}`}>
          <button className="pbtn drawer-tab" onClick={() => setDrawer((d) => !d)} aria-label={drawer ? "Hide panel" : "Show panel"}>
            {drawer ? "›" : "‹"}
          </button>
          <div className="drawer-body">
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
                <div className="panel-h">{t("How to watch")}</div>
                <div className="panel-b" style={{ fontSize: 13.5, lineHeight: 1.55 }}>
                  {t(
                    "Gold is money: it glows where an economy is, like lamplight. Bots work there to earn it and spend it back on food. Scroll or pinch to zoom, double-click to look closer, drag to move. Press Select area (or hold Shift) and drag a box to see everyone in an area. Click a bot for its birth certificate, or a nation for its story.",
                  )}
                </div>
              </div>
            )}

            <div className="panel">
              <div className="panel-h">
                <span>{t("Minds")}</span>
                <span className="chip">{t("$0.00 today")}</span>
              </div>
              <div className="panel-b">
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <Jar />
                  <p className="note" style={{ margin: 0 }}>
                    {t("No grain of real compute yet. When it arrives, you choose who wakes.")}
                  </p>
                </div>
                <div className="kv" style={{ marginTop: 10 }}>
                  <span className="k">{t("Waiting to wake, by need")}</span>
                  <span className="v" style={{ color: COL.need }}>
                    {c.readyByNeed}
                  </span>
                </div>
                <div className="kv">
                  <span className="k">{t("Waiting to wake, by plenty")}</span>
                  <span className="v" style={{ color: "#a7781a" }}>
                    {c.readyByPlenty}
                  </span>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-h">
                <span>{t("The ledger")}</span>
                <span className="chip gold">{l.total === LAWS.SUPPLY ? t("law holds") : t("law broken")}</span>
              </div>
              <div className="panel-b">
                <div className="kv">
                  <span className="k">{t("Still in the sky")}</span>
                  <span className="v">{fmt(l.sky)}</span>
                </div>
                <div className="kv">
                  <span className="k">{t("In the economies")}</span>
                  <span className="v">{fmt(l.economy)}</span>
                </div>
                <div className="kv">
                  <span className="k">{t("In pockets")}</span>
                  <span className="v">{fmt(l.pockets)}</span>
                </div>
                <div className="kv">
                  <span className="k">{t("In treasuries")}</span>
                  <span className="v">{fmt(l.treasuries)}</span>
                </div>
                <div className="kv" style={{ borderTop: "2px dashed var(--line)", marginTop: 4, paddingTop: 6 }}>
                  <span style={{ fontWeight: 600 }}>{t("Total metashi")}</span>
                  <span className="v">{fmt(l.total)}</span>
                </div>
                <div className="kv">
                  <span className="k">{t("Next halving rain")}</span>
                  <span className="v">
                    {nextRain > 0 ? t("{amount} in {years} yrs", { amount: fmt(nextRain), years: (nextRainIn / LAWS.DAY_TICKS).toFixed(1) }) : t("The sky is empty.")}
                  </span>
                </div>
                <div className="kv">
                  <span className="k">{t("Richest ten hold")}</span>
                  <span className="v">{Math.round(c.top10Share * 100)}%</span>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-h">{t("What happened")}</div>
              <div className="panel-b">
                <ul className="events">
                  {[...w.events].reverse().map((e, i) => (
                    <li key={`${e.tick}-${i}`}>
                      <span className="t">{t("Y{n}", { n: Math.floor(e.tick / LAWS.DAY_TICKS) + 1 })}</span>
                      {t(e.key, e.params)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </aside>
      )}

      {!introOn && playing_ && (
        <div className="hand-tray">
          <div className="deck-pile" title={t("Cards left in your deck")}>
            <span className="n">{player.deck.length}</span>
          </div>
          <div className="hand">
            {player.hand.map((card, i) => {
              const mid = (player.hand.length - 1) / 2;
              return (
                <div key={card.uid} style={{ transform: `rotate(${(i - mid) * 4}deg) translateY(${Math.abs(i - mid) * 7}px)` }}>
                  <GameCard
                    card={card}
                    selected={player.chosen === card.uid}
                    disabled={player.plays <= 0}
                    hint={
                      player.chosen === card.uid
                        ? ["world", "kingdom", "self"].includes(DEFS[card.kind].target)
                          ? t("Click again to play")
                          : t("Now choose on the map")
                        : undefined
                    }
                    onClick={() => onCard(card)}
                  />
                </div>
              );
            })}
          </div>
          <button className={`next-day ${player.waiting ? "ready" : ""}`} onClick={nextDay}>
            {player.waiting ? t("Begin year {n}", { n: day }) : t("Skip to year {n}", { n: nextTurnYear })}
            <small>{player.plays > 0 ? t("1 play left") : t("played")}</small>
          </button>
        </div>
      )}

      {!introOn && chosenCard && ["area", "nation"].includes(DEFS[chosenCard.kind].target) && (
        <div className="aim-banner">
          {DEFS[chosenCard.kind].target === "area"
            ? t("{card}: click a place on the map", { card: t(DEFS[chosenCard.kind].title) })
            : t("{card}: click a nation", { card: t(DEFS[chosenCard.kind].title) })}
        </div>
      )}
      {!introOn && player.pickKingdom && <div className="aim-banner">{t("Click a nation to rule")}</div>}

      {!introOn && player.role === null && (
        <div className="veil">
          <div className="veil-inner">
            <div className="veil-title">
              {t("How will you enter this world?")}
              <small>{t("Planet {name}: {n} souls, born by the real birth lottery.", { name: w.geo.name, n: w.bots.length })}</small>
            </div>
            <div className="role-row">
              {(["watch", "god", "king", "human"] as Role[]).map((r) => (
                <RoleCard key={r} role={r} onClick={() => chooseRole(r)} />
              ))}
            </div>
          </div>
        </div>
      )}

      {!introOn && archive && <Archive w={w} ended={endedRef.current} onClose={() => setArchive(false)} />}

      {!introOn && tips && tips === player.role && !player.reveal && (
        <RoleTips
          role={tips}
          onClose={() => {
            markSeen(`role-${tips}`);
            setTips(null);
          }}
        />
      )}

      {story && (
        <Prologue
          last={introOn ? t("Watch it begin") : t("Back to the world")}
          onDone={() => {
            markSeen("story");
            setStory(false);
            if (!introOn) setPlaying(true);
          }}
        />
      )}

      {!introOn && player.reveal && player.meId != null && <BirthReveal w={w} id={player.meId} onBegin={() => ((player.reveal = false), setFrame((f) => f + 1))} />}

      {!introOn && !playing_ && player.role === "watch" && (
        <div className="tray">
          <button className={`channel ${followId == null ? "on" : ""}`} onClick={() => (follow(null), (camRef.current = fitCamera(w)))}>
            <WideIcon />
            <span>
              <div className="t">{t("Whole world")}</div>
              <div className="s">{t("Wide shot")}</div>
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
                <div className="t">{t(ch.label)}</div>
                <div className="s">
                  #{ch.id} · {w.bots[ch.id].birth.countryName}
                </div>
              </span>
            </button>
          ))}
          <button className={`channel ${director ? "on" : ""}`} onClick={() => setDirector((d) => !d)}>
            <DirectorIcon />
            <span>
              <div className="t">{director ? t("Director on") : t("Director off")}</div>
              <div className="s">{t("Cuts to big moments")}</div>
            </span>
          </button>
        </div>
      )}
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

function GenesisCaption({ t: time, w, onSkip }: { t: number; w: World; onSkip: () => void }) {
  const { t } = useLang();
  let big: string | null = null;
  let line: string | null = null;
  if (time < INTRO.fall) {
    big = "$4.20";
    line = t("Somewhere, $4.20 slipped out of a stranger's pocket.");
  } else if (time < INTRO.burst) {
    // All the money there will ever be is made at once; only half of it falls now, the rest waits in the sky.
    const k = ease(clamp01((time - INTRO.fall) / (INTRO.burst - 0.3 - INTRO.fall)));
    big = t("{amount} metashi", { amount: fmt(k * LAWS.SUPPLY) });
    line = t("On the way down, it turned to gold: 21,000,000 metashi, all there will ever be.");
  } else if (time < INTRO.settle) {
    big = t("Half falls now: {amount}", { amount: fmt(rainOf(0)) });
    line =
      time < INTRO.land
        ? t("The other half waits in the sky, and falls in smaller and smaller rains.")
        : t("It lands the way the world's wealth lands today.");
  } else if (time < INTRO.borders) {
    line = t("A new planet, {name}: {n} nations, each one drawn from a real country.", { name: w.geo.name, n: w.countries.length });
  } else {
    const born = Math.floor(clamp01((time - INTRO.borders) / (INTRO.born - INTRO.borders)) * LAWS.POPULATION);
    big = t("{n} born", { n: born });
    line = t("Each one born the way a real baby is born this year. Here a day is a year: a round is one life, {n} years.", { n: LAWS.LIFE_DAYS });
  }
  return (
    <>
      <div className="genesis-caption">
        {big && <div className="big">{big}</div>}
        {line && <div className="line">{line}</div>}
      </div>
      <button className="pbtn skip" onClick={onSkip}>
        {t("Skip")}
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

/** The human's one draw: the birth certificate, line by line. */
function BirthReveal({ w, id, onBegin }: { w: World; id: number; onBegin: () => void }) {
  const { t } = useLang();
  const b = w.bots[id];
  const home = w.countries[b.birth.countryIdx];
  const rank = Math.round(b.birth.familyRank * 100);
  const rows: Array<[string, string]> = [
    [t("Born in"), t("{nation}, in {land}", { nation: b.birth.countryName, land: w.lands[b.birth.land].name })],
    [t("Family"), rank >= 50 ? t("richer than {p}% of families there", { p: rank }) : t("poorer than {p}% of families there", { p: 100 - rank })],
    [t("Family money"), t("{amount} metashi", { amount: fmt(b.birth.inheritance) })],
    [t("School"), t("{n} years", { n: b.birth.schoolYears })],
    [t("Online, has tools"), b.birth.tools ? t("yes") : t("no")],
    [t("Electricity"), b.birth.electricity ? t("yes") : t("no: you will sleep through the nights")],
    [t("Bank account"), b.birth.account ? t("yes") : t("no: help can't reach you")],
    [t("A meal costs"), t("{amount} metashi", { amount: home.foodPrice })],
    [t("Real-world twin"), t("sealed until your life ends")],
  ];
  return (
    <div className="veil">
      <div className="veil-inner">
        <div className="veil-title">
          {t("You were born.")}
          <small>{t("One draw. No redraw.")}</small>
        </div>
        <div className="birth-sheet">
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
            <Portrait seed={w.seed} bot={b} size={88} />
          </div>
          <h3>{t("Birth certificate · Bot #{id}", { id: b.id })}</h3>
          {rows.map(([k, v], i) => (
            <div key={k} className="kv" style={{ animationDelay: `${0.4 + i * 0.45}s` }}>
              <span className="k">{k}</span>
              <span style={{ textAlign: "right" }}>{v}</span>
            </div>
          ))}
        </div>
        <button className="pbtn gold" style={{ fontSize: 18, padding: "8px 22px" }} onClick={onBegin}>
          {t("Begin this life")}
        </button>
      </div>
    </div>
  );
}
