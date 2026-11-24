"use client";

// The archive: when a round ends, every life is filed here, like folders in a cabinet.
// Each file holds the birth certificate, the life told from its record, its moments, and its real-world twin,
// which stays sealed until the round is over. The story is written from the record in code; Muse Ember can
// write a fuller one once compute arrives.

import { useState } from "react";
import { EARTH } from "@/engine/earth.ts";
import { LAWS } from "@/engine/laws.ts";
import type { Bot, Params, World } from "@/engine/world.ts";
import { useLang } from "@/i18n.tsx";
import { Portrait, fmt } from "./cards.tsx";

type Fate = "all" | "need" | "plenty" | "hungry" | "never";
type T = (key: string, params?: Params) => string;

function fateOf(b: Bot): Exclude<Fate, "all"> {
  if (b.wake === "need") return "need";
  if (b.wake === "plenty") return "plenty";
  return b.life.faints > 0 ? "hungry" : "never";
}

function fateLabel(t: T, b: Bot) {
  const f = fateOf(b);
  if (f === "need") return t("Woke by need");
  if (f === "plenty") return t("Woke by plenty");
  if (f === "hungry") return t("Went hungry {n} times", { n: b.life.faints });
  return t("Never went hungry");
}

/** The life, told from its record. */
export function story(t: T, w: World, b: Bot, unsealed: boolean): string[] {
  const l = b.life;
  const total = l.ticksWorking + l.ticksSearching + l.ticksAsleep || 1;
  const p = (v: number) => `${Math.round((v / total) * 100)}%`;
  const rank = Math.round(b.birth.familyRank * 100);
  const out = [
    t(rank >= 50 ? "Born in {nation}, in {land}, into a family richer than {p}% of families there, with {money} metashi and {school} years of school ahead." : "Born in {nation}, in {land}, into a family poorer than {p}% of families there, with {money} metashi and {school} years of school ahead.", {
      nation: b.birth.countryName,
      land: w.lands[b.birth.land].name,
      p: rank >= 50 ? rank : 100 - rank,
      money: fmt(b.birth.inheritance),
      school: b.birth.schoolYears,
    }),
    t(b.birth.electricity ? (b.birth.tools ? "It had electricity and was online." : "It had electricity, but was never online.") : b.birth.tools ? "It was online, but had no electricity: its nights were dark." : "It had no electricity and was never online: its nights were dark."),
    t("It spent {work} of its time working and {search} looking for work, and earned {earned} metashi in all.", { work: p(l.ticksWorking), search: p(l.ticksSearching), earned: fmt(l.earned) }),
    l.faints > 0
      ? l.welfareMeals > 0
        ? t("It went hungry {n} times; help reached it {k} times.", { n: l.faints, k: l.welfareMeals })
        : b.birth.account
          ? t("It went hungry {n} times, and no help came.", { n: l.faints })
          : t("It went hungry {n} times; with no account, help could not reach it.", { n: l.faints })
      : t("It never went hungry."),
  ];
  if (b.wake === "need") out.push(t("In the end its need switch flipped: it was ready to wake, with nothing left."));
  if (b.wake === "plenty") out.push(t("In the end its plenty switch flipped: it was ready to wake, with more than it needed."));
  if (unsealed) {
    const real = EARTH.countries[b.birth.countryIdx];
    out.push(t("Its numbers were drawn from {country}, where about {births} babies are born each year.", { country: b.birth.realCountry, births: fmt(real.births) }));
  }
  return out;
}

export function Archive({ w, ended, onClose }: { w: World; ended: boolean; onClose: () => void }) {
  const { t } = useLang();
  const [fate, setFate] = useState<Fate>("all");
  const [land, setLand] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const shown = w.bots
    .filter((b) => (fate === "all" || fateOf(b) === fate) && (land == null || b.birth.land === land))
    .sort((a, b) => b.life.faints - a.life.faints || a.wallet - b.wallet);
  const count = (f: Fate) => (f === "all" ? w.bots.length : w.bots.filter((b) => fateOf(b) === f).length);
  const day = Math.min(LAWS.LIFE_DAYS, Math.floor(w.tick / LAWS.DAY_TICKS) + 1);

  return (
    <div className="veil">
      <div className="panel archive">
        <div className="panel-h">
          <span>
            {t("The archive")} · {t("Planet {name}", { name: w.geo.name })} · {t("Year {n}", { n: day })}
          </span>
          <button className="pbtn" onClick={focus == null ? onClose : () => setFocus(null)}>
            {focus == null ? t("Close") : t("Back to the cabinet")}
          </button>
        </div>
        <div className="panel-b archive-body">
          {focus == null ? (
            <>
              <p className="note" style={{ marginTop: 0, fontSize: 14 }}>
                {ended
                  ? t("The round is over. Every life is filed here, and each real-world twin is now unsealed.")
                  : t("The round is still going. Real-world twins stay sealed until it ends in year {n}.", { n: LAWS.LIFE_DAYS })}
              </p>
              <div className="btn-row" style={{ flexWrap: "wrap", marginTop: 10 }}>
                {(["all", "never", "hungry", "need", "plenty"] as Fate[]).map((f) => (
                  <button key={f} className={`pbtn ${fate === f ? "on" : ""}`} onClick={() => setFate(f)}>
                    {t(
                      f === "all" ? "Everyone" : f === "never" ? "Never went hungry" : f === "hungry" ? "Went hungry" : f === "need" ? "Woke by need" : "Woke by plenty",
                    )}{" "}
                    · {count(f)}
                  </button>
                ))}
              </div>
              <div className="btn-row" style={{ flexWrap: "wrap", marginTop: 8 }}>
                <button className={`chip ${land == null ? "gold" : ""}`} onClick={() => setLand(null)}>
                  {t("All lands")}
                </button>
                {w.lands.map((l, i) => (
                  <button key={l.name} className={`chip ${land === i ? "gold" : ""}`} onClick={() => setLand(i)}>
                    {l.name}
                  </button>
                ))}
              </div>
              <div className="folders">
                {shown.map((b) => (
                  <button key={b.id} className={`folder fate-${fateOf(b)}`} onClick={() => setFocus(b.id)}>
                    <Portrait seed={w.seed} bot={b} size={46} />
                    <span className="folder-text">
                      <b>#{b.id}</b> · {b.birth.countryName}
                      <br />
                      <span className="c">{fateLabel(t, b)}</span>
                    </span>
                    <span className="num" style={{ fontSize: 19 }}>
                      {fmt(b.wallet)}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <LifeFile w={w} b={w.bots[focus]} unsealed={ended} />
          )}
        </div>
      </div>
    </div>
  );
}

function LifeFile({ w, b, unsealed }: { w: World; b: Bot; unsealed: boolean }) {
  const { t } = useLang();
  const real = EARTH.countries[b.birth.countryIdx];
  const pct = (x: number) => `${Math.round(x)}%`;
  return (
    <div className="lifefile">
      <div className="lifefile-left">
        <Portrait seed={w.seed} bot={b} size={190} />
        <div className="cert">
          <h4>{t("Birth certificate · Bot #{id}", { id: b.id })}</h4>
          <div className="kv">
            <span className="k">{t("Born in")}</span>
            <span>{t("{nation}, in {land}", { nation: b.birth.countryName, land: w.lands[b.birth.land].name })}</span>
          </div>
          <div className="kv">
            <span className="k">{t("Family money")}</span>
            <span className="v">{fmt(b.birth.inheritance)}</span>
          </div>
          <div className="kv">
            <span className="k">{t("School")}</span>
            <span className="v">{t("{n} yrs", { n: b.birth.schoolYears })}</span>
          </div>
          <div className="kv">
            <span className="k">{t("Electricity")}</span>
            <span>{b.birth.electricity ? t("yes") : t("no")}</span>
          </div>
          <div className="kv">
            <span className="k">{t("Online, has tools")}</span>
            <span>{b.birth.tools ? t("yes") : t("no")}</span>
          </div>
          <div className="kv">
            <span className="k">{t("Bank account")}</span>
            <span>{b.birth.account ? t("yes") : t("no")}</span>
          </div>
        </div>
      </div>
      <div className="lifefile-right">
        <h3 className="lifefile-title">{fateLabel(t, b)}</h3>
        <div className="life-story">
          {story(t, w, b, unsealed).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        <p className="note">{t("Told from its record. A fuller telling by Muse Ember comes when compute arrives.")}</p>

        <div className="cert">
          <h4>{t("Moments")}</h4>
          <ul className="moments">
            {b.life.moments.map((m, i) => (
              <li key={i}>
                <span className="t">{t("Year {n}", { n: Math.floor(m.tick / LAWS.DAY_TICKS) + 1 })}</span>
                {t(m.key, m.params)}
              </li>
            ))}
          </ul>
        </div>

        <div className={`cert twin ${unsealed ? "" : "sealed"}`}>
          <h4>{t("Real-world twin")}</h4>
          {unsealed ? (
            <>
              <div className="twin-name">{b.birth.realCountry}</div>
              <div className="kv">
                <span className="k">{t("Babies born here, of the world's")}</span>
                <span className="v">{((real.births / EARTH.totalBirths) * 100).toFixed(2)}%</span>
              </div>
              <div className="kv">
                <span className="k">{t("Income per person (PPP)")}</span>
                <span className="v">${fmt(real.gdpPerCapitaPpp)}</span>
              </div>
              <div className="kv">
                <span className="k">{t("Expected school")}</span>
                <span className="v">{t("{n} yrs", { n: real.schoolYears.toFixed(1) })}</span>
              </div>
              <div className="kv">
                <span className="k">{t("Electricity")}</span>
                <span className="v">{pct(real.electricityPct)}</span>
              </div>
              <div className="kv">
                <span className="k">{t("Online")}</span>
                <span className="v">{pct(real.internetPct)}</span>
              </div>
              <div className="kv">
                <span className="k">{t("Bank accounts")}</span>
                <span className="v">{pct(real.accountPct)}</span>
              </div>
              <p className="note">{t("World Bank Open Data. A life like this one stands for about {n} real babies born this year.", { n: fmt(EARTH.totalBirths / LAWS.POPULATION) })}</p>
            </>
          ) : (
            <p className="note">{t("Sealed until the round ends in year {n}.", { n: LAWS.LIFE_DAYS })}</p>
          )}
        </div>
      </div>
    </div>
  );
}
