const fs = require('fs');
const path = require('path');

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
    return false;
  }

  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before);

  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    console.log('Patched:', rel);
  } else {
    console.log('No change needed:', rel);
  }

  return true;
}

ensureDir(path.join(root, 'src', 'data'));
ensureDir(path.join(root, 'src', 'services'));

// 1) Manual overrides file.
const overridesFile = path.join(root, 'src', 'data', 'manualMetadataOverrides.js');
if (!fs.existsSync(overridesFile)) {
  fs.writeFileSync(overridesFile, `export const MANUAL_METADATA_OVERRIDES = {
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
    themes: ["Vampires", "Revenge", "Magic", "Monsters"],
    synopsis:
      "A dark fantasy series inspired by the Castlevania games following Trevor Belmont, Sypha Belnades, and Alucard as they battle Dracula and the forces of darkness.",
    description:
      "A dark fantasy series inspired by the Castlevania games following Trevor Belmont, Sypha Belnades, and Alucard as they battle Dracula and the forces of darkness.",
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
  },

  arcane: {
    title: "Arcane",
    officialTitle: "Arcane",
    origin: "western-anime-style",
    metadataSource: "manual",
    studio: "Fortiche",
    sourceMaterial: "League of Legends",
    type: "TV",
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
  console.log('Created src/data/manualMetadataOverrides.js');
}

// 2) Metadata provider service.
fs.writeFileSync(path.join(root, 'src', 'services', 'metadataProvider.js'), `import { getManualMetadata, normalizeManualMetadataKey } from '../data/manualMetadataOverrides';
import { fetchMetadata as fetchJikanMetadata } from './metadata';

export function applyMetadataToAnime(item = {}, metadata = {}) {
  return {
    ...item,
    ...metadata,
    id: item.id || metadata.id || metadata.malId || normalizeManualMetadataKey(metadata.title || item.title).replace(/\\s+/g, '-'),
    title: metadata.title || item.title,
    officialTitle: metadata.officialTitle || metadata.titleEnglish || metadata.title || item.officialTitle || item.title,
    description: metadata.description || metadata.synopsis || item.description || '',
    synopsis: metadata.synopsis || metadata.description || item.synopsis || '',
    metadataUpdatedAt: new Date().toISOString(),
    syncStatus: {
      ...(item.syncStatus || {}),
      metadata: true,
      manualOverride: metadata.metadataSource === 'manual',
      dirty: false,
      lastMetadataSync: new Date().toISOString()
    }
  };
}

export function getManualMetadataForAnime(itemOrTitle = {}) {
  const title = typeof itemOrTitle === 'string'
    ? itemOrTitle
    : itemOrTitle.title || itemOrTitle.officialTitle || itemOrTitle.titleEnglish;

  return getManualMetadata(title);
}

export async function fetchMetadataFromProvider(item = {}) {
  const manual = getManualMetadataForAnime(item);

  if (manual) {
    return applyMetadataToAnime(item, manual);
  }

  const fetched = await fetchJikanMetadata(item);

  return {
    ...fetched,
    metadataSource: fetched.metadataSource || 'jikan',
    syncStatus: {
      ...(fetched.syncStatus || item.syncStatus || {}),
      metadata: true,
      manualOverride: false,
      dirty: false,
      lastMetadataSync: new Date().toISOString()
    }
  };
}

export function hasManualMetadataOverride(itemOrTitle = {}) {
  return Boolean(getManualMetadataForAnime(itemOrTitle));
}
`, 'utf8');
console.log('Created src/services/metadataProvider.js');

// 3) Patch hook to use provider instead of direct Jikan fetch.
const hookRel = fs.existsSync(path.join(root, 'src', 'hooks', 'useAnimeLibrary.js'))
  ? 'src/hooks/useAnimeLibrary.js'
  : 'src/styles/useAnimeLibrary.js';

patchFile(hookRel, (text) => {
  let out = text;

  out = out.replace(
    "import { fetchMetadata, isRemoteCover, needsArtworkRepair, sleep } from '../services/metadata';",
    "import { isRemoteCover, needsArtworkRepair, sleep } from '../services/metadata';\nimport { fetchMetadataFromProvider, hasManualMetadataOverride } from '../services/metadataProvider';"
  );

  out = out.replaceAll("await fetchMetadata(nextAnime[index])", "await fetchMetadataFromProvider(nextAnime[index])");

  // Make smart updater refresh manual override entries too, so Castlevania gets repaired.
  if (out.includes("function shouldRefreshMetadata") && !out.includes("hasManualMetadataOverride(item) ||")) {
    out = out.replace(
      "return needsArtworkRepair(item) || !hasGoodMetadata(item) || metadataIsStale(item) || item.syncStatus?.dirty;",
      "return hasManualMetadataOverride(item) || needsArtworkRepair(item) || !hasGoodMetadata(item) || metadataIsStale(item) || item.syncStatus?.dirty;"
    );
  }

  return out;
});

// 4) Patch animeImporter if present.
const importerRel = fs.existsSync(path.join(root, 'src', 'services', 'animeImporter.js'))
  ? 'src/services/animeImporter.js'
  : 'src/styles/animeImporter.js';

patchFile(importerRel, (text) => {
  let out = text;

  if (!out.includes("metadataProvider")) {
    out = "import { fetchMetadataFromProvider, getManualMetadataForAnime, applyMetadataToAnime } from './metadataProvider';\n" + out;
  }

  // If import path is wrong because file still lives in src/styles.
  if (importerRel.startsWith('src/styles')) {
    out = out.replace("from './metadataProvider'", "from '../services/metadataProvider'");
  }

  if (!out.includes("const manualMetadata = getManualMetadataForAnime(title);")) {
    out = out.replace(
      /export async function importAnimeByTitle\(\{ title, status = ['"]Watching['"], library = \[\] \}\) \{/,
      (match) => match + `
  const manualMetadata = getManualMetadataForAnime(title);
  if (manualMetadata) {
    const candidate = applyMetadataToAnime({
      title,
      status,
      addedFrom: 'manual metadata override'
    }, manualMetadata);

    const duplicate = findDuplicateAnime(library, candidate);

    return {
      candidate,
      duplicate,
      manualOverride: true
    };
  }
`
    );
  }

  // Replace direct fetchMetadata candidate call if simple enough.
  out = out.replaceAll("await fetchMetadata(", "await fetchMetadataFromProvider(");

  return out;
});

// 5) Patch generator to use manual override without import/ESM headaches by using simple JSON-like extraction.
patchFile('scripts/generateGenomeCardForTitle.cjs', (text) => {
  let out = text;

  if (out.includes("function loadManualMetadataForGenerator")) return out;

  const helper = `
function loadManualMetadataForGenerator(query) {
  const overridePath = path.join(root, 'src', 'data', 'manualMetadataOverrides.js');

  if (!fs.existsSync(overridePath)) return null;

  const raw = fs.readFileSync(overridePath, 'utf8');
  const key = String(query || '')
    .toLowerCase()
    .replace(/[:'"’“.!?]/g, '')
    .replace(/\\s+/g, ' ')
    .trim();

  const startToken = key.includes(' ') || key.includes('-')
    ? '"' + key + '": {'
    : key + ': {';

  const lower = raw.toLowerCase();
  let start = lower.indexOf(startToken.toLowerCase());

  if (start === -1 && key === 'castlevania') {
    start = lower.indexOf('castlevania: {');
  }

  if (start === -1) return null;

  const blockStart = raw.indexOf('{', start);
  let depth = 0;
  let end = -1;

  for (let i = blockStart; i < raw.length; i++) {
    if (raw[i] === '{') depth++;
    if (raw[i] === '}') depth--;
    if (depth === 0) {
      end = i;
      break;
    }
  }

  if (end === -1) return null;

  const block = raw.slice(blockStart, end + 1);

  function stringField(name) {
    const match = block.match(new RegExp(name + "\\\\s*:\\\\s*[\\\"']([^\\\"']*)[\\\"']", 'i'));
    return match ? match[1] : '';
  }

  function arrayField(name) {
    const match = block.match(new RegExp(name + "\\\\s*:\\\\s*\\\\[([\\\\s\\\\S]*?)\\\\]", 'i'));
    if (!match) return [];

    return match[1]
      .split(',')
      .map((value) => value.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }

  const title = stringField('title') || query;

  return {
    malId: null,
    title,
    titleEnglish: stringField('officialTitle') || title,
    titleJapanese: '',
    titleSynonyms: [],
    synopsis: stringField('synopsis') || stringField('description'),
    background: '',
    year: null,
    season: '',
    type: stringField('type') || 'TV',
    episodes: null,
    status: stringField('status') || '',
    score: null,
    rating: '',
    source: stringField('sourceMaterial') || 'Manual',
    studios: [stringField('studio')].filter(Boolean),
    genres: arrayField('genres'),
    themes: arrayField('themes'),
    demographics: [],
    origin: stringField('origin') || 'manual',
    metadataSource: 'manual'
  };
}

`;

  out = out.replace("async function fetchJikanTitle(query) {", helper + "\nasync function fetchJikanTitle(query) {\n  const manual = loadManualMetadataForGenerator(query);\n  if (manual) {\n    console.log('Using manual metadata override for:', query);\n    return manual;\n  }\n");

  return out;
});

// 6) Check script.
fs.writeFileSync(path.join(root, 'scripts', 'checkMetadataProvider.cjs'), `const fs = require('fs');
const path = require('path');

const root = process.cwd();

function ok(label, condition) {
  console.log(label + ':', condition ? 'OK' : 'MISSING');
}

ok('manual overrides', fs.existsSync(path.join(root, 'src', 'data', 'manualMetadataOverrides.js')));
ok('metadata provider', fs.existsSync(path.join(root, 'src', 'services', 'metadataProvider.js')));

const hookPath = fs.existsSync(path.join(root, 'src', 'hooks', 'useAnimeLibrary.js'))
  ? path.join(root, 'src', 'hooks', 'useAnimeLibrary.js')
  : path.join(root, 'src', 'styles', 'useAnimeLibrary.js');

const hook = fs.readFileSync(hookPath, 'utf8');
ok('hook uses provider', hook.includes('fetchMetadataFromProvider'));
ok('manual override repair included', hook.includes('hasManualMetadataOverride'));

const generator = fs.readFileSync(path.join(root, 'scripts', 'generateGenomeCardForTitle.cjs'), 'utf8');
ok('generator manual fallback', generator.includes('loadManualMetadataForGenerator'));
`, 'utf8');

// 7) Docs.
fs.writeFileSync(path.join(root, 'src', 'ai', 'METADATA_PROVIDER.md'), `# Metadata Provider

Adds a clean metadata provider layer:

\`\`\`text
Metadata Provider
  ├─ Manual Overrides
  └─ Jikan
\`\`\`

## Why

Some anime-adjacent shows, like Castlevania, are not normal Jikan/MAL anime entries.

The provider checks manual overrides first, then falls back to Jikan.

## Test

\`\`\`cmd
node scripts\\checkMetadataProvider.cjs
npm run dev
\`\`\`

Then run the updater. Castlevania should repair from local manual metadata instead of Jikan.
`, 'utf8');

console.log('');
console.log('Metadata Provider installed.');
console.log('Run: node scripts\\\\checkMetadataProvider.cjs');
