"use client";

// Languages. Every string on screen is written in English and passed through t(); the English is the key.
// Engine events and card results arrive as templates with params, so they can be shown in any language too.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fill, type Params } from "@/engine/world.ts";
import { ZH } from "./i18n-zh.ts";

export type Lang = "en" | "zh";
export const LANGS: { id: Lang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "zh", label: "中文" },
];

/** Params whose values are themselves words to translate. */
const WORD_PARAMS = ["policy", "choice", "reach", "role"];

export function translate(lang: Lang, key: string, params?: Params): string {
  if (lang === "en") return fill(key, params);
  const p: Params = { ...(params ?? {}) };
  for (const k of WORD_PARAMS) if (p[k] != null) p[k] = ZH[String(p[k])] ?? p[k];
  if (p.dayCount != null) p.days = `${p.dayCount} 天`;
  return fill(ZH[key] ?? key, p);
}

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: "en", setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("lang", l);
    } catch {
      // Storage may be blocked; the choice just won't be remembered.
    }
    document.documentElement.lang = l === "zh" ? "zh-Hans" : "en";
  };
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("lang");
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("lang");
    } catch {
      saved = null;
    }
    const want = fromUrl ?? saved;
    if (want === "zh" || want === "en") setLang(want);
  }, []);
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export function useLang() {
  const { lang, setLang } = useContext(Ctx);
  return { lang, setLang, t: (key: string, params?: Params) => translate(lang, key, params) };
}

export function LangSwitch() {
  const { lang, setLang } = useLang();
  return (
    <button className="pbtn" onClick={() => setLang(lang === "en" ? "zh" : "en")} aria-label="Language">
      {lang === "en" ? "中文" : "English"}
    </button>
  );
}
