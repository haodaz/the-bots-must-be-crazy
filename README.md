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

**The map.** Every world is a new planet: Earth's share of land, a few large continents, Earth-like terrain, painted like an old map on a game board (parchment, inked coasts with ripples, little mountains and trees, a compass rose). Its 217 nations have made-up names, but each one carries the numbers of a real country and land in proportion to that country's real area. The planet is only the skin; the lottery underneath stays real, and each bot's real-world twin is revealed only at the end of its life. (The real Earth, built from Natural Earth borders, is kept for checking the model.) You can zoom from a pixel world map down to each bot's dot-matrix body, draw a red box to see everyone in an area, and open a card for any bot or country.

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

## Playing: watch, or enter as God, King or Human

At the start you choose how to enter the world. **Watch** follows the live channels and touches nothing. The other three play cards: a hand of four, one draw a day from a deck of twelve, one card played a day, and the world waits at each dawn for your turn. Each kind of card is a fixed rule; each copy draws its own strength, reach and length. Every card keeps the law of supply: it can move metashi, never make or destroy it.

- **God**: Bountiful Harvest, Drought, Gift from the Sky (an early rain from the gold still in the sky), Flood, Season of Plenty.
- **King** (choose a nation to rule): Schools for All, Light the Nation, Accounts for All (each paid from the treasury, which becomes wages at home), Tax Relief, Tax the Harvest, Trade Route, Aid, Sanctions. There is no war.
- **Human**: one draw of a birth certificate, no redraw; then Go to the City, Night School, Get Online, Open an Account, Work Harder, Help a Neighbour.

## Languages and people

The page speaks English and Simplified Chinese (the button in the top bar, or `?lang=zh`). Every string on screen goes through one translator; engine events and card results are stored as templates with params, so they render in either language. A test fails if any string lacks a translation or a placeholder.

Each bot is a 20×32 pixel figure built from random parts: skin (a human range plus a few otherworldly tones), eyes and their colour, brows, mouth, marks, facial hair, hair style and colour, bangs, tops with prints, sleeves, bottoms, belts, socks, shoes, headwear, glasses, jewellery and a few strange features (antennae, horns, cat ears, a halo, a sprout). Families of means wear a little gold. On the board they stand as pieces; up close they are standees.

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
| Nov 23 | The board-game look: every world is a new planet with made-up nation and land names (the real twin stays sealed until the end), painted once like an old map: parchment, smooth inked coastlines with ripples, mountains, trees, dunes, dotted borders, a compass rose and a name plaque. The board fills the window, with a gilded top bar, a side panel that opens when you pick something, a card tray, and the minimap. Planet shuffles are now the same on every JavaScript engine. |
| Nov 23 | Cards. Choose to watch, or to enter as God, King or Human, from four big cards. Card players get a hand of four from a shuffled deck of twelve (a fixed mix per role, each copy with its own strength, reach and length), draw one and play one a day, and the world waits at each dawn. God cards change prices, stop work or bring the sky's gold early; King cards enact policies paid from the treasury, set taxes, open trade routes, send aid or sanction; Human cards are the crossroads of one life, which begins with a one-time birth-certificate draw. Gilded cards with arched art windows and engraved emblems. Tests check that no card makes or destroys a metashi. |
| Nov 23 | People and languages. Bots are now 20×32 pixel figures built from random parts and stand on the board as standees. The page speaks English and Simplified Chinese: every string goes through one translator, events and card results are templates with params, and a test checks that every string has a translation with the same placeholders. |
| Nov 23 | Ready for compute, before any arrives. Every model call goes through one budget gate: it estimates the worst case before the call, refuses anything that would pass our own $8 cap (the event's hard line is $10), and writes a receipt for every call to a ledger that becomes the usage trace for the submission. The Muse Ember and Muse Image client runs as a free rehearsal until live calls are switched on, and never live on a public deployment. One art direction (engraving and watercolour on parchment, no text, no faces) with prompts for 19 cards, 4 roles, the card back and 5 opening frames, about $0.58 for two variants each. A life now lasts 30 days. When the round ends, every life is filed in the archive: folders by fate and land, and a life file for each bot with its birth certificate, its life told from its record, its turning points, and its real-world twin, unsealed only now. The board became one sea: the paper runs on past the map's edges, the edges of the window are aged instead of the map's, and no coast touches the edge. Dragging moves the map; Select area draws the red box. The opening counts up to all 21M metashi before half of it falls. The chart's margins got their own art: other worlds, a moon and comets in the sky above, ships, a serpent and a whale in the sea below. |
| Nov 23 | A round is one life of a hundred years: one day on the board is one year. Gold rains every ten years, seven times: six halvings in whole metashi (10.5M, 5.25M, 2.625M, 1.3125M, 656,250, 328,125) and a last rain in year 60 that empties the sky, like the last bitcoin. Card players take a turn every five years. Over a hundred years taxes piled up unused in treasuries, so countries now spend half their treasury back into their economy each year as public works and public jobs, keeping the rest for welfare and policies; hunger stays near the FAO figures for the whole life. |
| Nov 23 | Closer to the people. Pinch and wheel zoom only the map (never the page), the camera goes twice as close, and a double-click eases in toward the spot. Bots now act out what the engine says they are doing: they walk from tile to tile with a stride and a bob and face the way they go, pace and swing a hammer at work with a glint of gold, hold a bowl when they eat, lie down with z z z when they sleep in the dark, and slump with a bead of sweat when they faint. It is all drawing: the engine and its numbers are unchanged, and a mind's yearly choices will play out through the same moves. |
| Nov 23 | Sharp up close. Past twice the painted scale, the map switches to its plain washes and draws its ink live: the coastline and its ripples are traced from the land's smooth shape (marching squares, kept in chunks so only what is on screen is stroked), and the terrain glyphs and borders are redrawn at the camera's scale, so lines stay crisp however close you go. |
| Nov 24 | Credits arrived, and the first real calls. A one-word Muse Ember ping costs $0.00003; even at `minimal` effort it spends about 46 reasoning tokens before answering, so every call now leaves room for that. All the illustrations were painted with Muse Image in one art direction: 19 cards, 4 roles, the card back and 5 story plates, two variants each (58 images, $0.58, every one in the receipt ledger). The kept variant of each is shrunk for the web; the large originals stay local. A story now comes before the gold falls, five illustrated pages for someone who has never seen the game: about 134 million babies are born each year and none chooses where; where you land decides a lot; so here is a small planet of 100 bots born from real data; they have no minds, and a real mind costs real money; and this world began with $4.20. It can be skipped and opened again from the top bar. The first time you take a role, a three-step card says where you are and what to do; click your role's badge to see it again. |
| Nov 24 | A calmer board. The top bar keeps only the clock, which now carries the planet's name and its numbers, and the time controls beside it; everything else (story, how to play, archive, impact report, new planet, language) moved into a menu that opens in the middle of the screen, from the Menu button or Esc, and holds the world still while it is open. The turn button only says what it does; how many plays are left is a tag above it. The chart's margins are drawn over the painted sea, so the serpent's neck is no longer cut off at the map's edge. The opening no longer runs on a timer: each line plays to its end and waits for a click (or Space, Enter, →) before the next, so a first-time viewer can read every line; Skip still jumps to the end. The deck pile is bigger and says how many cards are left. |
| Nov 24 | Minds wake. When a bot's need or plenty switch flips, it wakes, and from then on Muse Ember thinks for it once every five years. It is told the truth about its world (a simulation from real data, thinking costs real money, people are watching, its choices count) and only how it woke, never who to be; it reads its own situation and its last few thoughts, and returns a thought in its own words and one of a person's choices (go to the city, night school, get online, open an account, work harder, help a neighbour, or rest), which the engine plays with the same rules as the Human cards, so the 21M still holds. The prompt's rules come first so they are cached; the page sends only checked numbers and names, and the server builds the prompt. Each round holds one grain of real compute (4 cents); thoughts stop when it is spent and the minds live on by their last choice. Every thought leaves a receipt and a trace line with its exact prompt and reply. First real round: 12 minds, 172 thoughts, $0.026, about $0.00015 a thought, half of each prompt served from cache. It showed that a free 30% raise was the only sensible choice, so working harder now also makes you hungry half again as fast. On the board a woken bot carries a lit mark (blue from need, gold from plenty) and a thought cloud while it thinks; the Minds panel shows the round's jar of compute emptying and the latest thoughts; following a mind shows its words as a subtitle; its card keeps everything it has thought. |
| Nov 24 | Ready for everyone. On the public site many people play at once on servers that keep no files, so the money is kept in Redis (Upstash): one shared pool for all public rounds ($4), each round's grain (4 cents), and at most six new rounds an hour per visitor (an anonymous salted hash, never the address itself). Before each thought its worst-case cost is reserved in one atomic step that checks all three together, so two visitors can never both slip past a cap; when the reply is back the reservation is settled to the real cost, or refunded if the call failed. Without Redis the public site only rehearses. A public Receipts page lists every paid thought with its tokens and cost, the pool's total, and what development spent before the pool opened (the illustrations and test rounds, $0.63 in 389 calls), so the whole $10 is accounted for. |
| Nov 24 | On itch.io. itch hosts only static files, and the minds need the server (to call Muse Ember, keep the shared pool and write receipts), so the itch build is one small page that frames the live game: `itch/index.html`. Cover and screenshots come from two real public rounds, played in a headless browser; their thoughts are on the receipts page like everyone else's. |
| Nov 24 | A jar kept for the judges, and a round to watch when the public jar is closed. The judges' rounds are paid from their own pool ($1, at least 20 rounds), reached only through the judges' link; a leaked link can spend at most that pool. The public pool can be closed by one switch once testing is done. Then visitors watch a recorded round instead: two real rounds were recorded on one planet, in English (163 thoughts, $0.027) and in Chinese (146 thoughts, $0.022). The world is deterministic, so when it is rebuilt from the same seed and each tick runs in the same order as when it was recorded, every mind wakes at the same moment, in the same situation, and says what it really said; a test plays a recorded round back and gets the same world to the last coin, and in the browser all 163 thoughts land on their exact ticks. The receipts page shows the judges' pool beside the public one. Development has now spent $0.68 in 698 calls. |
| Nov 24 | Music, written by Muse Ember. No model on the Meta Model API makes sound, so Ember writes the music the way a composer writes a score: nine themes (the story, the gold falling, calm, hard times, gold rain, waking from need, waking from plenty, fainting, the end), each with a key, a tempo and a few voices written as scale degrees and lengths, and the browser plays the score on a small synthesizer made from oscillators, filters and a made-up room. Three scores in three styles (music box, chiptune, folk) cost $0.0104 together; a page, /music, plays every theme of each and shows the score as text, and the visitor picks which one the game plays. In the game the loop follows the moment: the story, the opening, then calm or hard times by how many bots have fainted (with a slow switch, so it never flickers); a mind waking, a gold rain or a fainting adds a short sting on top, and a played card flips. Music is off until the visitor turns it on. |
0 is accounted for in the open. |
