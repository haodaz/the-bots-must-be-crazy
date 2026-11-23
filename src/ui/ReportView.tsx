import Link from "next/link";
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
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{label}</div>
      <div className="bar-row">
        <span style={{ color: "var(--ink-2)" }}>As it is · {fmt(base)}</span>
        <div className="bar-track">
          <div className="bar" style={{ width: `${(base / max) * 100}%` }} />
        </div>
        <span />
      </div>
      <div className="bar-row">
        <span style={{ color: "var(--ink-2)" }}>Changed · {fmt(changed)}</span>
        <div className="bar-track">
          <div className="bar gold" style={{ width: `${(changed / max) * 100}%` }} />
        </div>
        <span className={`delta ${good ? "good" : bad ? "bad" : ""}`}>{signed(rel)}</span>
      </div>
    </div>
  );
}

export default function ReportView() {
  const base = R.baseline;
  const sorted = [...R.results].sort((a, b) => a.effects.starvingDays.diff - b.effects.starvingDays.diff);
  const maxLand = Math.max(...base.landStarvingDays, 1e-9);
  const hardest = base.landStarvingDays.indexOf(Math.max(...base.landStarvingDays));
  return (
    <main className="report">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1>Impact report</h1>
          <p className="lede" style={{ margin: "6px 0 0" }}>
            {R.seeds} pairs of worlds, {R.days} days each. In every pair the same {R.population} bots are born the same way and get
            the same luck. Only one thing is changed. Whatever differs is the worth of that one thing.
          </p>
        </div>
        <Link className="pbtn" href="/" style={{ textDecoration: "none" }}>
          Back to the world
        </Link>
      </div>

      <p className="lede" style={{ fontStyle: "italic", marginTop: 18 }}>
        We don&apos;t have big money to help others. But a little money can help us understand them.
      </p>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-h">
          <span>The world as it is</span>
          <span className="chip">{R.seeds} worlds</span>
        </div>
        <div className="panel-b" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
          <div>
            <div className="kv">
              <span className="k">Days each bot spent starving</span>
              <span className="v">{base.starvingDays.toFixed(2)}</span>
            </div>
            <div className="kv">
              <span className="k">Bots who ran out of food and money</span>
              <span className="v">{pct(base.needShare)}</span>
            </div>
            <div className="kv">
              <span className="k">Money held by the poorer half</span>
              <span className="v">{pct(base.poorestHalfShare)}</span>
            </div>
            <p className="note">
              Hunger is not spread evenly. A bot born in {R.lands[hardest]} spends {base.landStarvingDays[hardest].toFixed(2)} days
              starving on average.
            </p>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Days starving, by land of birth</div>
            {R.lands.map((name, i) => (
              <div key={name} className="bar-row">
                <span style={{ color: "var(--ink-2)" }}>{name}</span>
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
              <span>{r.label}</span>
            </div>
            <div className="panel-b">
              <div style={{ fontFamily: "var(--pixel)", fontSize: 15, color: "var(--ink-2)" }}>{r.question}</div>
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
                In {R.lands[hardest]}, days starving go from {base.landStarvingDays[hardest].toFixed(2)} to{" "}
                {r.world.landStarvingDays[hardest].toFixed(2)}. 95% range for the change in days starving per bot:{" "}
                {r.effects.starvingDays.low.toFixed(2)} to {r.effects.starvingDays.high.toFixed(2)}.
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="panel" style={{ marginTop: 22 }}>
        <div className="panel-h">How this was measured</div>
        <div className="panel-b" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
          <p style={{ margin: 0 }}>
            Each lever is tested on the same {R.seeds} seeds as the world as it is, so each pair has the very same people, places
            and luck. Ranges are 95% intervals of the paired differences. Births, wealth, schooling, internet, electricity, bank
            accounts, taxes and prices come from {R.data.source} (fetched {R.data.fetched}). Each extra year of school raises what a
            swing digs by 9%, the global average return to schooling (Psacharopoulos & Patrinos, World Bank, 2018).
          </p>
          <p className="note">{R.caveat} Generated {R.generated.slice(0, 10)}. Running it costs $0: no model is called.</p>
        </div>
      </div>
    </main>
  );
}
