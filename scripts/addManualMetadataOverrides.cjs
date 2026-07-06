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

ensureDir(path.join(root, 'src', 'data'));

const overrides = `export const MANUAL_METADATA_OVERRIDES = {
  castlevania: {
    title: 'Castlevania',
    officialTitle: 'Castlevania',
    origin: 'western-anime-style',
    studio: 'Powerhouse Animation Studios',
    sourceMaterial: 'Konami video game',
    metadataSource: 'manual',
    status: 'Completed',
    type: 'TV',
    genres: ['Action', 'Dark Fantasy', 'Horror'],
    themes: ['vampires', 'revenge', 'monsters', 'religion', 'family trauma'],
    synopsis:
      'A dark fantasy animated series inspired by Konami’s Castlevania games, following monster hunters, vampires, magic, revenge, and the collapse of human and supernatural power.',
    description:
      'A dark fantasy animated series inspired by Konami’s Castlevania games, following monster hunters, vampires, magic, revenge, and the collapse of human and supernatural power.',
    allowInRecommendations: true,
    joeNote:
      'Western anime-style animation, not Japanese anime, but highly relevant to anime fans who like dark fantasy, vampires, gore, and stylish action.'
  },

  'castlevania nocturne': {
    title: 'Castlevania: Nocturne',
    officialTitle: 'Castlevania: Nocturne',
    origin: 'western-anime-style',
    studio: 'Powerhouse Animation Studios',
    sourceMaterial: 'Konami video game',
    metadataSource: 'manual',
    status: 'Watching',
    type: 'TV',
    genres: ['Action', 'Dark Fantasy', 'Horror'],
    themes: ['vampires', 'revolution', 'legacy', 'monsters', 'magic'],
    synopsis:
      'A follow-up Castlevania animated series centered on a new generation of vampire hunters, revolution-era conflict, magic, legacy, and supernatural war.',
    description:
      'A follow-up Castlevania animated series centered on a new generation of vampire hunters, revolution-era conflict, magic, legacy, and supernatural war.',
    allowInRecommendations: true,
    joeNote:
      'Western anime-style animation. Treat as anime-adjacent dark fantasy for recommendation purposes.'
  },

  arcane: {
    title: 'Arcane',
    officialTitle: 'Arcane',
    origin: 'western-anime-style',
    studio: 'Fortiche',
    sourceMaterial: 'League of Legends',
    metadataSource: 'manual',
    type: 'TV',
    genres: ['Action', 'Drama', 'Fantasy', 'Sci-Fi'],
    themes: ['class conflict', 'sisters', 'technology', 'trauma', 'politics'],
    synopsis:
      'A stylized animated drama about two sisters divided by trauma, class conflict, technology, crime, and political unrest.',
    description:
      'A stylized animated drama about two sisters divided by trauma, class conflict, technology, crime, and political unrest.',
    allowInRecommendations: true,
    joeNote:
      'Not Japanese anime, but anime-adjacent and useful for recommendations around stylish animation, tragedy, politics, and emotional damage.'
  },

  'blue eye samurai': {
    title: 'Blue Eye Samurai',
    officialTitle: 'Blue Eye Samurai',
    origin: 'western-anime-style',
    studio: 'Blue Spirit',
    sourceMaterial: 'Original',
    metadataSource: 'manual',
    type: 'TV',
    genres: ['Action', 'Drama'],
    themes: ['revenge', 'identity', 'samurai', 'outsider', 'violence'],
    synopsis:
      'A revenge-driven animated samurai drama about identity, violence, obsession, and survival in Edo-period Japan.',
    description:
      'A revenge-driven animated samurai drama about identity, violence, obsession, and survival in Edo-period Japan.',
    allowInRecommendations: true,
    joeNote:
      'Anime-adjacent Western animation. Strong fit for fans of mature samurai stories, revenge arcs, and stylish violence.'
  }
};

export function normalizeOverrideKey(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[:’'!.?]/g, '')
    .replace(/\\s+/g, ' ')
    .trim();
}

export function getManualMetadataOverride(title = '') {
  const key = normalizeOverrideKey(title);
  return MANUAL_METADATA_OVERRIDES[key] || null;
}

export function applyManualMetadataOverride(item = {}) {
  const override = getManualMetadataOverride(item.title || item.officialTitle || item.titleEnglish);

  if (!override) return null;

  return {
    ...item,
    ...override,
    id: item.id || override.id || normalizeOverrideKey(override.title).replace(/\\s+/g, '-'),
    title: override.title || item.title,
    officialTitle: override.officialTitle || override.title || item.officialTitle,
    cover: item.cover || override.cover || '',
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
`;

fs.writeFileSync(path.join(root, 'src', 'data', 'manualMetadataOverrides.js'), overrides, 'utf8');
console.log('Created src/data/manualMetadataOverrides.js');

// Patch animeImporter if moved/new path exists.
patchFile('src/services/animeImporter.js', (text) => {
  let out = text;

  if (!out.includes("manualMetadataOverrides")) {
    out = "import { applyManualMetadataOverride, getManualMetadataOverride } from '../data/manualMetadataOverrides';\n" + out;
  }

  // Add early return inside importAnimeByTitle if possible.
  if (!out.includes("const manualOverride = getManualMetadataOverride(title);")) {
    out = out.replace(
      /export async function importAnimeByTitle\(\{ title, status = ['"]Watching['"], library = \[\] \}\) \{/,
      (match) => match + `
  const manualOverride = getManualMetadataOverride(title);
  if (manualOverride) {
    const candidate = applyManualMetadataOverride({
      ...manualOverride,
      title: manualOverride.title,
      status,
      addedFrom: 'manual metadata override'
    });

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

  return out;
});

// Also patch old weird location if it still exists.
patchFile('src/styles/animeImporter.js', (text) => {
  let out = text;

  if (!out.includes("manualMetadataOverrides")) {
    out = "import { applyManualMetadataOverride, getManualMetadataOverride } from '../data/manualMetadataOverrides';\n" + out;
  }

  if (!out.includes("const manualOverride = getManualMetadataOverride(title);")) {
    out = out.replace(
      /export async function importAnimeByTitle\(\{ title, status = ['"]Watching['"], library = \[\] \}\) \{/,
      (match) => match + `
  const manualOverride = getManualMetadataOverride(title);
  if (manualOverride) {
    const candidate = applyManualMetadataOverride({
      ...manualOverride,
      title: manualOverride.title,
      status,
      addedFrom: 'manual metadata override'
    });

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

  return out;
});

// Patch metadata service so updater can repair Castlevania locally instead of Jikan.
patchFile('src/services/metadata.js', (text) => {
  let out = text;

  if (!out.includes("manualMetadataOverrides")) {
    out = "import { applyManualMetadataOverride } from '../data/manualMetadataOverrides';\n" + out;
  }

  if (!out.includes("const manual = applyManualMetadataOverride(item);")) {
    out = out.replace(
      /export async function fetchMetadata\(item\) \{/,
      (match) => match + `
  const manual = applyManualMetadataOverride(item);
  if (manual) return manual;
`
    );
  }

  return out;
});

// Patch generator so manual overrides can produce Genome cards without Jikan.
patchFile('scripts/generateGenomeCardForTitle.cjs', (text) => {
  let out = text;

  if (!out.includes("manualMetadataOverrides.js")) {
    out = out.replace(
      "async function fetchJikanTitle(query) {",
      `function loadManualOverride(query) {
  const file = path.join(root, 'src', 'data', 'manualMetadataOverrides.js');
  if (!fs.existsSync(file)) return null;

  const text = fs.readFileSync(file, 'utf8');
  const key = String(query || '')
    .toLowerCase()
    .replace(/[:’'!.?]/g, '')
    .replace(/\\s+/g, ' ')
    .trim();

  const blockPattern = new RegExp(key.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&') + ':\\\\s*\\\\{([\\\\s\\\\S]*?)\\\\n  \\\\}', 'i');
  const match = text.match(blockPattern);
  if (!match) return null;

  // Simple extraction for our override file fields. Good enough for local manual fallback.
  function getString(name) {
    const m = match[1].match(new RegExp(name + ":\\\\s*'([^']*)'", 'i'));
    return m ? m[1] : '';
  }

  function getArray(name) {
    const m = match[1].match(new RegExp(name + ":\\\\s*\\\\[([^\\\\]]*)\\\\]", 'i'));
    if (!m) return [];
    return m[1].split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  }

  return {
    malId: null,
    title: getString('title') || query,
    titleEnglish: getString('officialTitle') || getString('title') || query,
    titleJapanese: '',
    titleSynonyms: [],
    synopsis: getString('synopsis') || getString('description'),
    background: getString('joeNote'),
    year: null,
    season: '',
    type: getString('type') || 'TV',
    episodes: null,
    status: getString('status') || '',
    score: null,
    rating: '',
    source: getString('sourceMaterial') || 'Manual',
    studios: [getString('studio')].filter(Boolean),
    genres: getArray('genres'),
    themes: getArray('themes'),
    demographics: [],
    origin: getString('origin') || 'manual',
    metadataSource: 'manual'
  };
}

async function fetchJikanTitle(query) {
  const manual = loadManualOverride(query);
  if (manual) {
    console.log('Using manual metadata override for:', query);
    return manual;
  }
`
    );
  }

  return out;
});

// Add docs.
const doc = `# Manual Metadata Overrides

Adds a local fallback for titles that Jikan/MAL does not cover well.

## Why

Some anime-adjacent shows are not normal MAL/Jikan anime entries, including:

- Castlevania
- Castlevania: Nocturne
- Arcane
- Blue Eye Samurai

These can still be useful in JoeAnimeDB recommendations, so they get manual metadata.

## Added

\`\`\`text
src/data/manualMetadataOverrides.js
\`\`\`

## Behavior

When importing or refreshing metadata:

1. Check manual overrides first.
2. If matched, use local metadata.
3. Avoid unnecessary Jikan request.
4. Mark entry as:

\`\`\`js
metadataSource: 'manual'
origin: 'western-anime-style'
\`\`\`

## Test

\`\`\`text
add Castlevania as completed
generate genome for Castlevania
recommend Castlevania
\`\`\`
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'MANUAL_METADATA_OVERRIDES.md'), doc, 'utf8');

const check = `const fs = require('fs');
const path = require('path');

const root = process.cwd();

function ok(label, condition) {
  console.log(label + ':', condition ? 'OK' : 'MISSING');
}

ok('manual overrides file', fs.existsSync(path.join(root, 'src', 'data', 'manualMetadataOverrides.js')));

const metadata = fs.readFileSync(path.join(root, 'src', 'services', 'metadata.js'), 'utf8');
ok('metadata service override', metadata.includes('applyManualMetadataOverride'));

const importerPath = fs.existsSync(path.join(root, 'src', 'services', 'animeImporter.js'))
  ? path.join(root, 'src', 'services', 'animeImporter.js')
  : path.join(root, 'src', 'styles', 'animeImporter.js');

const importer = fs.readFileSync(importerPath, 'utf8');
ok('importer override', importer.includes('getManualMetadataOverride'));

const generator = fs.readFileSync(path.join(root, 'scripts', 'generateGenomeCardForTitle.cjs'), 'utf8');
ok('generator manual fallback', generator.includes('Using manual metadata override'));
`;

fs.writeFileSync(path.join(root, 'scripts', 'checkManualMetadataOverrides.cjs'), check, 'utf8');

console.log('');
console.log('Manual metadata override support installed.');
console.log('Run: node scripts\\\\checkManualMetadataOverrides.cjs');
