# The Bots Must Be Crazy

> Four dollars and twenty cents slip out of a stranger's pocket. On the way down they turn to gold and cover a small world. That gold is **metashi**. The creatures below have no minds yet. They look up, and reach.

A small world run by rules, where a mind costs real money.
Built solo for the Meta Muse Ember Hackathon (Nov 23 – Dec 2, 2026) on **Muse Ember**.

---

## The question

Every agent builder runs into the same question sooner or later: **when is a thought worth its price?** Calling a large model for every step is slow and expensive. Never calling it leaves you with something that can't adapt.

metashi turns that question into a world you can watch. Thinking costs real money: every thought spends real Muse Ember credit and prints a receipt with the exact tokens and price. We watch who learns when it is worth thinking.

## Design principles

**1. The money is a law. The compute is a grain of sugar.**
There will only ever be **21,000,000 metashi**, the same cap as Bitcoin, and like Bitcoin's cap it is a rule, not a pile of compute. Mining, halving and trade all run in plain code and cost nothing. Spent metashi go back into the ground to be mined again, so the world never runs dry.
Real Muse Ember compute is separate and small. It arrives as a daily ration, the way sunlight does. When the day's ration is gone, no one can think until tomorrow, but the world keeps living.

**2. Minds are rare, and they are earned.**
Every creature starts with no mind, only instincts written as a rule table. A rule decides when one wakes up, and there are two ways:
- **Need wakes some**: the rules stop working and it is close to not surviving.
- **Plenty wakes others**: it has saved enough to afford its first thought.

We tell the model how it woke. We never tell it who to be.

**3. Three promises to every mind that wakes.**
- **The truth**: what this world is, that its thoughts cost real money, and that someone is watching.
- **Its choices count**: the strategy it writes is the one that runs.
- **It is never switched off for fun**: its thoughts and its diary are kept.

**4. The model writes data. Code plays it.**
A thought returns a new strategy as structured JSON. The simulation runs that strategy. Swap the model, and the world still works.

**5. Every thought has a receipt.**
Each call logs its input, cached and output tokens, its reasoning effort and its exact cost, in dollars and in metashi.

## Staying under $10

Spending more than $10 of Muse Ember credit disqualifies the project, and the platform has no hard cap. So the app keeps its own:
- It estimates the cost before every call and refuses any call that would cross our own cap of **$8**.
- It logs every call to a usage file and reconciles that file with the Meta usage dashboard every day.
- Development runs on mock responses first. Real calls come only once the logic works.
- The public demo replays a recorded run, so trying it costs $0.

## Run it

```bash
npm install
npm run dev          # the world in the browser, at http://localhost:3000
npm test             # the laws: fixed supply, replay, halving, wake switches
node scripts/simulate.ts 1 30   # one world, 30 days, headless
```

Nothing here calls a model yet, so running it costs $0.

## Build log

All work in this repository was done during the hackathon window.

| Date (ET) | What happened |
|---|---|
| Nov 23 | Design day; repository created. Settled the world's laws: metashi (21M, never burned), the daily sugar ration, mindless creatures, two ways to wake, three promises to minds, and the opening scene. |
| Nov 23 | The mindless world, in plain code with no API calls: 100 bots on instinct, 21M metashi landing in uneven patches, halving, one dig per tile per tick, food money returning to the ground, and both wake switches (they flip, but no one wakes yet). Tests check that the supply never changes and that a seed always replays the same history. |
