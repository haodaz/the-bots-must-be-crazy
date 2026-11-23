"use client";

// The cards: gilded frames, an arched window for the art, a ribbon for the name.
// The art is an engraved emblem drawn in code for now; illustrated art can replace it later.

import type { ReactNode } from "react";
import { DEFS, cardParams, type Card, type Kind, type Role } from "@/engine/cards.ts";
import { useLang } from "@/i18n.tsx";
import { ART } from "@/art/manifest.ts";

const INK = "#2b2417";
const GOLD = "#d4a12a";
const CREAM = "#fff5dc";

type EmblemKey = Kind | "watch" | "god" | "king" | "human";

/** Engraved emblems on a 64×64 grid. */
const EMBLEMS: Record<EmblemKey, ReactNode> = {
  harvest: (
    <>
      <circle cx="32" cy="16" r="9" fill={GOLD} stroke={INK} strokeWidth="2" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line key={a} x1={32 + 12 * Math.cos((a * Math.PI) / 180)} y1={16 + 12 * Math.sin((a * Math.PI) / 180)} x2={32 + 16 * Math.cos((a * Math.PI) / 180)} y2={16 + 16 * Math.sin((a * Math.PI) / 180)} stroke={INK} strokeWidth="2" />
      ))}
      {[-10, 0, 10].map((dx) => (
        <g key={dx}>
          <path d={`M${32 + dx} 58 Q${32 + dx * 0.6} 44 ${32 + dx * 1.3} 30`} stroke={INK} strokeWidth="2" fill="none" />
          {[0, 1, 2].map((k) => (
            <ellipse key={k} cx={32 + dx * 1.2 + (k % 2 ? 3 : -3)} cy={34 + k * 6} rx="3" ry="5" fill="#e9c463" stroke={INK} strokeWidth="1.5" />
          ))}
        </g>
      ))}
    </>
  ),
  drought: (
    <>
      <circle cx="32" cy="18" r="11" fill="#e98b3a" stroke={INK} strokeWidth="2" />
      {[0, 1, 2].map((k) => (
        <path key={k} d={`M${14 + k * 14} 36 q3 -3 0 -6 q-3 -3 0 -6`} stroke={INK} strokeWidth="1.8" fill="none" />
      ))}
      <rect x="6" y="44" width="52" height="14" fill="#d8b27a" stroke={INK} strokeWidth="2" />
      <path d="M12 44 l6 6 l-3 8 M30 44 l-4 7 l6 7 M46 44 l5 5 l-4 9" stroke={INK} strokeWidth="1.8" fill="none" />
    </>
  ),
  skyGift: (
    <>
      <path d="M14 30 a10 10 0 0 1 12 -12 a12 12 0 0 1 22 4 a8 8 0 0 1 2 16 h-34 a8 8 0 0 1 -2 -8z" fill={CREAM} stroke={INK} strokeWidth="2" />
      {[[20, 46], [32, 52], [44, 44], [26, 58], [40, 58]].map(([x, y]) => (
        <g key={`${x}${y}`}>
          <circle cx={x} cy={y} r="4.5" fill={GOLD} stroke={INK} strokeWidth="1.6" />
          <line x1={x} y1={y - 2} x2={x} y2={y + 2} stroke={INK} strokeWidth="1.2" />
        </g>
      ))}
    </>
  ),
  flood: (
    <>
      <path d="M20 30 l12 -12 l12 12 v8 h-24z" fill="#d8c39a" stroke={INK} strokeWidth="2" />
      {[38, 46, 54].map((y) => (
        <path key={y} d={`M4 ${y} q6 -5 12 0 t12 0 t12 0 t12 0 t12 0`} stroke={INK} strokeWidth="2.2" fill="none" />
      ))}
      <path d="M4 46 q6 -5 12 0 t12 0 t12 0 t12 0 t12 0 v14 h-60z" fill="#9cc3e6" opacity="0.6" />
    </>
  ),
  plenty: (
    <>
      <rect x="29" y="40" width="6" height="18" fill="#8a6a3e" stroke={INK} strokeWidth="2" />
      <circle cx="32" cy="28" r="18" fill="#7e9b4f" stroke={INK} strokeWidth="2" />
      {[[24, 22], [38, 20], [30, 32], [42, 32], [22, 34], [34, 14]].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="3.5" fill="#d9542e" stroke={INK} strokeWidth="1.2" />
      ))}
    </>
  ),
  schools: (
    <>
      <path d="M8 18 q12 -4 24 4 q12 -8 24 -4 v32 q-12 -4 -24 4 q-12 -8 -24 -4z" fill={CREAM} stroke={INK} strokeWidth="2" />
      <line x1="32" y1="22" x2="32" y2="54" stroke={INK} strokeWidth="2" />
      {[28, 34, 40].map((y) => (
        <g key={y}>
          <line x1="13" y1={y} x2="27" y2={y + 2} stroke={INK} strokeWidth="1.3" />
          <line x1="37" y1={y + 2} x2="51" y2={y} stroke={INK} strokeWidth="1.3" />
        </g>
      ))}
    </>
  ),
  power: (
    <>
      <path d="M32 8 a16 16 0 0 1 9 29 v7 h-18 v-7 a16 16 0 0 1 9 -29z" fill="#f3d77c" stroke={INK} strokeWidth="2" />
      <path d="M27 30 l5 -8 l5 8" stroke={INK} strokeWidth="1.8" fill="none" />
      <rect x="24" y="44" width="16" height="10" fill="#b9a68d" stroke={INK} strokeWidth="2" />
      {[0, 1, 2, 3, 4].map((k) => (
        <line key={k} x1={32 + 20 * Math.cos(Math.PI + (k * Math.PI) / 4)} y1={24 + 20 * Math.sin(Math.PI + (k * Math.PI) / 4)} x2={32 + 25 * Math.cos(Math.PI + (k * Math.PI) / 4)} y2={24 + 25 * Math.sin(Math.PI + (k * Math.PI) / 4)} stroke={INK} strokeWidth="2" />
      ))}
    </>
  ),
  accounts: (
    <>
      <rect x="12" y="14" width="40" height="40" rx="3" fill={CREAM} stroke={INK} strokeWidth="2" />
      {[22, 30, 38, 46].map((y) => (
        <line key={y} x1="18" y1={y} x2="46" y2={y} stroke={INK} strokeWidth="1.3" />
      ))}
      <circle cx="44" cy="46" r="9" fill={GOLD} stroke={INK} strokeWidth="2" />
      <text x="44" y="50" textAnchor="middle" fontSize="11" fontWeight="700" fill={INK}>
        ✓
      </text>
    </>
  ),
  taxCut: (
    <>
      <circle cx="32" cy="28" r="16" fill={GOLD} stroke={INK} strokeWidth="2" />
      <circle cx="32" cy="28" r="11" fill="none" stroke={INK} strokeWidth="1.3" />
      <path d="M32 46 v12 M25 51 l7 7 l7 -7" stroke="#3f7a4a" strokeWidth="3" fill="none" />
    </>
  ),
  taxRaise: (
    <>
      <circle cx="32" cy="36" r="16" fill={GOLD} stroke={INK} strokeWidth="2" />
      <circle cx="32" cy="36" r="11" fill="none" stroke={INK} strokeWidth="1.3" />
      <path d="M32 18 v-12 M25 13 l7 -7 l7 7" stroke="#b8402e" strokeWidth="3" fill="none" />
    </>
  ),
  trade: (
    <>
      <path d="M6 40 h40 l-6 10 h-28z" fill="#a9825a" stroke={INK} strokeWidth="2" />
      <line x1="26" y1="40" x2="26" y2="10" stroke={INK} strokeWidth="2" />
      <path d="M26 12 l16 14 h-16z" fill={CREAM} stroke={INK} strokeWidth="2" />
      <path d="M4 56 q6 -4 12 0 t12 0 t12 0 t12 0 t12 0" stroke={INK} strokeWidth="2" fill="none" />
      <path d="M46 18 h12 M54 14 l4 4 l-4 4 M58 30 h-12 M50 26 l-4 4 l4 4" stroke={INK} strokeWidth="1.8" fill="none" />
    </>
  ),
  aid: (
    <>
      <path d="M32 54 l-18 -18 a10 10 0 0 1 18 -14 a10 10 0 0 1 18 14z" fill="#d9542e" stroke={INK} strokeWidth="2" />
      <circle cx="32" cy="34" r="7" fill={GOLD} stroke={INK} strokeWidth="1.6" />
    </>
  ),
  sanction: (
    <>
      <rect x="10" y="14" width="44" height="40" fill="#b9a68d" stroke={INK} strokeWidth="2" />
      {[18, 26, 34, 42, 50].map((x) => (
        <line key={x} x1={x} y1="14" x2={x} y2="54" stroke={INK} strokeWidth="2" />
      ))}
      <circle cx="32" cy="34" r="8" fill={GOLD} stroke={INK} strokeWidth="2" />
      <rect x="29" y="34" width="6" height="8" fill={INK} />
    </>
  ),
  toCity: (
    <>
      {[[8, 30, 10], [20, 18, 12], [34, 26, 10], [46, 14, 12]].map(([x, y, w]) => (
        <rect key={x} x={x} y={y} width={w} height={44 - y} fill={CREAM} stroke={INK} strokeWidth="2" />
      ))}
      {[24, 28, 50, 54].map((x) => (
        <rect key={x} x={x} y={24} width="2.5" height="3" fill={GOLD} />
      ))}
      <path d="M20 60 l8 -16 h8 l8 16" fill="#d8c39a" stroke={INK} strokeWidth="2" />
      <line x1="32" y1="46" x2="32" y2="58" stroke={INK} strokeWidth="1.5" strokeDasharray="2 3" />
    </>
  ),
  nightSchool: (
    <>
      <path d="M6 40 q13 -4 26 2 q13 -6 26 -2 v14 q-13 -4 -26 2 q-13 -6 -26 -2z" fill={CREAM} stroke={INK} strokeWidth="2" />
      <rect x="28" y="16" width="8" height="18" fill={CREAM} stroke={INK} strokeWidth="2" />
      <path d="M32 6 q4 5 0 9 q-4 -4 0 -9z" fill="#e98b3a" stroke={INK} strokeWidth="1.5" />
    </>
  ),
  getOnline: (
    <>
      <rect x="22" y="22" width="20" height="34" rx="3" fill="#56422a" stroke={INK} strokeWidth="2" />
      <rect x="25" y="26" width="14" height="22" fill="#9cc3e6" />
      {[8, 14, 20].map((r) => (
        <path key={r} d={`M${32 - r} ${18 - r * 0.2} a${r} ${r} 0 0 1 ${r * 2} 0`} stroke={INK} strokeWidth="2" fill="none" />
      ))}
    </>
  ),
  openAccount: (
    <>
      <circle cx="22" cy="32" r="12" fill="none" stroke={INK} strokeWidth="3" />
      <circle cx="22" cy="32" r="12" fill={GOLD} opacity="0.4" />
      <path d="M34 32 h24 M50 32 v8 M56 32 v6" stroke={INK} strokeWidth="3.5" fill="none" />
    </>
  ),
  workHarder: (
    <>
      <rect x="28" y="22" width="6" height="36" rx="2" fill="#a9825a" stroke={INK} strokeWidth="2" transform="rotate(-30 31 40)" />
      <rect x="14" y="10" width="30" height="12" rx="2" fill="#8d8576" stroke={INK} strokeWidth="2" transform="rotate(-30 29 16)" />
      {[0, 1, 2].map((k) => (
        <line key={k} x1={46 + k * 4} y1={44 - k * 6} x2={52 + k * 4} y2={40 - k * 6} stroke={INK} strokeWidth="2" />
      ))}
    </>
  ),
  helpNeighbor: (
    <>
      <ellipse cx="32" cy="34" rx="18" ry="11" fill="#d9a35a" stroke={INK} strokeWidth="2" />
      {[24, 32, 40].map((x) => (
        <path key={x} d={`M${x - 3} 30 q3 -4 6 0`} stroke={INK} strokeWidth="1.6" fill="none" />
      ))}
      <path d="M8 52 q12 -6 24 0 q12 6 24 0" stroke={INK} strokeWidth="2" fill="none" />
    </>
  ),
  watch: (
    <>
      <path d="M6 32 q26 -26 52 0 q-26 26 -52 0z" fill={CREAM} stroke={INK} strokeWidth="2.2" />
      <circle cx="32" cy="32" r="10" fill="#7a9ab5" stroke={INK} strokeWidth="2" />
      <circle cx="32" cy="32" r="4" fill={INK} />
      <circle cx="35" cy="29" r="1.6" fill={CREAM} />
    </>
  ),
  god: (
    <>
      {Array.from({ length: 12 }, (_, k) => (
        <path key={k} d="M32 32 L30 6 L34 6 Z" fill={k % 2 ? GOLD : "#f3d77c"} stroke={INK} strokeWidth="1" transform={`rotate(${k * 30} 32 32)`} />
      ))}
      <circle cx="32" cy="32" r="12" fill="#f3d77c" stroke={INK} strokeWidth="2" />
      <path d="M24 32 q8 -7 16 0 q-8 7 -16 0z" fill={CREAM} stroke={INK} strokeWidth="1.5" />
      <circle cx="32" cy="32" r="3" fill={INK} />
    </>
  ),
  king: (
    <>
      <path d="M10 46 l-2 -26 l12 10 l12 -18 l12 18 l12 -10 l-2 26z" fill={GOLD} stroke={INK} strokeWidth="2" />
      <rect x="10" y="46" width="44" height="8" fill="#b8862b" stroke={INK} strokeWidth="2" />
      {[[8, 20], [32, 12], [56, 20]].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r="3.5" fill="#b8402e" stroke={INK} strokeWidth="1.5" />
      ))}
      <circle cx="32" cy="38" r="4" fill="#3a6ea5" stroke={INK} strokeWidth="1.5" />
    </>
  ),
  human: (
    <>
      <circle cx="32" cy="16" r="8" fill="#d9a35a" stroke={INK} strokeWidth="2" />
      <path d="M18 58 q0 -28 14 -30 q14 2 14 30z" fill="#7e9b4f" stroke={INK} strokeWidth="2" />
      <path d="M8 60 h48" stroke={INK} strokeWidth="2" />
      <path d="M40 60 l8 -10 l8 10" stroke={INK} strokeWidth="1.5" fill="none" />
    </>
  ),
};

export function Emblem({ name }: { name: EmblemKey }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden>
      {EMBLEMS[name]}
    </svg>
  );
}

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI"];

/** One playable card from a hand. */
export function GameCard({
  card,
  selected,
  disabled,
  hint,
  onClick,
  style,
}: {
  card: Card;
  selected?: boolean;
  disabled?: boolean;
  hint?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  const { t } = useLang();
  const d = DEFS[card.kind];
  const target =
    d.target === "area"
      ? t(`${card.reach} area`)
      : d.target === "nation"
        ? t("another nation")
        : d.target === "kingdom"
          ? t("your nation")
          : d.target === "self"
            ? t("your life")
            : t("the world");
  return (
    <button className={`gcard fam-${d.family} ${selected ? "selected" : ""} ${disabled ? "disabled" : ""}`} onClick={onClick} style={style}>
      <span className="gcard-corner tl" />
      <span className="gcard-corner tr" />
      <span className="gcard-corner bl" />
      <span className="gcard-corner br" />
      {card.days > 0 && <span className="gcard-gem">{ROMAN[card.days] ?? card.days}</span>}
      <span className="gcard-title">{t(d.title)}</span>
      <span className="gcard-art">{ART[`card-${card.kind}`] ? <img src={ART[`card-${card.kind}`]} alt="" /> : <Emblem name={card.kind} />}</span>
      <span className="gcard-type">
        {d.family === "god" ? t("God") : d.family === "king" ? t("King") : t("Human")} · {target}
      </span>
      <span className="gcard-text">{t(d.text, cardParams(card))}</span>
      <span className="gcard-flavor">{hint ?? `“${t(d.flavor)}”`}</span>
    </button>
  );
}

const ROLE_TEXT: Record<Role, { title: string; line: string; detail: string }> = {
  watch: {
    title: "Observer",
    line: "Hands off. Just see.",
    detail: "Follow the live channels and the director. Nothing you do changes the world.",
  },
  god: {
    title: "God",
    line: "Weather, harvests, the sky's gold.",
    detail: "Bring harvests and droughts, floods and seasons of plenty, or call down the sky's gold early.",
  },
  king: {
    title: "King",
    line: "One nation's laws and treasury.",
    detail: "Rule one nation: schools, electricity, accounts, taxes, trade routes, aid and sanctions.",
  },
  human: {
    title: "Human",
    line: "One ordinary life. One draw.",
    detail: "Draw a birth certificate, once, with no redraw. Then live it, with a few choices at the crossroads.",
  },
};

/** The big cards for choosing how to enter the world. */
export function RoleCard({ role, onClick }: { role: Role; onClick: () => void }) {
  const { t: tr } = useLang();
  const t = ROLE_TEXT[role];
  return (
    <button className={`gcard big fam-${role}`} onClick={onClick}>
      <span className="gcard-corner tl" />
      <span className="gcard-corner tr" />
      <span className="gcard-corner bl" />
      <span className="gcard-corner br" />
      <span className="gcard-title">{tr(t.title)}</span>
      <span className="gcard-art">{ART[`role-${role}`] ? <img src={ART[`role-${role}`]} alt="" /> : <Emblem name={role} />}</span>
      <span className="gcard-type">{tr(t.line)}</span>
      <span className="gcard-text">{tr(t.detail)}</span>
      <span className="gcard-flavor">{role === "watch" ? tr("No cards") : tr("A hand of 4 · draw 1 a day · play 1 a day")}</span>
    </button>
  );
}
