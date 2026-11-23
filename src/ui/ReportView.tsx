"use client";

import Link from "next/link";
import { LangSwitch, useLang } from "@/i18n.tsx";
import report from "../../reports/impact.json" with { type: "json" };

type Effect = { base: number; changed: number; diff: number; low: number; high: number; relative: number | null };
type Result = {
  key: string;
  label: string;
  question: string;
  effects: Record<"starvingDays" | "needShare" | "poorestHalfShare" | "medianWallet" | "mined", Effect>;
  world: { landStarvingDays: number[] };
};

const R = report as unknown as {
  generated: string;
  seeds: number;
  days: number;
  population: number;
  data: { source: string; fetched: string };
  lands: string[];
  baseline: { starvingDays: number; needShare: number; poorestHalfShare: number; landStarvingDays: number[]; landBots: number[] };
  results: Result[];
  caveat: string;
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (x: number | null) => (x == null ? "—" : `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`);

function Bars({
  label,
  base,
  changed,
  fmt,
  better,
}: {
  label: string;
  base: number;
  changed: number;
  fmt: (v: number) => string;
  better: "lower" | "higher";
}) {
  const max = Math.max(base, changed, 1e-9);
  const rel = base !== 0 ? (changed - base) / base : null;
  const good = rel != null && (better === "lower" ? rel < -0.02 : rel > 0.02);
  const bad = rel != null && (better === "lower" ? rel > 0.02 : rel < -0.02);
  const { t } = useLang();
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{t(label)}</div>
      <div className="bar-row">
        <span style={{ color: "var(--ink-2)" }}>{t("As it is · {v}", { v: fmt(base) })}</span>
        <div className="bar-track">
          <div className="bar" style={{ width: `${(base / max) * 100}%` }} />
        </div>
        <span />
      </div>
      <div className="bar-row">
        <span style={{ color: "var(--ink-2)" }}>{t("Changed · {v}", { v: fmt(changed) })}</span>
        <div className="bar-track">
          <div className="bar gold" style={{ width: `${(changed / max) * 100}%` }} />
        </div>
        <span className={`delta ${good ? "good" : bad ? "bad" : ""}`}>{signed(rel)}</span>
      </div>
    </div>
  );
}

export default function ReportView() {
  const { t } = useLang();
  const base = R.baseline;
  const sorted = [...R.results].sort((a, b) => a.effects.starvingDays.diff - b.effects.starvingDays.diff);
  const maxLand = Math.max(...base.landStarvingDays, 1e-9);
  const hardest = base.landStarvingDays.indexOf(Math.max(...base.landStarvingDays));
  return (
    <main className="report">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1>{t("Impact report")}</h1>
          <p className="lede" style={{ margin: "6px 0 0" }}>
            {t(
              "{seeds} pairs of worlds, {days} days each. In every pair the same {n} bots are born the same way and get the same luck. Only one thing is changed. Whatever differs is the worth of that one thing.",
              { seeds: R.seeds, days: R.days, n: R.population },
            )}
          </p>
        </div>
        <div className="btn-row">
          <LangSwitch />
          <Link className="pbtn" href="/" style={{ textDecoration: "none" }}>
            {t("Back to the world")}
          </Link>
        </div>
      </div>

      <p className="lede" style={{ fontStyle: "italic", marginTop: 18 }}>
        {t("We don't have big money to help others. But a little money can help us understand them.")}
      </p>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-h">
          <span>{t("The world as it is")}</span>
          <span className="chip">{t("{n} worlds", { n: R.seeds })}</span>
        </div>
        <div className="panel-b" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
          <div>
            <div className="kv">
              <span className="k">{t("Days each bot spent starving")}</span>
              <span className="v">{base.starvingDays.toFixed(2)}</span>
            </div>
            <div className="kv">
              <span className="k">{t("Bots who ran out of food and money")}</span>
              <span className="v">{pct(base.needShare)}</span>
            </div>
            <div className="kv">
              <span className="k">{t("Money held by the poorer half")}</span>
              <span className="v">{pct(base.poorestHalfShare)}</span>
            </div>
            <p className="note">
              {t("Hunger is not spread evenly. A bot born in {land} spends {days} days starving on average.", {
                land: t(R.lands[hardest]),
                days: base.landStarvingDays[hardest].toFixed(2),
              })}
            </p>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Days starving, by land of birth</div>
            {R.lands.map((name, i) => (
              <div key={name} className="bar-row">
                <span style={{ color: "var(--ink-2)" }}>{t(name)}</span>
                <div className="bar-track">
                  <div className="bar" style={{ width: `${(base.landStarvingDays[i] / maxLand) * 100}%` }} />
                </div>
                <span className="delta" style={{ fontSize: 18 }}>
                  {base.landStarvingDays[i].toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="findings">
        {sorted.map((r) => (
          <div key={r.key} className="panel">
            <div className="panel-h">
              <span>{t(r.label)}</span>
            </div>
            <div className="panel-b">
              <div style={{ fontFamily: "var(--pixel)", fontSize: 15, color: "var(--ink-2)" }}>{t(r.question)}</div>
              <Bars
                label="Days starving per bot"
                base={r.effects.starvingDays.base}
                changed={r.effects.starvingDays.changed}
                fmt={(v) => v.toFixed(2)}
                better="lower"
              />
              <Bars
                label="Ran out of food and money"
                base={r.effects.needShare.base}
                changed={r.effects.needShare.changed}
                fmt={pct}
                better="lower"
              />
              <Bars
                label="Money held by the poorer half"
                base={r.effects.poorestHalfShare.base}
                changed={r.effects.poorestHalfShare.changed}
                fmt={pct}
                better="higher"
              />
              <p className="note">
                {t("In {land}, days starving go from {a} to {b}. 95% range for the change in days starving per bot: {low} to {high}.", {
                  land: t(R.lands[hardest]),
                  a: base.landStarvingDays[hardest].toFixed(2),
                  b: r.world.landStarvingDays[hardest].toFixed(2),
                  low: r.effects.starvingDays.low.toFixed(2),
                  high: r.effects.starvingDays.high.toFixed(2),
                })}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="panel" style={{ marginTop: 22 }}>
        <div className="panel-h">{t("How this was measured")}</div>
        <div className="panel-b" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
          <p style={{ margin: 0 }}>
            {t(
              "Each lever is tested on the same {seeds} seeds as the world as it is, so each pair has the very same people, places and luck; every seed runs on its own newly generated planet, so no result rests on one map. Ranges are 95% intervals of the paired differences. Births, wealth, schooling, internet, electricity, bank accounts, taxes and prices come from {source} (fetched {fetched}). metashi is money with a fixed supply: it circulates, so productivity shows up as lower prices. Each extra year of school raises productivity by 9%, the global average return to schooling (Psacharopoulos & Patrinos, World Bank, 2018); tools and the night hours that electricity allows raise it too. The price of food is set so that the share of bots who run out of food and money matches the real prevalence of undernourishment (FAO, about 9% worldwide).",
              { seeds: R.seeds, source: R.data.source, fetched: R.data.fetched },
            )}
          </p>
          <p className="note">
            {t(R.caveat)} {t("Generated {date}. Running it costs $0: no model is called.", { date: R.generated.slice(0, 10) })}
          </p>
        </div>
      </div>
    </main>
  );
}
