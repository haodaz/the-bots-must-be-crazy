"use client";

// The receipts: every thought the public game has paid for, like a bank statement. The money is real: each line is
// one call to Muse Ember, with its tokens and its cost. Development spending before the pool opened is shown too,
// so the whole $10 is accounted for.

import Link from "next/link";
import { useEffect, useState } from "react";
import { DEFS } from "@/engine/cards.ts";
import { LangSwitch, useLang } from "@/i18n.tsx";
import type { PublicReceipt, Summary } from "@/server/store.ts";

type Dev = { updated: string; calls: number; spentUsd: number; kinds: { what: string; calls: number; costUsd: number }[] };
type Data = { ok: boolean; summary?: Summary; dev: Dev; message?: string };

const CREDITS = 10;
const usd = (v: number, d = 4) => `$${v.toFixed(d)}`;

export default function ReceiptsView() {
  const { t } = useLang();
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      fetch("/api/receipts", { cache: "no-store" })
        .then((r) => r.json())
        .then((d: Data) => live && setData(d))
        .catch(() => {});
    load();
    const id = setInterval(load, 15000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  const s = data?.summary;
  const dev = data?.dev;
  const total = (s?.kind === "redis" ? s.spent : 0) + (dev?.spentUsd ?? 0);
  const choice = (c: string) => (!c ? "" : c === "rest" ? t("Rest") : DEFS[c as keyof typeof DEFS] ? t(DEFS[c as keyof typeof DEFS].title) : c);

  return (
    <main className="report receipts">
      <div className="btn-row" style={{ justifyContent: "space-between", marginBottom: 18 }}>
        <Link className="pbtn" href="/" style={{ textDecoration: "none" }}>
          ← {t("Back to the world")}
        </Link>
        <LangSwitch />
      </div>
      <div className="story-eyebrow">{t("Every thought, paid in real money")}</div>
      <h1>{t("Receipts")}</h1>
      <p className="lead">
        {t("Each line is one real call to Meta's Muse Ember, made when a bot woke or thought in someone's round: its tokens and what it cost. The whole project must stay under $10 of credits; this page keeps the count in public.")}
      </p>

      <div className="receipt-stats">
        <div className="panel stat">
          <div className="k">{t("Spent in all")}</div>
          <div className="v">{usd(total, 3)}</div>
          <div className="s">{t("of {credits} in credits", { credits: `$${CREDITS}` })}</div>
          <div className="bar">
            <div style={{ width: `${Math.min(100, (total / CREDITS) * 100)}%` }} />
          </div>
        </div>
        <div className="panel stat">
          <div className="k">{t("Public pool")}</div>
          <div className="v">{s ? usd(s.kind === "redis" ? s.spent : 0, 3) : "…"}</div>
          <div className="s">{s ? t("of {pool}, for everyone who plays", { pool: usd(s.kind === "redis" ? s.cap : 0, 2) }) : ""}</div>
        </div>
        <div className="panel stat">
          <div className="k">{t("Thoughts")}</div>
          <div className="v">{s ? s.thoughts.toLocaleString("en-US") : "…"}</div>
          <div className="s">{s ? t("in {n} rounds", { n: s.rounds }) : ""}</div>
        </div>
        <div className="panel stat">
          <div className="k">{t("A thought costs")}</div>
          <div className="v">{s && s.thoughts ? usd(s.receipts.reduce((a, r) => a + r.costUsd, 0) / Math.max(1, s.receipts.length), 5) : "…"}</div>
          <div className="s">{t("on average, recent")}</div>
        </div>
      </div>

      {dev && (
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="panel-h">{t("Before the public pool opened")}</div>
          <div className="panel-b">
            <p className="note" style={{ marginTop: 0 }}>
              {t("Building and testing spent {amount} in {calls} calls: the illustrations (Muse Image) and test rounds of minds (Muse Ember). The full list is in the repository.", { amount: usd(dev.spentUsd, 3), calls: dev.calls })}
            </p>
            {dev.kinds.map((k) => (
              <div key={k.what} className="kv">
                <span className="k">
                  {k.what} · {k.calls}
                </span>
                <span className="v">{usd(k.costUsd, 4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-h">
          <span>{t("Latest thoughts")}</span>
          <span className="chip">{s?.kind === "file" ? t("local test ledger") : t("live")}</span>
        </div>
        <div className="panel-b" style={{ overflowX: "auto" }}>
          {!s ? (
            <p className="note">{data && !data.ok ? data.message : t("Loading…")}</p>
          ) : s.receipts.length === 0 ? (
            <p className="note">{t("No thoughts yet. Start a round, and the first one will appear here.")}</p>
          ) : (
            <table className="receipt-table">
              <thead>
                <tr>
                  <th>{t("When (UTC)")}</th>
                  <th>{t("Round")}</th>
                  <th>{t("Bot")}</th>
                  <th>{t("Choice")}</th>
                  <th className="n">{t("Input")}</th>
                  <th className="n">{t("Cached")}</th>
                  <th className="n">{t("Output")}</th>
                  <th className="n">{t("Cost")}</th>
                </tr>
              </thead>
              <tbody>
                {s.receipts.map((r: PublicReceipt, i) => (
                  <tr key={`${r.at}-${i}`}>
                    <td>{r.at.replace("T", " ").slice(5, 19)}</td>
                    <td className="mono">{r.round.slice(-6)}</td>
                    <td>
                      #{r.bot}
                      {r.year ? ` · ${t("Y{n}", { n: r.year })}` : ""}
                    </td>
                    <td>{choice(r.choice)}</td>
                    <td className="n">{r.input}</td>
                    <td className="n">{r.cached}</td>
                    <td className="n">{r.output}</td>
                    <td className="n">{usd(r.costUsd, 6)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
