const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function findRoot(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'src'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const root = findRoot(process.cwd());

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeManualOverrides() {
  const dir = path.join(root, 'src', 'data');
  ensureDir(dir);

  const file = path.join(dir, 'manualMetadataOverrides.js');

  const content = `export const MANUAL_METADATA_OVERRIDES = {
  castlevania: {
    title: "Castlevania",
    officialTitle: "Castlevania",
    origin: "western-anime-style",
    metadataSource: "manual",
    studio: "Powerhouse Animation Studios",
    sourceMaterial: "Konami video game",
    type: "TV",
    status: "Completed",
    genres: ["Action", "Dark Fantasy", "Horror"],
    themes: ["Vampires", "Revenge", "Magic", "Monsters", "Gothic Horror"],
    synopsis:
      "A dark fantasy animated series inspired by Konami’s Castlevania games, following Trevor Belmont, Sypha Belnades, and Alucard as they battle Dracula, vampires, demons, corrupt religion, and supernatural war.",
    description:
      "A dark fantasy animated series inspired by Konami’s Castlevania games, following Trevor Belmont, Sypha Belnades, and Alucard as they battle Dracula, vampires, demons, corrupt religion, and supernatural war.",
    allowInRecommendations: true
  },

  "castlevania nocturne": {
    title: "Castlevania: Nocturne",
    officialTitle: "Castlevania: Nocturne",
    origin: "western-anime-style",
    metadataSource: "manual",
    studio: "Powerhouse Animation Studios",
    sourceMaterial: "Konami video game",
    type: "TV",
    genres: ["Action", "Dark Fantasy", "Horror"],
    themes: ["Vampires", "Revolution", "Magic", "Legacy"],
    synopsis:
      "Richter Belmont faces a rising vampire empire during the French Revolution.",
    description:
      "Richter Belmont faces a rising vampire empire during the French Revolution.",
    allowInRecommendations: true
  }
};

export function normalizeManualMetadataKey(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[:'"’“.!?]/g, "")
    .replace(/\\s+/g, " ")
    .trim();
}

export function getManualMetadata(title = "") {
  const key = normalizeManualMetadataKey(title);
  return MANUAL_METADATA_OVERRIDES[key] || null;
}
`;

  fs.writeFileSync(file, content, 'utf8');
  console.log('Wrote src/data/manualMetadataOverrides.js');
}

function loadGeneratedCards(file) {
  if (!fs.existsSync(file)) return [];

  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/export const GENERATED_GENOME_CARDS = ([\s\S]*?);\s*$/m);

  if (!match) return [];

  try {
    return JSON.parse(match[1]);
  } catch {
    return [];
  }
}

function saveGeneratedCards(file, cards) {
  ensureDir(path.dirname(file));

  const body = `// Auto-generated provisional Genome Cards.
// This file is maintained by JoeAnimeDB tools.
// Cards here should be reviewed before being promoted to curated modules.

export const GENERATED_GENOME_CARDS = ${JSON.stringify(cards, null, 2)};
`;

  fs.writeFileSync(file, body, 'utf8');
}

function writeCastlevaniaGenome() {
  const file = path.join(root, 'src', 'ai', 'genome', 'generated', 'generatedGenomeCards.js');
  const existing = loadGeneratedCards(file);

  const card = {
    id: "castlevania",
    titles: ["Castlevania"],
    quality: "generated",
    generationQuality: "manual-override",
    confidence: 0.9,
    generated: true,
    needsReview: false,
    origin: "western-anime-style",
    source: {
      metadata: "manual",
      generator: "manual-override",
      model: null
    },
    domain: "western anime-style dark fantasy",
    subdomain: "vampire revenge, gothic horror, monster hunting, and supernatural war",
    signature:
      "Castlevania is anime-adjacent dark fantasy: brutal vampire action, gothic horror, monster hunting, and stylish Powerhouse animation built from Konami’s game world.",
    coreFantasy:
      "Stand against Dracula’s nightmare with hunters, magic, bloodlines, and cursed family drama in a world where humanity and monsters are both terrifying.",
    fantasyPillars: [
      "vampire war",
      "gothic horror",
      "monster hunting",
      "dark fantasy action",
      "tragic villains"
    ],
    emotionalJourney: [
      "rage",
      "grief",
      "vengeance",
      "defiance",
      "grim catharsis"
    ],
    rewardLoop: [
      "monster threat",
      "bloody fight",
      "dark lore reveal",
      "character trauma",
      "stylish payoff"
    ],
    dopamineSources: [
      "vampire violence",
      "magic battles",
      "gothic atmosphere",
      "monster designs",
      "Alucard/Trevor/Sypha chemistry"
    ],
    viewerType: [
      "dark fantasy fan",
      "vampire fan",
      "action horror fan",
      "anime-adjacent animation fan"
    ],
    viewerMotivations: [
      "dark fantasy",
      "vampires",
      "stylish action",
      "gothic horror",
      "monster hunting",
      "bloody supernatural drama"
    ],
    themes: [
      "revenge",
      "family trauma",
      "religious corruption",
      "human cruelty",
      "monsters",
      "legacy",
      "survival"
    ],
    emotionalProfile: [
      "violent",
      "grim",
      "gothic",
      "angry",
      "tragic"
    ],
    atmosphere: [
      "bloody",
      "dark",
      "gothic",
      "hellish",
      "stylized"
    ],
    vibes: {
      action: 9,
      dark: 9,
      fantasy: 8,
      horror: 8,
      emotional: 6
    },
    pacing: "high pressure",
    complexity: 6,
    accessibility:
      "Easy to get into if you like dark fantasy action. Anime-adjacent rather than Japanese anime.",
    idealFollowUps: [
      "Claymore",
      "Hellsing Ultimate",
      "Vampire Hunter D",
      "Berserk",
      "Dorohedoro"
    ],
    antiRecommendations: [
      "Skip if you want traditional school anime or cozy fantasy."
    ],
    recommendationWeight: 0.74,
    rewatchValue:
      "Strong for action scenes, atmosphere, and favorite character moments.",
    whyFansLove: [
      "the fights are brutal and stylish",
      "the gothic vampire atmosphere works",
      "Trevor, Sypha, and Alucard have great chemistry",
      "the villains feel tragic instead of flat"
    ],
    whoShouldWatch:
      "Viewers who like dark fantasy, vampires, stylish violence, gothic horror, and anime-adjacent animation.",
    whoShouldAvoid:
      "Skip it if you only want Japan-produced anime, low violence, or light fantasy.",
    joeNote:
      "Manual override: not technically Japanese anime, but it belongs in JoeAnimeDB as anime-adjacent dark fantasy for recommendation purposes."
  };

  const next = [card, ...existing.filter((item) => item.id !== 'castlevania' && !(item.titles || []).includes('Castlevania'))];
  saveGeneratedCards(file, next);
  console.log('Added Castlevania Genome card.');
}

function rebuildRegistry() {
  const script = path.join(root, 'scripts', 'rebuildGenomeRegistry.cjs');

  if (!fs.existsSync(script)) {
    console.warn('Missing scripts/rebuildGenomeRegistry.cjs — skipped registry rebuild.');
    return;
  }

  execFileSync(process.execPath, [script], {
    cwd: root,
    stdio: 'inherit'
  });
}

writeManualOverrides();
writeCastlevaniaGenome();
rebuildRegistry();

console.log('');
console.log('Castlevania manual metadata + Genome installed.');
console.log('Restart dev, then test: recommend Castlevania');
