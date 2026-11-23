import { describe, expect, it } from "vitest";
import { i18nKeys } from "../scripts/i18n-keys.ts";
import { ZH } from "./i18n-zh.ts";

describe("Chinese", () => {
  it("has a translation for every string the page can show", () => {
    const missing = i18nKeys().filter((k) => !(k in ZH));
    expect(missing).toEqual([]);
  });

  it("keeps every {placeholder} of the English in the Chinese", () => {
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const broken = Object.entries(ZH).filter(([en, zh]) => holes(en).join() !== holes(zh).join());
    expect(broken).toEqual([]);
  });
});
