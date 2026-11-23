// Prompts for every illustration, written once so tomorrow is only "generate".
// Each prompt is the shared style plus one subject. See docs/art-direction.md.

export const STYLE =
  "Hand-inked engraving lines with soft watercolour washes on warm parchment paper, a few touches of gold leaf, " +
  "like a plate from an antique atlas or an old hand-painted tarot card. Light warm palette of ochre, sand, sage, " +
  "dusty blue, brick red and ink brown. Soft light from the upper left. One clear subject, centred slightly above " +
  "the middle, generous margins, readable at small size. No text, no letters, no numbers, no logos, no watermark, " +
  "no real flags, no real places, no brands. No faces: any people appear only as hands, backs, silhouettes or tiny " +
  "distant figures.";

export type ArtJob = { id: string; set: "card" | "role" | "back" | "intro"; subject: string; size: string };

const card = (id: string, subject: string): ArtJob => ({ id: `card-${id}`, set: "card", subject, size: "1024x1024" });
const role = (id: string, subject: string): ArtJob => ({ id: `role-${id}`, set: "role", subject, size: "1024x1024" });
const intro = (id: string, subject: string): ArtJob => ({ id: `intro-${id}`, set: "intro", subject, size: "1792x1024" });

export const JOBS: ArtJob[] = [
  // God
  card("harvest", "Golden wheat fields under a warm sun, bound sheaves and full baskets at the edge of the field."),
  card("drought", "Cracked dry earth stretching to the horizon, one withered tree, a pale hot sky with a white sun."),
  card("skyGift", "Clouds parting and small golden coins falling like gentle rain onto rolling green hills."),
  card("flood", "A river overflowing its banks around a few small houses, rooftops just above the water, a heavy grey-blue sky."),
  card("plenty", "An orchard heavy with ripe fruit, overflowing baskets and wildflowers, everything blooming at once."),
  // King
  card("schools", "A small open-air classroom under a tree: a slate board, wooden benches and open books, small figures seen from behind."),
  card("power", "A village at dusk, windows glowing warm yellow, a line of wooden power poles reaching it across the fields."),
  card("accounts", "An open ledger book on a wooden counter, a quill, a small brass key and a few coins."),
  card("taxCut", "An open city gate with a money pouch spilling coins back into open hands."),
  card("taxRaise", "A treasury chest being filled with coins beside a brass balance scale tipping to one side."),
  card("trade", "Two small sailing ships passing between two harbours, crates and grain sacks on the docks."),
  card("aid", "A wagon loaded with grain sacks crossing a stone bridge toward a small village."),
  card("sanction", "A closed iron gate wrapped in chains in front of an empty market square with bare stalls."),
  // Human
  card("toCity", "A dirt road winding toward a distant city skyline, a cloth bundle tied to a walking stick by the roadside."),
  card("nightSchool", "Candlelight on an open book and a notebook on a wooden table at night, a window with stars."),
  card("getOnline", "A worn secondhand phone resting on a wooden crate, faint signal waves rising toward a rooftop antenna."),
  card("openAccount", "A small savings booklet with a round stamp, a key and a few coins on a clean counter."),
  card("workHarder", "Simple work tools at dawn: a hammer, a basket and a hoe, the sun just rising behind a field."),
  card("helpNeighbor", "A loaf of bread wrapped in cloth left on a wooden doorstep, a hand gently placing it."),
  // Roles
  role("watch", "A curious round lens on a small silver craft high above the clouds, looking down at a parchment-coloured planet."),
  role("god", "Rays of golden light breaking through clouds over fields, rivers and tiny villages far below."),
  role("king", "A simple gold crown resting on an old map beside a wax seal and a small pile of coins."),
  role("human", "A small traveller with a cloth bundle seen from behind, standing at a crossroads signpost under a wide sky."),
  // Card back
  { id: "back", set: "back", subject: "A symmetrical ornamental pattern of interlaced vines and stars around a single golden coin, deep red and gold on parchment.", size: "1024x1024" },
  // Opening
  intro("1-pocket", "Close view of a worn coat pocket; a few plain paper notes and two small coins slip out and begin to fall. Only the coat and a hand, no face."),
  intro("2-clouds", "Paper notes and coins tumbling down through soft clouds, turning into glowing gold as they fall."),
  intro("3-rain", "A gentle rain of golden light falling toward a quiet parchment-coloured planet seen from above, wisps of cloud."),
  intro("4-cities", "Gold settling onto a hand-drawn map of a new world, pooling into softly glowing cities along rivers and coasts."),
  intro("5-looking-up", "Tiny figures on a grassy hill seen from behind, looking up at golden light spreading across the sky."),
];

export const promptFor = (job: ArtJob) => `${STYLE}\n\nSubject: ${job.subject}`;
