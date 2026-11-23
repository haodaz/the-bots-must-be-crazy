import { describe, expect, it } from "vitest";
import { DECK_SIZE, DEFS, dealDeck, playCard, type Card, type Kind } from "./cards.ts";
import { LAWS } from "./laws.ts";
import { createWorld, foodPriceAt, ledger, step } from "./world.ts";

const card = (kind: Kind, pct = 0.4, days = 2): Card => ({ uid: 1, kind, pct, reach: "wide", days });

function setup() {
  const w = createWorld(21, {}, { planet: "new" });
  for (let i = 0; i < 1500; i++) step(w);
  const me = w.bots.find((b) => b.wallet > 1000)!;
  const kingdom = me.birth.countryIdx;
  const other = w.countries.findIndex((_, i) => i !== kingdom && w.bots.some((b) => b.birth.countryIdx === i));
  w.countries[kingdom].treasury += 0; // treasuries fill from tax over the first ticks
  return { w, me, kingdom, other, at: { x: me.x + 0.5, y: me.y + 0.5 } };
}

describe("cards", () => {
  it("deal a deck of the right size, all from one family", () => {
    const deck = dealDeck({ rng: 5 }, "god");
    expect(deck).toHaveLength(DECK_SIZE);
    expect(deck.every((c) => DEFS[c.kind].family === "god")).toBe(true);
  });

  it("never make or destroy a metashi, whatever is played", () => {
    const { w, me, kingdom, other, at } = setup();
    for (const kind of Object.keys(DEFS) as Kind[]) {
      const r = playCard(w, card(kind), { at, ci: other, kingdom, botId: me.id });
      expect(r.ok || r.reason.length > 0).toBe(true);
      for (let i = 0; i < 200; i++) step(w);
      expect(ledger(w).total).toBe(LAWS.SUPPLY);
    }
  });

  it("make food dearer under a drought, and cheaper under a harvest", () => {
    const { w, me, at } = setup();
    const before = foodPriceAt(w, me);
    playCard(w, card("drought", 0.5), { at });
    expect(foodPriceAt(w, me)).toBe(Math.round(before * 1.5));
    playCard(w, card("harvest", 0.5), { at });
    expect(foodPriceAt(w, me)).toBe(Math.round(before * 1.5 * 0.5));
  });

  it("let a gift from the sky fall early, from the sky's own gold", () => {
    const { w, at } = setup();
    const sky = w.sky;
    const r = playCard(w, card("skyGift", 0.1), { at });
    expect(r.ok).toBe(true);
    expect(w.sky).toBe(sky - Math.floor(sky * 0.1));
  });

  it("let a king school a whole nation and pay for it from the treasury", () => {
    const { w, kingdom } = setup();
    w.countries[kingdom].treasury = 50_000;
    const priceBefore = w.countries[kingdom].foodPrice;
    const r = playCard(w, card("schools", 0.5), { kingdom });
    expect(r.ok).toBe(true);
    expect(w.countries[kingdom].treasury).toBe(25_000);
    expect(w.bots.filter((b) => b.birth.countryIdx === kingdom).every((b) => b.birth.schoolYears >= 12)).toBe(true);
    expect(w.countries[kingdom].foodPrice).toBeLessThanOrEqual(priceBefore);
  });

  it("refuse cards that need a target they don't have", () => {
    const { w } = setup();
    expect(playCard(w, card("harvest"), {}).ok).toBe(false);
    expect(playCard(w, card("schools"), {}).ok).toBe(false);
    expect(playCard(w, card("nightSchool"), {}).ok).toBe(false);
  });

  it("let rule changes run out", () => {
    const { w, me, at } = setup();
    const before = foodPriceAt(w, me);
    playCard(w, card("drought", 0.5, 1), { at });
    for (let i = 0; i < LAWS.DAY_TICKS * 2; i++) step(w);
    const moved = w.bots[me.id];
    expect(foodPriceAt(w, moved)).toBe(w.countries[moved.birth.countryIdx].foodPrice);
    expect(before).toBeGreaterThan(0);
  });
});
