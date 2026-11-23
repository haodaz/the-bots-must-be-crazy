"use client";

import { useEffect, useMemo, useRef } from "react";
import { EARTH } from "@/engine/earth.ts";
import { LAWS, swingFor } from "@/engine/laws.ts";
import type { Bot, World } from "@/engine/world.ts";
import { COL, LAND_TINTS } from "./dots.ts";
import { DOTS, EYES, spriteFor } from "./sprite.ts";

export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const pct = (x: number) => `${Math.round(x)}%`;

export function stateLabel(b: Bot) {
  return b.state === "faint" ? "starving" : b.state === "mining" ? "digging" : b.state === "asleep" ? "asleep" : "searching";
}

/** A bot drawn large on its own little dot-matrix screen. */
export function Portrait({ seed, bot, size = 96 }: { seed: number; bot: Bot; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const sprite = useMemo(() => spriteFor(seed, bot.id), [seed, bot.id]);
  const body = bot.state === "faint" ? COL.faint : bot.state === "asleep" ? COL.asleep : COL.digging;
  const eye = bot.wake === "need" ? COL.need : bot.wake === "plenty" ? COL.plenty : body;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const n = DOTS + 2;
    const cell = (size * dpr) / n;
    c.width = c.height = size * dpr;
    const x = c.getContext("2d")!;
    x.fillStyle = "#fffaf0";
    x.fillRect(0, 0, c.width, c.height);
    for (let r = 0; r < n; r++) {
      for (let k = 0; k < n; k++) {
        const sr = r - 1;
        const sc = k - 1;
        const on = sr >= 0 && sc >= 0 && sr < DOTS && sc < DOTS && sprite[sr * DOTS + sc];
        const isEye = EYES.some(([er, ec]) => er === sr && ec === sc);
        x.fillStyle = on ? (isEye ? eye : body) : "#e6dcc6";
        x.beginPath();
        x.arc(k * cell + cell / 2, r * cell + cell / 2, cell * 0.4, 0, Math.PI * 2);
        x.fill();
      }
    }
  }, [sprite, body, eye, size]);
  return <canvas ref={ref} style={{ width: size, height: size, border: "2px solid var(--ink)", flex: "none" }} />;
}

/** A small pixel scene for a land: its hills, its gold, its people. Drawn in code, no model. */
export function Vignette({ land, gold, people }: { land: number; gold: number; people: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const W = 96;
    const H = 44;
    c.width = W;
    c.height = H;
    const x = c.getContext("2d")!;
    let s = (land + 1) * 7919;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    x.fillStyle = "#f7efdc";
    x.fillRect(0, 0, W, H);
    // Sun.
    x.fillStyle = "#e9c463";
    const sx = 14 + land * 11;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 10) x.fillRect(sx + dx, 9 + dy, 1, 1);
    // Far and near hills.
    const tint = LAND_TINTS[land % LAND_TINTS.length];
    const ground = Array.from({ length: W }, (_, i) => 28 + Math.round(3 * Math.sin(i / 9 + land) + 2 * Math.sin(i / 4 + land * 2)));
    x.fillStyle = shade(tint, -18);
    for (let i = 0; i < W; i++) x.fillRect(i, ground[i] - 6 - Math.round(3 * Math.sin(i / 13 + land)), 1, H);
    x.fillStyle = shade(tint, -40);
    for (let i = 0; i < W; i++) x.fillRect(i, ground[i], 1, H);
    // Gold in the ground, as much as the land got.
    x.fillStyle = "#d4a12a";
    const specks = Math.round(gold * 260);
    for (let k = 0; k < specks; k++) {
      const gx = Math.floor(rnd() * W);
      x.fillRect(gx, ground[gx] + 2 + Math.floor(rnd() * (H - ground[gx] - 3)), 1, 1);
    }
    // Its people: one small figure per bot living here.
    x.fillStyle = "#2b2417";
    const n = Math.min(people, 40);
    for (let k = 0; k < n; k++) {
      const px = Math.floor(((k + 0.5) / n) * (W - 4)) + 1 + Math.floor(rnd() * 2);
      const py = ground[px] - 4;
      x.fillRect(px, py, 2, 1);
      x.fillRect(px - 1, py + 1, 4, 2);
      x.fillRect(px, py + 3, 1, 1);
      x.fillRect(px + 2, py + 3, 1, 1);
    }
  }, [land, gold, people]);
  return <canvas ref={ref} className="vignette" />;
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

function familyLine(rank: number) {
  const p = Math.round(rank * 100);
  return p >= 50 ? `richer than ${p}%` : `poorer than ${100 - p}%`;
}

export function BotCard({
  w,
  bot,
  following,
  onFollow,
  onLand,
}: {
  w: World;
  bot: Bot;
  following: boolean;
  onFollow: () => void;
  onLand: () => void;
}) {
  const land = w.lands[bot.birth.land];
  const l = bot.life;
  const total = l.ticksDigging + l.ticksSearching + l.ticksAsleep || 1;
  const share = (v: number) => pct((v / total) * 100);
  return (
    <div className="panel">
      <div className="panel-h">
        <span>Bot #{bot.id}</span>
        <span className={`chip ${bot.wake === "need" ? "need" : bot.wake === "plenty" ? "gold" : ""}`}>
          {bot.wake ? `${bot.wake} switch flipped` : stateLabel(bot)}
        </span>
      </div>
      <div className="panel-b">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Portrait seed={w.seed} bot={bot} />
          <div style={{ minWidth: 0 }}>
            <div className="num" style={{ fontSize: 30 }}>
              {fmt(bot.wallet)}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>metashi in its pocket</div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className={`pbtn ${following ? "on" : "gold"}`} onClick={onFollow}>
                {following ? "Following" : "Follow live"}
              </button>
            </div>
          </div>
        </div>

        <div className="cert">
          <h4>Birth certificate</h4>
          <div className="kv">
            <span className="k">Born in</span>
            <span style={{ textAlign: "right" }}>
              {bot.birth.countryName}
              <br />
              <a href="#" onClick={(e) => (e.preventDefault(), onLand())} style={{ fontSize: 12, color: "var(--ink-2)" }}>
                {land.short}
              </a>
            </span>
          </div>
          <div className="kv">
            <span className="k">Family</span>
            <span>{familyLine(bot.birth.familyRank)} of families there</span>
          </div>
          <div className="kv">
            <span className="k">Family money</span>
            <span className="v">{fmt(bot.birth.inheritance)}</span>
          </div>
          <div className="kv">
            <span className="k">School</span>
            <span className="v">{bot.birth.schoolYears} yrs</span>
          </div>
          <div className="kv">
            <span className="k">Online, has tools</span>
            <span>{bot.birth.tools ? "yes" : "no"}</span>
          </div>
          <div className="kv">
            <span className="k">Electricity</span>
            <span>{bot.birth.electricity ? "yes" : "no, sleeps at night"}</span>
          </div>
          <div className="kv">
            <span className="k">Bank account</span>
            <span>{bot.birth.account ? "yes" : "no, help can't reach it"}</span>
          </div>
          <div className="kv">
            <span className="k">One swing digs</span>
            <span className="v">{swingFor(w.tick, bot.birth.schoolYears, bot.birth.tools)}</span>
          </div>
        </div>

        <div className="cert">
          <h4>Life so far</h4>
          <div className="kv">
            <span className="k">Dug</span>
            <span className="v">{fmt(l.mined)}</span>
          </div>
          <div className="kv">
            <span className="k">Paid in tax</span>
            <span className="v">{fmt(l.taxPaid)}</span>
          </div>
          <div className="kv">
            <span className="k">Meals · from welfare</span>
            <span className="v">
              {l.meals} · {l.welfareMeals}
            </span>
          </div>
          <div className="kv">
            <span className="k">Richest moment</span>
            <span className="v">{fmt(l.peakWallet)}</span>
          </div>
          <div className="kv">
            <span className="k">Times it starved</span>
            <span className="v">{l.faints}</span>
          </div>
          <p className="note" style={{ marginTop: 4 }}>
            {share(l.ticksDigging)} of its time digging, {share(l.ticksSearching)} searching, {share(l.ticksAsleep)} asleep in the dark.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Real-world averages for a land, weighted by births. */
function landFacts(i: number) {
  const land = EARTH.lands[i];
  const births = land.countries.reduce((a, c) => a + c.births, 0);
  const avg = (k: "schoolYears" | "electricityPct" | "internetPct" | "accountPct") =>
    land.countries.reduce((a, c) => a + c[k] * c.births, 0) / births;
  const top = [...land.countries].sort((a, b) => b.births - a.births).slice(0, 3).map((c) => c.name);
  return {
    births: land.birthsShare * 100,
    gdp: land.gdpShare * 100,
    school: avg("schoolYears"),
    electricity: avg("electricityPct"),
    internet: avg("internetPct"),
    accounts: avg("accountPct"),
    top,
  };
}

export function LandCard({
  w,
  index,
  tile,
  onBot,
}: {
  w: World;
  index: number;
  tile: { x: number; y: number } | null;
  onBot: (id: number) => void;
}) {
  const land = w.lands[index];
  const facts = useMemo(() => landFacts(index), [index]);
  const residents = w.bots.filter((b) => b.birth.land === index).sort((a, b) => b.wallet - a.wallet);
  const wallets = residents.map((b) => b.wallet).sort((a, b) => a - b);
  const median = wallets[Math.floor(wallets.length / 2)] ?? 0;
  const starving = residents.filter((b) => b.state === "faint").length;
  const ground = w.gold.reduce((a, g, i) => (w.landOfCol[i % w.width] === index ? a + g : a), 0);
  const here = tile ? w.gold[Math.floor(tile.y) * w.width + Math.floor(tile.x)] : null;
  return (
    <div className="panel">
      <div className="panel-h">
        <span>{land.name}</span>
        <span className="chip">{residents.length} bots</span>
      </div>
      <div className="panel-b">
        <Vignette land={index} gold={EARTH.lands[index].gdpShare} people={residents.length} />
        {here != null && (
          <p className="note" style={{ marginTop: 8 }}>
            This spot: <b>{fmt(here)}</b> metashi in the ground.
          </p>
        )}

        <div className="cert">
          <h4>From the real world</h4>
          <div className="kv">
            <span className="k">Babies born here</span>
            <span className="v">{facts.births.toFixed(1)}%</span>
          </div>
          <div className="kv">
            <span className="k">World wealth (GDP, PPP)</span>
            <span className="v">{facts.gdp.toFixed(1)}%</span>
          </div>
          <div className="kv">
            <span className="k">Expected school</span>
            <span className="v">{facts.school.toFixed(1)} yrs</span>
          </div>
          <div className="kv">
            <span className="k">Electricity</span>
            <span className="v">{pct(facts.electricity)}</span>
          </div>
          <div className="kv">
            <span className="k">Online</span>
            <span className="v">{pct(facts.internet)}</span>
          </div>
          <div className="kv">
            <span className="k">Bank accounts</span>
            <span className="v">{pct(facts.accounts)}</span>
          </div>
          <p className="note" style={{ marginTop: 4 }}>
            Most births: {facts.top.join(", ")}. World Bank Open Data, weighted by births.
          </p>
        </div>

        <div className="cert">
          <h4>In this world, now</h4>
          <div className="kv">
            <span className="k">Gold in the ground</span>
            <span className="v">{fmt(ground)}</span>
          </div>
          <div className="kv">
            <span className="k">Median pocket</span>
            <span className="v">{fmt(median)}</span>
          </div>
          <div className="kv">
            <span className="k">Starving now</span>
            <span className="v">{starving}</span>
          </div>
          <div className="kv">
            <span className="k">Food costs · tax</span>
            <span className="v">
              {land.foodPrice} · {Math.round(land.taxRate * 100)}%
            </span>
          </div>
          <div className="kv">
            <span className="k">Treasury for welfare</span>
            <span className="v">{fmt(land.treasury)}</span>
          </div>
        </div>

        <h4 style={{ margin: "14px 0 0", fontFamily: "var(--pixel)", fontSize: 14 }}>Who lives here</h4>
        <ul className="residents">
          {residents.map((b) => (
            <li key={b.id} onClick={() => onBot(b.id)}>
              <Portrait seed={w.seed} bot={b} size={26} />
              <span className="grow">
                #{b.id} <span className="c">{b.birth.countryName}</span>
                <br />
                <span className="c">{stateLabel(b)}</span>
              </span>
              <span className="num" style={{ fontSize: 18 }}>
                {fmt(b.wallet)}
              </span>
            </li>
          ))}
        </ul>
        <p className="note">
          {LAWS.POPULATION} bots stand for a year of births: each one is about {fmt(EARTH.totalBirths / LAWS.POPULATION)} real babies.
        </p>
      </div>
    </div>
  );
}
