"use client";

// The story before the gold falls (five illustrated pages), and a short "where you are, what to do" card
// for each role the first time it is chosen. Both can be dismissed, and both can be opened again.

import { useEffect, useState } from "react";
import { EARTH } from "@/engine/earth.ts";
import type { Role } from "@/engine/cards.ts";
import { ART } from "@/art/manifest.ts";
import { useLang } from "@/i18n.tsx";

const SEEN = "tbmbc.seen";

/** Remember small things per viewer (which intros were seen). Storage can be missing or blocked: then nothing is remembered. */
export function seen(key: string): boolean {
  try {
    return (localStorage.getItem(SEEN) ?? "").split(",").includes(key);
  } catch {
    return false;
  }
}

export function markSeen(key: string) {
  try {
    const all = new Set((localStorage.getItem(SEEN) ?? "").split(",").filter(Boolean));
    all.add(key);
    localStorage.setItem(SEEN, [...all].join(","));
  } catch {
    /* nothing to remember with */
  }
}

type Page = { art: string; title: string; body: string };

export function Prologue({ onDone, last }: { onDone: () => void; last: string }) {
  const { t, lang } = useLang();
  const [i, setI] = useState(0);
  const births = lang === "zh" ? `${(EARTH.totalBirths / 1e8).toFixed(2)} 亿` : `${Math.round(EARTH.totalBirths / 1e6)} million`;
  const pages: Page[] = [
    {
      art: "intro-1-born",
      title: t("Every year, about {n} babies are born.", { n: births }),
      body: t("Not one of them chooses where."),
    },
    {
      art: "intro-2-doors",
      title: t("Where you land decides a lot."),
      body: t("The food on the table, the years of school, a light at night, a bank account, the family's money."),
    },
    {
      art: "intro-3-planet",
      title: t("So we made a small planet, to feel it."),
      body: t("100 bots, each born the way a real baby is born this year, drawn from real World Bank data. Here a day is a year, and a round is one life: 100 years."),
    },
    {
      art: "intro-4-ants",
      title: t("They have no minds yet."),
      body: t("Like ants, they live by simple rules: go where money flows, work, eat, sleep. A real mind costs real money, so here it is rare: when need or plenty wakes a bot, a grain of real AI does its thinking."),
    },
    {
      art: "intro-5-pocket",
      title: t("We don't have big money to help others."),
      body: t("But a little money can help us understand them. This world began with $4.20 that slipped out of a stranger's pocket."),
    },
  ];
  const page = pages[i];
  const end = i === pages.length - 1;
  const next = () => (end ? onDone() : setI(i + 1));

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (end) onDone();
        else setI((n) => n + 1);
      } else if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
      else if (e.key === "Escape") onDone();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [end, onDone]);

  return (
    <div className="story" role="dialog" aria-label={t("The story")}>
      <div className="story-inner">
        <div className="story-eyebrow">
          {t("Before the gold")} · {i + 1} / {pages.length}
        </div>
        <div className="story-plate" key={page.art}>
          {ART[page.art] ? <img src={ART[page.art]} alt="" /> : <div className="story-blank" />}
        </div>
        <div className="story-text" key={`t${i}`}>
          <h2>{page.title}</h2>
          <p>{page.body}</p>
        </div>
        <div className="story-nav">
          <button className="pbtn" onClick={onDone}>
            {t("Skip the story")}
          </button>
          <div className="story-dots" aria-hidden>
            {pages.map((_, k) => (
              <span key={k} className={k === i ? "on" : ""} onClick={() => setI(k)} />
            ))}
          </div>
          <div className="btn-row">
            {i > 0 && (
              <button className="pbtn" onClick={() => setI(i - 1)}>
                {t("Back")}
              </button>
            )}
            <button className="pbtn gold" onClick={next}>
              {end ? last : t("Next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** "Where you are, what to do": three steps for the role just chosen. */
export function RoleTips({ role, onClose }: { role: Role; onClose: () => void }) {
  const { t } = useLang();
  const tips: Record<Role, { title: string; steps: string[] }> = {
    watch: {
      title: t("You are the Observer"),
      steps: [
        t("The world runs by itself. At 10×, a hundred-year life takes about two minutes."),
        t("The cards along the bottom are live channels. Pick one to follow a bot, or turn on the director."),
        t("Click any bot for its birth certificate, or a nation for its story."),
      ],
    },
    god: {
      title: t("You are God"),
      steps: [
        t("You can't touch anyone. Only the land, the weather and the sky's gold."),
        t("Every 5 years the world stops and waits for you. Pick a card from your hand."),
        t("Click it again, or click a place on the map, to play it. Then press Begin year."),
      ],
    },
    king: {
      title: t("You are a King"),
      steps: [
        t("First, click a nation on the map. It becomes yours."),
        t("Your cards move your nation's money: schools, power lines, bank accounts, taxes, trade."),
        t("Every 5 years, play one card, then press Begin year."),
      ],
    },
    human: {
      title: t("You are one bot"),
      steps: [
        t("You were born by one draw, like everyone here. There is no redraw."),
        t("Your cards are a life's choices: move to the city, night school, get online, open an account."),
        t("Every 5 years, play one card, then press Begin year. The camera follows you."),
      ],
    },
  };
  const tip = tips[role];
  return (
    <div className="role-tips panel" role="dialog" aria-label={tip.title}>
      <div className="panel-h">
        <span>{tip.title}</span>
        <span className="chip">{t("How to play")}</span>
      </div>
      <ol className="panel-b">
        {tip.steps.map((s, k) => (
          <li key={k}>
            <span className="n">{k + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <div className="role-tips-foot">
        <button className="pbtn gold" onClick={onClose}>
          {t("Got it")}
        </button>
      </div>
    </div>
  );
}
