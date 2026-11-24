"use client";

// The listening room: the scores Muse Ember wrote, each theme playable on its own, with the score itself shown as text.
// A visitor can pick which score the game plays (kept in this browser).

import Link from "next/link";
import { useEffect, useState } from "react";
import { LangSwitch, useLang } from "@/i18n.tsx";
import { THEME_BRIEF, type Score, type ThemeId } from "@/music/score.ts";
import { band } from "./music.ts";
import { DEFAULT_SCORE, scorePref, setScorePref } from "./scorePref.ts";

type Entry = { id: string; title: string; note: string; costUsd: number; at: string };

const STYLE: Record<string, string> = { "music-box": "Music box", chiptune: "Chiptune", folk: "Folk" };
const LABEL: Record<ThemeId, string> = {
  story: "The story",
  genesis: "The gold falls",
  calm: "Calm",
  hard: "Hard times",
  rain: "Gold rain",
  wakeNeed: "Wakes from need",
  wakePlenty: "Wakes from plenty",
  faint: "Faints",
  end: "The end",
};

export default function MusicView() {
  const { t } = useLang();
  const [list, setList] = useState<Entry[]>([]);
  const [scores, setScores] = useState<Record<string, Score>>({});
  const [playing, setPlaying] = useState<string | null>(null);
  const [chosen, setChosen] = useState(DEFAULT_SCORE);

  useEffect(() => {
    setChosen(scorePref());
    fetch("/music/index.json")
      .then((r) => r.json())
      .then(async (l: Entry[]) => {
        setList(l);
        const all = await Promise.all(l.map((e) => fetch(`/music/${e.id}.json`).then((r) => r.json() as Promise<Score>)));
        setScores(Object.fromEntries(l.map((e, i) => [e.id, all[i]])));
      })
      .catch(() => {});
    return () => band.want(null);
  }, []);

  function play(id: string, theme: ThemeId) {
    const s = scores[id];
    if (!s) return;
    band.setScore(s);
    band.start();
    if (THEME_BRIEF[theme].loop) band.want(theme);
    else {
      band.want(null);
      band.sting(theme, 0);
    }
    setPlaying(`${id}:${theme}`);
  }

  function stop() {
    band.want(null);
    setPlaying(null);
  }

  return (
    <main className="report music-room">
      <div className="btn-row" style={{ justifyContent: "space-between", marginBottom: 18 }}>
        <Link className="pbtn" href="/" style={{ textDecoration: "none" }}>
          ← {t("Back to the world")}
        </Link>
        <LangSwitch />
      </div>
      <div className="story-eyebrow">{t("Written by Muse Ember, played by your browser")}</div>
      <h1>{t("The music")}</h1>
      <p className="lead">
        {t("No Meta model makes sound, so Muse Ember wrote the game's music the way a composer writes a score: keys, tempos and notes, as text. Your browser plays it on a small synthesizer. Each score cost under half a cent. Pick the one the game should play.")}
      </p>
      <div className="btn-row" style={{ marginBottom: 14 }}>
        <button className="pbtn" onClick={stop} disabled={!playing}>
          ■ {t("Stop")}
        </button>
      </div>
      <div className="music-grid">
        {list.map((e) => {
          const s = scores[e.id];
          return (
            <div key={e.id} className={`panel music-card ${chosen === e.id ? "chosen" : ""}`}>
              <div className="panel-h">
                <span>{t(STYLE[e.id] ?? e.id)}</span>
                <span className="chip">${e.costUsd.toFixed(4)}</span>
              </div>
              <div className="panel-b">
                <p className="note" style={{ marginTop: 0 }}>
                  {e.note}
                </p>
                <div className="music-themes">
                  {(s?.themes ?? []).map((th) => (
                    <button
                      key={th.id}
                      className={`chip chip-btn ${playing === `${e.id}:${th.id}` ? "gold" : ""}`}
                      title={THEME_BRIEF[th.id].brief}
                      onClick={() => (playing === `${e.id}:${th.id}` ? stop() : play(e.id, th.id))}
                    >
                      {playing === `${e.id}:${th.id}` ? "■" : "▶"} {t(LABEL[th.id])}
                    </button>
                  ))}
                </div>
                <button
                  className={`pbtn ${chosen === e.id ? "gold" : ""}`}
                  style={{ marginTop: 12 }}
                  onClick={() => {
                    setScorePref(e.id);
                    setChosen(e.id);
                  }}
                >
                  {chosen === e.id ? `✓ ${t("The game plays this one")}` : t("Play this one in the game")}
                </button>
                {s && (
                  <details className="score-text">
                    <summary>{t("Read the score")}</summary>
                    <pre>
                      {s.themes
                        .map((th) => `${th.id} · ${th.bpm} bpm · ${th.scale} · root ${th.root} · ${th.bars} bars\n${th.voices.map((v) => `  ${v.instrument} (${v.octave >= 0 ? "+" : ""}${v.octave}): ${v.notes}`).join("\n")}${th.drums ? `\n  drums: ${th.drums}` : ""}`)
                        .join("\n\n")}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
