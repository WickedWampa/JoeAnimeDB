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

function patchFile(rel, fn) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    console.warn('Missing:', rel);
    return;
  }
  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before);
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    console.log('Patched:', rel);
  } else {
    console.log('No change needed:', rel);
  }
}

ensureDir(path.join(root, 'src', 'services'));
ensureDir(path.join(root, 'src', 'data'));
ensureDir(path.join(root, 'src', 'ai', 'genome', 'generated'));

// 1) Ensure manual override file has needed exports and entries.
fs.writeFileSync(path.join(root, 'src', 'data', 'manualMetadataOverrides.js'), `export const MANUAL_METADATA_OVERRIDES = {
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
    synopsis: "Richter Belmont faces a rising vampire empire during the French Revolution.",
    description: "Richter Belmont faces a rising vampire empire during the French Revolution.",
    allowInRecommendations: true
  },

  arcane: {
    title: "Arcane",
    officialTitle: "Arcane",
    origin: "western-anime-style",
    metadataSource: "manual",
    studio: "Fortiche",
    sourceMaterial: "League of Legends",
    type: "TV",
    status: "Completed",
    genres: ["Action", "Drama", "Fantasy", "Sci-Fi"],
    themes: ["Class Conflict", "Sisters", "Technology", "Trauma", "Politics"],
    synopsis:
      "A stylized animated drama about two sisters divided by trauma, class conflict, technology, crime, and political unrest.",
    description:
      "A stylized animated drama about two sisters divided by trauma, class conflict, technology, crime, and political unrest.",
    allowInRecommendations: true
  },

  "blue eye samurai": {
    title: "Blue Eye Samurai",
    officialTitle: "Blue Eye Samurai",
    origin: "western-anime-style",
    metadataSource: "manual",
    studio: "Blue Spirit",
    sourceMaterial: "Original",
    type: "TV",
    status: "Completed",
    genres: ["Action", "Drama"],
    themes: ["Revenge", "Identity", "Samurai", "Outsider", "Violence"],
    synopsis:
      "A revenge-driven animated samurai drama about identity, violence, obsession, and survival in Edo-period Japan.",
    description:
      "A revenge-driven animated samurai drama about identity, violence, obsession, and survival in Edo-period Japan.",
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
`, 'utf8');

console.log('Wrote manualMetadataOverrides.js');

// 2) Resolver.
fs.writeFileSync(path.join(root, 'src', 'services', 'metadataResolver.js'), `import { getManualMetadata, normalizeManualMetadataKey } from '../data/manualMetadataOverrides';

const KNOWN_BAD_JIKAN_MATCHES = {
  arcane: ['La storia della Arcana Famiglia', 'Arcana Famiglia'],
  'blue eye samurai': ['The Third', 'The Third: Aoi Hitomi no Shoujo'],
  castlevania: []
};

function norm(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[:'"’“.!?]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titleBag(candidate = {}) {
  return [
    candidate.title,
    candidate.title_english,
    candidate.title_japanese,
    ...(candidate.title_synonyms || [])
  ].filter(Boolean);
}

function knownBadMatch(query, candidate) {
  const q = norm(query);
  const bad = KNOWN_BAD_JIKAN_MATCHES[q] || [];
  const titles = titleBag(candidate).map(norm);
  return bad.some((badTitle) => titles.includes(norm(badTitle)));
}

export function shouldPreferManualMetadata(title = '') {
  return Boolean(getManualMetadata(title));
}

export function manualMetadataToAnime(item = {}, manual = {}) {
  return {
    ...item,
    ...manual,
    id: item.id || manual.id || normalizeManualMetadataKey(manual.title || item.title).replace(/\\s+/g, '-'),
    title: manual.title || item.title,
    officialTitle: manual.officialTitle || manual.title || item.officialTitle,
    description: manual.description || manual.synopsis || item.description || '',
    synopsis: manual.synopsis || manual.description || item.synopsis || '',
    metadataUpdatedAt: new Date().toISOString(),
    syncStatus: {
      ...(item.syncStatus || {}),
      metadata: true,
      manualOverride: true,
      dirty: false,
      lastMetadataSync: new Date().toISOString()
    }
  };
}

export function scoreJikanCandidate(query, candidate = {}) {
  let points = 0;
  const q = norm(query);
  const titles = titleBag(candidate).map(norm);

  if (titles.some((title) => title === q)) points += 80;
  else if (titles.some((title) => title.includes(q) || q.includes(title))) points += 25;

  if (candidate.title_english && norm(candidate.title_english) === q) points += 35;
  if (candidate.score) points += Math.min(10, Number(candidate.score));
  if (knownBadMatch(query, candidate)) points -= 100;
  if (getManualMetadata(query)) points -= 50;

  return points;
}
`, 'utf8');

console.log('Created metadataResolver.js');

// 3) Patch metadata service to check manual first.
patchFile('src/services/metadata.js', (text) => {
  let out = text;

  if (!out.includes("metadataResolver")) {
    out = "import { shouldPreferManualMetadata, manualMetadataToAnime } from './metadataResolver';\nimport { getManualMetadata } from '../data/manualMetadataOverrides';\n" + out;
  }

  if (!out.includes("manual override before Jikan")) {
    out = out.replace(
      /export async function fetchMetadata\(item\) \{/,
      (match) => match + `
  if (shouldPreferManualMetadata(item.title || item.officialTitle || item.titleEnglish)) {
    const manual = getManualMetadata(item.title || item.officialTitle || item.titleEnglish);
    console.log('[Metadata] manual override before Jikan:', item.title || item.officialTitle);
    return manualMetadataToAnime(item, manual);
  }
`
    );
  }

  return out;
});

// 4) Patch metadataProvider if present.
patchFile('src/services/metadataProvider.js', (text) => {
  let out = text;

  if (!out.includes("metadataResolver")) {
    out = out.replace(
      "import { getManualMetadata, normalizeManualMetadataKey } from '../data/manualMetadataOverrides';",
      "import { getManualMetadata, normalizeManualMetadataKey } from '../data/manualMetadataOverrides';\nimport { manualMetadataToAnime } from './metadataResolver';"
    );
  }

  out = out.replace(
    "return applyMetadataToAnime(item, manual);",
    "return manualMetadataToAnime(item, manual);"
  );

  return out;
});

// 5) Add generated Genome cards.
const generatedPath = path.join(root, 'src', 'ai', 'genome', 'generated', 'generatedGenomeCards.js');

function loadCards(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/export const GENERATED_GENOME_CARDS = ([\s\S]*?);\s*$/m);
  if (!match) return [];
  try { return JSON.parse(match[1]); } catch { return []; }
}

function saveCards(file, cards) {
  fs.writeFileSync(file, `// Auto-generated provisional Genome Cards.
// This file is maintained by JoeAnimeDB tools.
// Cards here should be reviewed before being promoted to curated modules.

export const GENERATED_GENOME_CARDS = ${JSON.stringify(cards, null, 2)};
`, 'utf8');
}

const existingCards = loadCards(generatedPath);
const manualCards = [
  {
    id: "arcane",
    titles: ["Arcane"],
    quality: "generated",
    generationQuality: "manual-override",
    confidence: 0.92,
    generated: true,
    needsReview: false,
    origin: "western-anime-style",
    domain: "anime-adjacent tragedy / political fantasy",
    subdomain: "class conflict, sisters, technology, trauma, and revolution",
    signature: "Arcane is anime-adjacent prestige animation: a tragic sister story wrapped in class conflict, crime, magic-tech, and political collapse.",
    coreFantasy: "Watch two sisters become symbols of opposite worlds while a city tears itself apart through trauma, invention, power, and revenge.",
    fantasyPillars: ["sister tragedy", "class conflict", "magic technology", "political unrest", "stylized action"],
    rewardLoop: ["character bond", "political pressure", "personal trauma", "visual spectacle", "tragic consequence"],
    viewerType: ["emotional drama fan", "stylish animation fan", "political fantasy fan", "tragic character arc fan"],
    viewerMotivations: ["emotional damage", "sister drama", "class conflict", "stylish action", "political fantasy"],
    themes: ["trauma", "sisters", "class conflict", "technology", "identity", "power"],
    atmosphere: ["industrial", "neon", "violent", "melancholic"],
    vibes: { action: 8, emotional: 10, dark: 8, sciFi: 7, drama: 10 },
    joeNote: "Manual override: anime-adjacent, not Japanese anime, but relevant to JoeAI recommendations."
  },
  {
    id: "blue-eye-samurai",
    titles: ["Blue Eye Samurai"],
    quality: "generated",
    generationQuality: "manual-override",
    confidence: 0.9,
    generated: true,
    needsReview: false,
    origin: "western-anime-style",
    domain: "anime-adjacent revenge samurai drama",
    subdomain: "identity, violence, outsider rage, and Edo-period revenge",
    signature: "Blue Eye Samurai is a brutal revenge samurai story about identity, obsession, violence, and being treated as a monster by the world.",
    coreFantasy: "Cut through an unforgiving world with skill, rage, and secrecy while chasing revenge against the people who made you an outsider.",
    fantasyPillars: ["revenge quest", "samurai violence", "outsider identity", "hidden self", "bloody mastery"],
    rewardLoop: ["enemy lead", "disguise tension", "duel", "reveal", "revenge step forward"],
    viewerType: ["samurai fan", "revenge arc fan", "mature animation fan", "identity drama fan"],
    viewerMotivations: ["revenge", "samurai action", "identity drama", "stylish violence", "mature storytelling"],
    themes: ["identity", "revenge", "racism", "violence", "outsider", "survival"],
    atmosphere: ["sharp", "bloody", "period-drama", "melancholic"],
    vibes: { action: 8, dark: 8, drama: 9, historical: 8, emotional: 7 },
    joeNote: "Manual override: anime-adjacent Western animation. Keep distinct from Jikan title collisions."
  }
];

saveCards(generatedPath, [
  ...manualCards,
  ...existingCards.filter((card) => !['arcane', 'blue-eye-samurai'].includes(card.id))
]);

console.log('Added Arcane + Blue Eye Samurai Genome cards.');

// 6) Rebuild registry.
const rebuild = path.join(root, 'scripts', 'rebuildGenomeRegistry.cjs');
if (fs.existsSync(rebuild)) {
  execFileSync(process.execPath, [rebuild], { cwd: root, stdio: 'inherit' });
}

// 7) Check.
fs.writeFileSync(path.join(root, 'scripts', 'checkMetadataResolver.cjs'), `const fs = require('fs');
const path = require('path');
const root = process.cwd();
function ok(label, condition) { console.log(label + ':', condition ? 'OK' : 'MISSING'); }
ok('metadataResolver', fs.existsSync(path.join(root, 'src', 'services', 'metadataResolver.js')));
const metadata = fs.readFileSync(path.join(root, 'src', 'services', 'metadata.js'), 'utf8');
ok('metadata checks manual first', metadata.includes('manual override before Jikan'));
const generated = fs.readFileSync(path.join(root, 'src', 'ai', 'genome', 'generated', 'generatedGenomeCards.js'), 'utf8');
ok('Arcane genome', generated.includes('"id": "arcane"'));
ok('Blue Eye Samurai genome', generated.includes('"id": "blue-eye-samurai"'));
`);

console.log('');
console.log('Metadata resolver installed.');
console.log('Run: node scripts\\\\checkMetadataResolver.cjs');
