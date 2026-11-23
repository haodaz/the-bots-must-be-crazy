"use client";

import { useEffect, useMemo, useRef } from "react";
import { EARTH } from "@/engine/earth.ts";
import { LAWS, wageFor } from "@/engine/laws.ts";
import { TERRAIN_NAMES } from "@/engine/planet.ts";
import { useLang } from "@/i18n.tsx";
import type { Bot, World } from "@/engine/world.ts";
import { COL, type Rect } from "./map.ts";
import { H as AH, W as AW, avatarCanvas } from "./avatar.ts";

export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const pct = (x: number) => `${Math.round(x)}%`;

export function stateLabel(b: Bot) {
  return b.state === "faint" ? "starving" : b.state === "working" ? "working" : b.state === "asleep" ? "asleep" : "looking for work";
}

/** A bot's pixel figure: full body when there is room, head and shoulders when small. */
export function Portrait({ seed, bot, size = 96 }: { seed: number; bot: Bot; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const look = bot.state === "faint" ? "faint" : bot.state === "asleep" ? "asleep" : "normal";
  const bust = size < 56;
  const width = bust ? size : Math.round((size * AW) / AH);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr);
    c.height = Math.round(size * dpr);
    const x = c.getContext("2d")!;
    x.imageSmoothingEnabled = false;
    x.fillStyle = "#fbf3dc";
    x.fillRect(0, 0, c.width, c.height);
    const fig = avatarCanvas(seed, bot.id, bot.birth.familyRank, look, bot.wake);
    if (bust) x.drawImage(fig, 2, 0, 16, 16, 0, 0, c.width, c.height);
    else x.drawImage(fig, 0, 0, AW, AH, 0, 0, c.width, c.height);
  }, [seed, bot.id, bot.birth.familyRank, look, bot.wake, size, width, bust]);
  return <canvas ref={ref} style={{ width, height: size, border: "2px solid var(--ink)", flex: "none", imageRendering: "pixelated" }} />;
}

/** A small pixel scene of a place: its terrain, its economy, its people. Drawn in code, no model. */
export function Vignette({ w, tiles, people, seed }: { w: World; tiles: number[]; people: number; seed: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const W = 96;
    const H = 44;
    c.width = W;
    c.height = H;
    const x = c.getContext("2d")!;
    let s = (seed + 1) * 7919;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const pal = w.geo.palette.terrain;
    // The place's most common terrain colours the hills.
    const counts = new Map<number, number>();
    for (const t of tiles) counts.set(w.geo.terrain[t], (counts.get(w.geo.terrain[t]) ?? 0) + 1);
    const kinds = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const near = pal[kinds[0] ?? 4];
    const far = pal[kinds[1] ?? kinds[0] ?? 3];
    x.fillStyle = "#f7efdc";
    x.fillRect(0, 0, W, H);
    x.fillStyle = "#e9c463";
    const sx = 12 + (seed % 70);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 10) x.fillRect(sx + dx, 9 + dy, 1, 1);
    const ground = Array.from({ length: W }, (_, i) => 28 + Math.round(3 * Math.sin(i / 9 + seed) + 2 * Math.sin(i / 4 + seed * 2)));
    x.fillStyle = shade(far, -12);
    for (let i = 0; i < W; i++) x.fillRect(i, ground[i] - 6 - Math.round(3 * Math.sin(i / 13 + seed)), 1, H);
    x.fillStyle = shade(near, -30);
    for (let i = 0; i < W; i++) x.fillRect(i, ground[i], 1, H);
    // The economy: as many lights as the money here.
    const money = tiles.reduce((a, t) => a + w.money[t], 0);
    x.fillStyle = COL.gold;
    const lights = Math.min(320, Math.round(Math.log10(Math.max(1, money)) * 26));
    for (let k = 0; k < lights; k++) {
      const gx = Math.floor(rnd() * W);
      x.fillRect(gx, ground[gx] + 2 + Math.floor(rnd() * (H - ground[gx] - 3)), 1, 1);
    }
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
  }, [w, tiles, people, seed]);
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

function Row({ k, v, num = false }: { k: string; v: React.ReactNode; num?: boolean }) {
  const { t: tr } = useLang();
  return (
    <div className="kv">
      <span className="k">{tr(k)}</span>
      <span className={num ? "v" : undefined} style={num ? undefined : { textAlign: "right" }}>
        {v}
      </span>
    </div>
  );
}

export function BotCard({
  w,
  bot,
  following,
  onFollow,
  onCountry,
}: {
  w: World;
  bot: Bot;
  following: boolean;
  onFollow: () => void;
  onCountry: () => void;
}) {
  const { t: tr } = useLang();
  const home = w.countries[bot.birth.countryIdx];
  const l = bot.life;
  const total = l.ticksWorking + l.ticksSearching + l.ticksAsleep || 1;
  const share = (v: number) => pct((v / total) * 100);
  return (
    <div className="panel">
      <div className="panel-h">
        <span>{tr("Bot #{id}", { id: bot.id })}</span>
        <span className={`chip ${bot.wake === "need" ? "need" : bot.wake === "plenty" ? "gold" : ""}`}>
          {bot.wake ? tr(`${bot.wake} switch flipped`) : tr(stateLabel(bot))}
        </span>
      </div>
      <div className="panel-b">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Portrait seed={w.seed} bot={bot} />
          <div style={{ minWidth: 0 }}>
            <div className="num" style={{ fontSize: 30 }}>
              {fmt(bot.wallet)}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{tr("metashi in its pocket")}</div>
            <button className={`pbtn ${following ? "on" : "gold"}`} style={{ marginTop: 10 }} onClick={onFollow}>
              {following ? tr("Following") : tr("Follow live")}
            </button>
          </div>
        </div>

        <div className="cert">
          <h4>{tr("Birth certificate")}</h4>
          <Row
            k="Born in"
            v={
              <>
                <a href="#" onClick={(e) => (e.preventDefault(), onCountry())}>
                  {bot.birth.countryName}
                </a>
                <br />
                <span style={{ fontSize: 12, color: "var(--ink-2)" }}>{w.lands[bot.birth.land].short}</span>
              </>
            }
          />
          <Row k="Family" v={tr(`${familyLine(bot.birth.familyRank).split(" ")[0]} than {p}% of families there`, { p: Number(familyLine(bot.birth.familyRank).match(/\d+/)?.[0] ?? 0) })} />
          <Row k="Family money" v={fmt(bot.birth.inheritance)} num />
          <Row k="School" v={tr("{n} yrs", { n: bot.birth.schoolYears })} num />
          <Row k="Online, has tools" v={bot.birth.tools ? tr("yes") : tr("no")} />
          <Row k="Electricity" v={bot.birth.electricity ? tr("yes") : tr("no, sleeps at night")} />
          <Row k="Bank account" v={bot.birth.account ? tr("yes") : tr("no, help can't reach it")} />
          <Row k="An hour of work earns" v={wageFor(bot.birth.schoolYears, bot.birth.tools)} num />
          <Row k="A meal costs here" v={home.foodPrice} num />
          <Row k="Real-world twin" v={tr("sealed until its life ends")} />
        </div>

        <div className="cert">
          <h4>{tr("Life so far")}</h4>
          <Row k="Earned" v={fmt(l.earned)} num />
          <Row k="Paid in tax" v={fmt(l.taxPaid)} num />
          <Row k="Spent in town" v={fmt(l.spent)} num />
          <Row k="Meals · from welfare" v={`${l.meals} · ${l.welfareMeals}`} num />
          <Row k="Richest moment" v={fmt(l.peakWallet)} num />
          <Row k="Times it starved" v={l.faints} num />
          <p className="note" style={{ marginTop: 4 }}>
            {tr("{a} of its time working, {b} looking for work, {c} asleep in the dark.", { a: share(l.ticksWorking), b: share(l.ticksSearching), c: share(l.ticksAsleep) })}
          </p>
        </div>
      </div>
    </div>
  );
}

function Residents({ w, bots, onBot }: { w: World; bots: Bot[]; onBot: (id: number) => void }) {
  const { t: tr } = useLang();
  if (!bots.length) return <p className="note">{tr("No bots live here in this world.")}</p>;
  return (
    <ul className="residents">
      {[...bots]
        .sort((a, b) => b.wallet - a.wallet)
        .map((b) => (
          <li key={b.id} onClick={() => onBot(b.id)}>
            <Portrait seed={w.seed} bot={b} size={26} />
            <span className="grow">
              #{b.id} <span className="c">{b.birth.countryName}</span>
              <br />
              <span className="c">{tr(stateLabel(b))}</span>
            </span>
            <span className="num" style={{ fontSize: 18 }}>
              {fmt(b.wallet)}
            </span>
          </li>
        ))}
    </ul>
  );
}

export function CountryCard({ w, ci, onBot }: { w: World; ci: number; onBot: (id: number) => void }) {
  const { t: tr } = useLang();
  const c = w.countries[ci];
  const real = EARTH.countries[ci];
  const residents = w.bots.filter((b) => b.birth.countryIdx === ci);
  const wallets = residents.map((b) => b.wallet).sort((a, b) => a - b);
  const money = c.tiles.reduce((a, t) => a + w.money[t], 0);
  const terrain = new Map<number, number>();
  for (const t of c.tiles) terrain.set(w.geo.terrain[t], (terrain.get(w.geo.terrain[t]) ?? 0) + 1);
  const mainTerrain = [...terrain.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 4;
  return (
    <div className="panel">
      <div className="panel-h">
        <span>{c.name}</span>
        <span className="chip">{w.lands[c.land].short}</span>
      </div>
      <div className="panel-b">
        <Vignette w={w} tiles={c.tiles} people={residents.length} seed={ci} />
        <p className="note" style={{ marginTop: 8 }}>
          {tr("In {land}, on {planet}: {n} tiles, mostly {terrain}.", { land: w.lands[c.land].name, planet: w.geo.name, n: c.tiles.length, terrain: tr(TERRAIN_NAMES[mainTerrain]) })}
        </p>

        <div className="cert">
          <h4>{tr("From the real world")}</h4>
          <Row k="Babies born here, of the world's" v={`${((real.births / EARTH.totalBirths) * 100).toFixed(2)}%`} num />
          <Row k="Income per person (PPP)" v={`$${fmt(real.gdpPerCapitaPpp)}`} num />
          <Row k="Expected school" v={tr("{n} yrs", { n: real.schoolYears.toFixed(1) })} num />
          <Row k="Electricity" v={pct(real.electricityPct)} num />
          <Row k="Online" v={pct(real.internetPct)} num />
          <Row k="Bank accounts" v={pct(real.accountPct)} num />
          <Row k="Richest 10% hold" v={tr("{p} of income", { p: pct(real.top10Share) })} num />
          <p className="note" style={{ marginTop: 4 }}>
            {tr("These numbers belong to a real country (World Bank Open Data). Which one stays sealed until the end.")}
          </p>
        </div>

        <div className="cert">
          <h4>{tr("In this world, now")}</h4>
          <Row k="Money in its economy" v={fmt(money)} num />
          <Row k="Treasury for welfare" v={fmt(c.treasury)} num />
          <Row k="A meal costs · tax" v={`${c.foodPrice} · ${Math.round(c.taxRate * 100)}%`} num />
          <Row k="Median pocket" v={fmt(wallets[Math.floor(wallets.length / 2)] ?? 0)} num />
          <Row k="Starving now" v={residents.filter((b) => b.state === "faint").length} num />
        </div>

        <h4 style={{ margin: "14px 0 0", fontFamily: "var(--pixel)", fontSize: 14 }}>{tr("Who lives here · {n}", { n: residents.length })}</h4>
        <Residents w={w} bots={residents} onBot={onBot} />
        <p className="note">
          {tr("{n} bots stand for a year of births: each one is about {babies} real babies.", { n: LAWS.POPULATION, babies: fmt(EARTH.totalBirths / LAWS.POPULATION) })}
        </p>
      </div>
    </div>
  );
}

export function AreaCard({ w, rect, onBot, onCountry }: { w: World; rect: Rect; onBot: (id: number) => void; onCountry: (ci: number) => void }) {
  const x0 = Math.max(0, Math.floor(Math.min(rect.x0, rect.x1)));
  const x1 = Math.min(w.width - 1, Math.floor(Math.max(rect.x0, rect.x1)));
  const y0 = Math.max(0, Math.floor(Math.min(rect.y0, rect.y1)));
  const y1 = Math.min(w.height - 1, Math.floor(Math.max(rect.y0, rect.y1)));
  const tiles: number[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles.push(y * w.width + x);
  const { t: tr } = useLang();
  const land = tiles.filter((t) => w.geo.cells[t] >= 0);
  const bots = w.bots.filter((b) => b.x >= x0 && b.x <= x1 && b.y >= y0 && b.y <= y1);
  const money = land.reduce((a, t) => a + w.money[t], 0);
  const byCountry = new Map<number, number>();
  for (const t of land) byCountry.set(w.geo.cells[t], (byCountry.get(w.geo.cells[t]) ?? 0) + 1);
  const countries = [...byCountry.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <div className="panel">
      <div className="panel-h">
        <span>{tr("Selected area")}</span>
        <span className="chip">{tr("{n} bots", { n: bots.length })}</span>
      </div>
      <div className="panel-b">
        <Vignette w={w} tiles={land} people={bots.length} seed={x0 * 31 + y0} />
        <div className="cert">
          <h4>{tr("This area")}</h4>
          <Row k="Land · sea" v={tr("{a} · {b} tiles", { a: land.length, b: tiles.length - land.length })} num />
          <Row k="Money in its economies" v={fmt(money)} num />
          <Row k="Working · looking · asleep" v={`${bots.filter((b) => b.state === "working").length} · ${bots.filter((b) => b.state === "roaming").length} · ${bots.filter((b) => b.state === "asleep").length}`} num />
          <Row k="Starving now" v={bots.filter((b) => b.state === "faint").length} num />
          <Row k="Waiting to wake" v={bots.filter((b) => b.wake).length} num />
        </div>
        {countries.length > 0 && (
          <p className="note">
            {tr("Nations here:")}{" "}
            {countries.slice(0, 8).map(([ci], k) => (
              <span key={ci}>
                {k > 0 && ", "}
                <a href="#" onClick={(e) => (e.preventDefault(), onCountry(ci))}>
                  {w.countries[ci].name}
                </a>
              </span>
            ))}
            {countries.length > 8 ? tr(" and {n} more", { n: countries.length - 8 }) : ""}.
          </p>
        )}
        <h4 style={{ margin: "14px 0 0", fontFamily: "var(--pixel)", fontSize: 14 }}>{tr("AIs in this area")}</h4>
        <Residents w={w} bots={bots} onBot={onBot} />
      </div>
    </div>
  );
}
