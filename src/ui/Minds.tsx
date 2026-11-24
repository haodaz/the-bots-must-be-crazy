"use client";

// The minds: this round's grain of real compute (a jar that empties as they think), the latest thoughts,
// and, on a bot's own card, everything it has thought in its life.

import { DEFS } from "@/engine/cards.ts";
import { LAWS } from "@/engine/laws.ts";
import type { Choice, Thought } from "@/engine/mind.ts";
import type { Bot, World } from "@/engine/world.ts";
import { useLang } from "@/i18n.tsx";
import { COL } from "./map.ts";

export type GrainView = { spent: number; grain: number; out: boolean; live: boolean | null; thoughts: number };

const year = (tick: number) => Math.floor(tick / LAWS.DAY_TICKS) + 1;
const usd = (v: number) => `$${v < 0.01 ? v.toFixed(4) : v.toFixed(3)}`;

function useChoiceName() {
  const { t } = useLang();
  return (c: Choice) => (c === "rest" ? t("Rest") : t(DEFS[c].title));
}

/** A jar of sugar that empties as the round's grain is spent. */
function GrainJar({ left }: { left: number }) {
  const h = Math.round(Math.max(0, Math.min(1, left)) * 34);
  return (
    <svg width="40" height="48" viewBox="0 0 40 48" aria-hidden style={{ flex: "none" }}>
      <rect x="9" y="3" width="22" height="6" fill="#d8c39a" stroke="#2b2417" strokeWidth="2" />
      <path d="M8 9 h24 l3 6 v29 h-30 v-29 z" fill="#fffaf0" stroke="#2b2417" strokeWidth="2" />
      <rect x="7" y={44 - h} width="26" height={h} fill={COL.gold} opacity="0.85" />
      {Array.from({ length: Math.floor(h / 5) }, (_, i) => (
        <circle key={i} cx={12 + ((i * 7) % 17)} cy={42 - i * 5} r="1.3" fill="#fff5dc" />
      ))}
      <path d="M8 9 h24 l3 6 v29 h-30 v-29 z" fill="none" stroke="#2b2417" strokeWidth="2" />
    </svg>
  );
}

export function MindsPanel({ w, grain, onBot }: { w: World; grain: GrainView; onBot: (id: number) => void }) {
  const { t } = useLang();
  const name = useChoiceName();
  const minds = w.bots.filter((b) => b.mind);
  const byNeed = minds.filter((b) => b.mind!.reason === "need").length;
  const latest = minds
    .flatMap((b) => b.mind!.thoughts.map((th) => ({ b, th })))
    .sort((a, z) => z.th.tick - a.th.tick)
    .slice(0, 4);
  const left = grain.grain > 0 ? 1 - grain.spent / grain.grain : 1;
  return (
    <div className="panel">
      <div className="panel-h">
        <span>{t("Minds")}</span>
        <span className={`chip ${grain.live ? "gold" : ""}`}>
          {grain.live === false ? t("rehearsal, $0") : t("{spent} of {grain}", { spent: usd(grain.spent), grain: usd(grain.grain) })}
        </span>
      </div>
      <div className="panel-b">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <GrainJar left={left} />
          <p className="note" style={{ margin: 0 }}>
            {grain.out
              ? t("This round's grain is spent. The minds live on by their last choice.")
              : t("This round holds a grain of real compute. Each thought is paid from it, with Meta's Muse Ember.")}
          </p>
        </div>
        <div className="kv" style={{ marginTop: 10 }}>
          <span className="k">{t("Awake, from need")}</span>
          <span className="v" style={{ color: COL.need }}>
            {byNeed}
          </span>
        </div>
        <div className="kv">
          <span className="k">{t("Awake, from plenty")}</span>
          <span className="v" style={{ color: "#a7781a" }}>
            {minds.length - byNeed}
          </span>
        </div>
        <div className="kv">
          <span className="k">{t("Thoughts this round")}</span>
          <span className="v">{grain.thoughts}</span>
        </div>
        {latest.length > 0 && (
          <ul className="thoughts">
            {latest.map(({ b, th }) => (
              <li key={`${b.id}-${th.tick}`} onClick={() => onBot(b.id)}>
                <div className="th-h">
                  <span style={{ color: b.mind!.reason === "need" ? COL.need : "#a7781a" }}>●</span> #{b.id} · {t("Y{n}", { n: year(th.tick) })} · {name(th.choice)}
                </div>
                <div className="th-t">{th.thought}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Everything a mind has thought, newest first, on its bot's card. */
export function MindLog({ bot }: { bot: Bot }) {
  const { t } = useLang();
  const name = useChoiceName();
  if (!bot.mind) return null;
  const m = bot.mind;
  return (
    <div className="cert">
      <h4>{m.reason === "need" ? t("Awake since year {n}, from need", { n: year(m.wokeTick) }) : t("Awake since year {n}, from plenty", { n: year(m.wokeTick) })}</h4>
      {m.thoughts.length === 0 && <p className="note">{t("It is thinking for the first time…")}</p>}
      <ul className="thoughts">
        {[...m.thoughts].reverse().map((th: Thought) => (
          <li key={th.tick}>
            <div className="th-h">
              {t("Y{n}", { n: year(th.tick) })} · {name(th.choice)}
              {!th.ok && <span className="chip" style={{ marginLeft: 6 }}>{t("it didn't work")}</span>}
            </div>
            <div className="th-t">{th.thought}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
