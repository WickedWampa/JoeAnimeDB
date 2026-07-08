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
const file = path.join(root, 'src', 'services', 'animeImporter.js');

if (!fs.existsSync(file)) {
  console.error('Missing src/services/animeImporter.js');
  process.exit(1);
}

let text = fs.readFileSync(file, 'utf8');

const helper = `
function createLocalFallbackAnime(title, status = 'Watching', reason = '') {
  return enrichAnimeKnowledge({
    id: \`anime-\${titleKey(title)}\`,
    title,
    officialTitle: title,
    status,
    favorite: false,
    rewatches: 0,
    notes: 'Added locally because metadata lookup was unavailable.',
    addedFrom: 'JoeAnimeDB local fallback',
    metadataNeedsRefresh: true,
    syncStatus: {
      metadata: false,
      poster: false,
      dirty: true,
      metadataError: reason || 'Metadata lookup unavailable',
      lastMetadataAttempt: new Date().toISOString()
    },
    metadataUpdatedAt: ''
  });
}

function findLocalTitleMatch(library = [], title = '') {
  const candidate = {
    title,
    officialTitle: title,
    titleSynonyms: []
  };

  return findDuplicateAnime(library, candidate);
}

function localEntryHasUsableMetadata(item = {}) {
  return Boolean(
    item.malId ||
    item.officialTitle ||
    item.synopsis ||
    item.description ||
    item.studio ||
    item.year ||
    item.episodeCount ||
    item.episodes ||
    (Array.isArray(item.genres) && item.genres.length)
  );
}

`;

if (!text.includes('function createLocalFallbackAnime')) {
  text = text.replace('export async function searchAnimeCandidates', helper + '\nexport async function searchAnimeCandidates');
}

const oldFunction = `export async function importAnimeByTitle({ title, status = 'Watching', library = [] }) {
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

  const results = await searchAnimeCandidates(title, { limit: 5 });
  const candidate = results[0] || {
    id: \`anime-\${titleKey(title)}\`,
    title,
    officialTitle: title
  };

  const duplicate = findDuplicateAnime(library, candidate);

  if (duplicate) {
    return {
      duplicate,
      candidate,
      merged: mergeAnimeMetadata(duplicate, candidate, status),
      results
    };
  }

  return {
    duplicate: null,
    candidate: {
      ...candidate,
      id: animeIdFromTitle(candidate),
      status,
      favorite: false,
      rewatches: 0,
      notes: candidate.notes || 'Added from JoeAnimeDB importer.'
    },
    results
  };
}
`;

const newFunction = `export async function importAnimeByTitle({ title, status = 'Watching', library = [] }) {
  // Local-first duplicate check.
  // If the title already exists and has usable metadata, do NOT hit Jikan.
  const localDuplicate = findLocalTitleMatch(library, title);

  if (localDuplicate && localEntryHasUsableMetadata(localDuplicate)) {
    return {
      duplicate: localDuplicate,
      candidate: {
        ...localDuplicate,
        status
      },
      merged: mergeAnimeMetadata(localDuplicate, { ...localDuplicate, status }, status),
      results: [],
      localOnly: true,
      skippedRemoteLookup: true
    };
  }

  const manualMetadata = getManualMetadataForAnime(title);
  if (manualMetadata) {
    const candidate = applyMetadataToAnime({
      title,
      status,
      addedFrom: 'manual metadata override'
    }, manualMetadata);

    const duplicate = findDuplicateAnime(library, candidate) || localDuplicate;

    return {
      candidate,
      duplicate,
      merged: duplicate ? mergeAnimeMetadata(duplicate, candidate, status) : undefined,
      manualOverride: true
    };
  }

  let results = [];
  let lookupError = '';

  try {
    results = await searchAnimeCandidates(title, { limit: 5 });
  } catch (error) {
    lookupError = error?.message || String(error);
    console.warn('Jikan unavailable, using local fallback for:', title, error);
  }

  const candidate = results[0] || createLocalFallbackAnime(title, status, lookupError);

  const duplicate = findDuplicateAnime(library, candidate) || localDuplicate;

  if (duplicate) {
    return {
      duplicate,
      candidate,
      merged: mergeAnimeMetadata(duplicate, candidate, status),
      results,
      metadataLookupFailed: Boolean(lookupError),
      lookupError
    };
  }

  return {
    duplicate: null,
    candidate: {
      ...candidate,
      id: animeIdFromTitle(candidate),
      status,
      favorite: false,
      rewatches: 0,
      notes: candidate.notes || (lookupError
        ? 'Added locally. Metadata refresh needed.'
        : 'Added from JoeAnimeDB importer.'),
      metadataNeedsRefresh: candidate.metadataNeedsRefresh || Boolean(lookupError)
    },
    results,
    metadataLookupFailed: Boolean(lookupError),
    lookupError
  };
}
`;

if (!text.includes(oldFunction)) {
  console.error('Could not find expected importAnimeByTitle block. File may have changed.');
  process.exit(1);
}

text = text.replace(oldFunction, newFunction);
fs.writeFileSync(file, text, 'utf8');

console.log('Patched src/services/animeImporter.js');
console.log('');
console.log('What changed:');
console.log('- Existing healthy library entries skip Jikan.');
console.log('- Jikan 504 no longer blocks adding a title.');
console.log('- Missing metadata entries save locally with metadataNeedsRefresh.');
console.log('');
console.log('Run npm run dev and test: add Bleach, add Trigun, bulk add.');
