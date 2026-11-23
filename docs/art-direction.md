# Art direction

One look for every illustration in the game, so cards, roles and the opening read as one world.
All art is generated with **Muse Image** (Meta Model API) during the hackathon, $0.01 an image, through the same budget gate as every other call.

## The look

- **Medium:** hand-inked engraving lines with soft watercolour washes on warm parchment, a few touches of gold leaf. Think of the plates in an antique atlas, or an old hand-painted tarot deck.
- **Palette:** light and warm, matching the board: ochre, sand, sage, dusty blue, brick red, ink brown, gold. No dark or black backgrounds, no neon, no glossy 3D.
- **Light:** soft, from the upper left.
- **Composition:** one clear subject, centred a little above the middle (card windows are arched), generous margins, readable when the card is only 130 px wide.

## Rules

- **No text** of any kind: no letters, numbers, signs, logos or watermarks.
- **No real places, flags, brands or banknotes.** Money is drawn as generic coins and plain paper notes with no legible marks.
- **No faces.** People appear as hands, backs, silhouettes or small figures far away. When hands are shown, skin tones vary.
- **No poverty clichés.** Hardship is shown through the land and the weather (cracked earth, floodwater), never through suffering bodies.
- The world's people are little creatures of their own, not any real nation or ethnicity.

## What gets drawn

| Set | Count | Shape |
|---|---|---|
| Card art, one per kind of card | 19 | square (1024×1024) |
| Role cards: Observer, God, King, Human | 4 | square |
| Card back | 1 | square |
| Opening keyframes | 5 | wide (1792×1024) |

Two variants each, the better one kept: about 58 images, about $0.58. Prompts live in `src/art/prompts.ts`; `node scripts/gen-art.ts` generates them (a free rehearsal unless live calls are switched on).
