# The Bots Must Be Crazy

> Four dollars and twenty cents slip out of a stranger's pocket. On the way down they turn to gold and cover a small world. That gold is **metashi**. The creatures below have no minds yet. They look up, and reach.

*We don't have big money to help others. But a little money can help us understand them.*
*Understanding is where change begins.*

A small world run by rules, where every creature is born the way a real baby is born this year, and a mind costs real money.
Built solo for the Meta Muse Ember Hackathon (Nov 23 – Dec 2, 2026) on **Muse Ember**.

---

## The question

Every agent builder runs into the same question sooner or later: **when is a thought worth its price?** Calling a large model for every step is slow and expensive. Never calling it leaves you with something that can't adapt.

metashi turns that question into a world you can watch. Thinking costs real money: every thought spends real Muse Ember credit and prints a receipt with the exact tokens and price. We watch who learns when it is worth thinking.

## Design principles

**1. metashi is money, not ore. The compute is a grain of sugar.**
There will only ever be **21,000,000 metashi**, the same cap as Bitcoin. Like Bitcoin, new money arrives on a halving schedule: the first gold rain brings half the supply, and every five days the sky gives half as much as the time before, so the total creeps toward 21M and never quite reaches it. The rain lands in the world's economies the way wealth lands today (by real GDP) and glows on the map like city lights. Bots earn it by working where the economy is; what they spend on food and other things goes back into their country's economy and becomes someone else's wage.
Real Muse Ember compute is separate and small. It arrives as a daily ration, the way sunlight does. When the day's ration is gone, no one can think until tomorrow, but the world keeps living.

**2. Every bot is born by the real birth lottery.**
Where a bot is born is drawn in proportion to real births by country. Its country decides the rest of its birth certificate, from real World Bank numbers:

| Real-world number | What it does in the world |
|---|---|
| Births by country | Where bots are born. About one in six is born in India. |
| GDP (PPP) by country | Where new money rains into the economy. |
| Income share of the richest 10% | How family money is shared out inside a country. |
| Expected years of school | How much an hour of work earns and how productive a country is (+9% per year, the global average return to schooling: Psacharopoulos & Patrinos, World Bank, 2018), and how far a bot can see work. |
| Internet use | Whether it grew up with tools: tools double what an hour earns. |
| Access to electricity | Without it, a bot sleeps through the night; with it, a country gets the night's working hours. |
| Bank or mobile-money account | Without one, welfare can't reach it. |
| Tax revenue | How much of each wage goes to the country's treasury, which feeds the starving. |
| Price level | What food costs in each country, together with its productivity: with a fixed supply of money, more output shows up as lower prices. |

By instinct, a bot never leaves the country it was born in. Chance may be the fairest thing there is; the unfair part is getting only one draw.

**The map.** The world can be the real Earth (country borders from Natural Earth, terrain sketched from real deserts, mountains and ice), or a new planet every time: Earth's share of land, a few large continents, Earth-like terrain, a fresh palette, and the 217 real countries on it, each with land in proportion to its real area. The planet is only the skin; the lottery underneath stays real. You can zoom from a pixel world map down to each bot's dot-matrix body, draw a red box to see everyone in an area, and open a card for any bot or country.

**3. Minds are rare, and they are earned.**
Every creature starts with no mind, only instincts written as a rule table. A rule decides when one wakes up, and there are two ways:
- **Need wakes some**: the rules stop working and it is close to not surviving.
- **Plenty wakes others**: it has saved enough to afford its first thought.

We tell the model how it woke. We never tell it who to be.

**4. Three promises to every mind that wakes.**
- **The truth**: what this world is, that its thoughts cost real money, and that someone is watching.
- **Its choices count**: the strategy it writes is the one that runs.
- **It is never switched off for fun**: its thoughts and its diary are kept.

**5. The model writes data. Code plays it.**
A thought returns a new strategy as structured JSON. The simulation runs that strategy. Swap the model, and the world still works.

**6. Every thought has a receipt.**
Each call logs its input, cached and output tokens, its reasoning effort and its exact cost, in dollars and in metashi.

## Staying under $10

Spending more than $10 of Muse Ember credit disqualifies the project, and the platform has no hard cap. So the app keeps its own:
- It estimates the cost before every call and refuses any call that would cross our own cap of **$8**.
- It logs every call to a usage file and reconciles that file with the Meta usage dashboard every day.
- Development runs on mock responses first. Real calls come only once the logic works.
- The public demo replays a recorded run, so trying it costs $0.

## Data

Real-world numbers come from [World Bank Open Data](https://data.worldbank.org) (CC BY 4.0), fetched with `node scripts/fetch-world-data.ts` into `data/world/countries.json`. Each country uses its most recent available year; missing values are filled with the regional median and marked as filled. Country borders come from [Natural Earth](https://www.naturalearthdata.com) 1:110m (public domain), turned into the pixel map with `node scripts/build-map.ts`.

**Calibration.** The price of food is set so that the share of bots who run out of food and money matches the real prevalence of undernourishment (FAO, *The State of Food Security and Nutrition in the World 2024*): about 9% worldwide in the model and in reality, about 27% in Sub-Saharan Africa (FAO: about 20–23%), and none in Europe and North America (FAO: under 2.5%).

**Limits.** The world is a toy model built to help people feel the birth lottery, not a forecast. South Asia comes out less hungry in the model than in reality. There is no migration, trade between countries, or growth beyond what schooling, tools and electricity add.

## Run it

```bash
npm install
npm run dev          # the world in the browser, at http://localhost:3000
npm test             # the laws: fixed supply, replay, halving, wake switches
node scripts/simulate.ts 1 30   # one world, 30 days, headless
node scripts/impact.ts 50 30    # the impact report: 50 paired worlds per lever → reports/impact.json
node scripts/build-map.ts       # rebuild the Earth pixel map from Natural Earth borders
```

The page has the live world at `/` and the impact report at `/report`.

## The impact report

For each lever, the same 50 seeds run twice: once as the world is, once with one thing changed. Each pair has the very same bots, born the same way, with the same luck, on the same newly generated planet, so the difference is the worth of that one thing (inside this model). Levers: twelve years of school for everyone, electricity for everyone, a bank account for everyone, internet and tools for everyone, all four together, no family money, and new money landing where the babies are. The report shows days starving, bots who ran out of food and money, and the poorer half's share of money, with 95% ranges.

Nothing here calls a model yet, so running it costs $0.

## Build log

All work in this repository was done during the hackathon window.

| Date (ET) | What happened |
|---|---|
| Nov 23 | Design day; repository created. Settled the world's laws: metashi (21M, never burned), the daily sugar ration, mindless creatures, two ways to wake, three promises to minds, and the opening scene. |
| Nov 23 | The mindless world, in plain code with no API calls: 100 bots on instinct, 21M metashi landing in uneven patches, halving, one dig per tile per tick, food money returning to the ground, and both wake switches (they flip, but no one wakes yet). Tests check that the supply never changes and that a seed always replays the same history. |
| Nov 23 | The real birth lottery: World Bank data for 217 countries; bots born by real births; seven lands with gold by real GDP; family money, schooling, tools, electricity, bank accounts, taxes, welfare and food prices from real numbers; borders; night. Each bot keeps a record of its life. Counterfactual levers (same people, one thing changed) for impact reports. Tests check that the birth draw matches real births. |
| Nov 23 | The live screen and the impact report. A dot-matrix world (each bot is a small creature grown from its seed), an opening where $4.20 turns into 21M metashi and rains down as gold, a live camera that follows one bot, channels, an auto director and cut-ins, cards for bots (birth certificate, life so far) and lands (scene, real-world numbers, live numbers, who lives here), and a new pixel-game look. Schooling now raises what a swing digs, from the literature on returns to schooling. The first impact report: 50 paired worlds per lever, $0. |
| Nov 23 | metashi becomes money, not ore: halving gold rains like Bitcoin's block rewards, wages paid from local economies, spending that becomes someone else's wage, and prices that fall as productivity rises. The world is now a zoomable pixel map: the real Earth (Natural Earth borders, real deserts and mountains) or a new planet each time with the real countries on it. Minimap, red-box area selection, country and area cards. Food price calibrated to FAO hunger figures. The impact report reruns on 50 new planets. |
