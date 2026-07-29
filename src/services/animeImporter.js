import { animeIdentityKeys } from './titleIdentity';
import { getManualMetadataForAnime, applyMetadataToAnime } from './metadataProvider';
import { cleanTitle } from './metadata';
import { fetchKitsuMetadata, searchKitsuAnime } from './kitsuProvider';
import { enrichMissingMetadata, needsWikidataRepair } from './wikidataRepair';
import { enrichAnimeKnowledge } from '../ai/knowledge/knowledgeRegistry';

const IMPORT_KITSU_ATTEMPTS = 2;
const IMPORT_WIKIDATA_ATTEMPTS = 2;
const IMPORT_RETRY_DELAY_MS = 900;

function wait(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryImportStage(label, operation, { attempts = 2, delayMs = IMPORT_RETRY_DELAY_MS } = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      console.warn(`${label} failed on attempt ${attempt}; retrying...`, error);
      await wait(delayMs * attempt);
    }
  }

  throw lastError || new Error(`${label} failed`);
}

const EXTRA_STOP_WORDS = new Set([
  'the', 'of', 'and', 'a', 'an', 'season', 'part', 'tv', 'movie', 'ova',
  'special', 'specials', 'second', 'third', 'final'
]);

function titleKey(title = '') {
  return String(title).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function words(title = '') {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function importantWords(title = '') {
  return words(title).filter((word) => !EXTRA_STOP_WORDS.has(word));
}

function allCandidateTitleKeys(candidate = {}) {
  return [
    candidate.title,
    candidate.officialTitle,
    candidate.japaneseTitle,
    ...(candidate.titleSynonyms || []),
    ...(candidate.titles || []).map((item) => item.title)
  ]
    .filter(Boolean)
    .map(titleKey)
    .filter(Boolean);
}

function getCandidateTitles(result) {
  return [
    result.title,
    result.officialTitle,
    result.japaneseTitle,
    ...(result.titleSynonyms || [])
  ].filter(Boolean);
}

function hasWholeWord(title, query) {
  const queryWords = importantWords(query);
  const titleWords = importantWords(title);
  if (!queryWords.length || !titleWords.length) return false;

  return queryWords.every((word) => titleWords.includes(word));
}

function startsWithQueryTitle(title, query) {
  const queryWords = importantWords(query);
  const titleWords = importantWords(title);
  if (!queryWords.length || !titleWords.length) return false;

  return queryWords.every((word, index) => titleWords[index] === word);
}

function isDifferentFranchise(title, query) {
  const queryWords = importantWords(query);
  const titleWords = importantWords(title);

  if (!queryWords.length || !titleWords.length) return false;

  return queryWords.length === 1 && titleWords.includes(queryWords[0]) && titleWords[0] !== queryWords[0];
}

function classifyResult(result, query) {
  const wantedKey = titleKey(query);
  const titles = getCandidateTitles(result);
  const keys = titles.map(titleKey);
  const mainTitle = result.title || result.officialTitle || '';

  if (keys.some((key) => key === wantedKey)) return 'Exact Match';

  if (titles.some((title) => startsWithQueryTitle(title, query))) {
    if (/sinbad|gaiden|side story|spin/i.test(mainTitle)) return 'Spinoff';
    if (/kingdom|season|part|second|2|ii|final/i.test(mainTitle)) return 'Sequel';
    return 'Best Match';
  }

  if (titles.some((title) => hasWholeWord(title, query))) {
    if (isDifferentFranchise(mainTitle, query)) return 'Other Franchise';
    if (/sinbad|gaiden|side story|spin/i.test(mainTitle)) return 'Spinoff';
    return 'Related';
  }

  return 'Other Match';
}

function labelWeight(label) {
  switch (label) {
    case 'Exact Match': return 500;
    case 'Best Match': return 430;
    case 'Sequel': return 380;
    case 'Spinoff': return 310;
    case 'Related': return 220;
    case 'Other Franchise': return 90;
    default: return 40;
  }
}

function confidenceFromScore(score, label) {
  const base = Math.max(0, Math.min(99, Math.round(score / 6)));
  const floor = {
    'Exact Match': 96,
    'Best Match': 91,
    Sequel: 86,
    Spinoff: 76,
    Related: 62,
    'Other Franchise': 35,
    'Other Match': 25
  }[label] || 25;

  const ceiling = {
    'Exact Match': 99,
    'Best Match': 96,
    Sequel: 93,
    Spinoff: 86,
    Related: 74,
    'Other Franchise': 55,
    'Other Match': 45
  }[label] || 45;

  return Math.max(floor, Math.min(ceiling, base));
}

export function animeIdFromTitle(item) {
  const providerId = item?.kitsuId
    ? `kitsu-${item.kitsuId}`
    : item?.malId || item?.mal_id || item?.id || titleKey(item?.title);

  return `anime-${String(providerId).replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}`;
}

export function findDuplicateAnime(library = [], candidate = {}) {
  const candidateKitsuId = candidate.kitsuId;
  const candidateMalId = candidate.malId || candidate.mal_id;
  const candidateKeys = new Set([
    ...allCandidateTitleKeys(candidate),
    ...animeIdentityKeys(candidate)
  ]);

  return library.find((item) => {
    const itemKitsuId = item.kitsuId;
    const itemMalId = item.malId || item.mal_id;
    if (candidateKitsuId && itemKitsuId && String(candidateKitsuId) === String(itemKitsuId)) return true;
    if (candidateMalId && itemMalId && String(candidateMalId) === String(itemMalId)) return true;

    const itemKeys = [
      ...allCandidateTitleKeys(item),
      ...animeIdentityKeys(item)
    ];
    if (itemKeys.some((key) => candidateKeys.has(key))) return true;

    // Deliberately no generic prefix matching: separate franchise entries such
    // as Trigun and Trigun Stampede must remain separate.
    return false;
  });
}


export function findLocalTitleMatches(library = [], title = '') {
  const queryKey = titleKey(title);
  const queryWords = importantWords(title);

  if (!queryKey) {
    return { exact: [], shorthand: [], related: [], all: [] };
  }

  const scored = library
    .map((item) => {
      const titles = getCandidateTitles(item);
      const keys = titles.map(titleKey).filter(Boolean);
      const titleTexts = titles.join(' | ');
      const itemWords = importantWords(item.officialTitle || item.title || '');
      const exact = keys.some((key) => key === queryKey);
      const startsEitherWay = keys.some((key) => {
        if (!key || key === queryKey) return false;
        return key.startsWith(queryKey) || queryKey.startsWith(key);
      });
      const wordOverlap = queryWords.length && queryWords.every((word) => itemWords.includes(word));

      let score = 0;
      let reason = '';

      if (exact) {
        score = 100;
        reason = 'Exact local title match';
      } else if (wordOverlap) {
        score = 88;
        reason = 'All title words matched';
      } else if (startsEitherWay) {
        score = 70;
        reason = 'Same franchise / shorthand match';
      }

      if (!score) return null;

      return {
        ...item,
        matchScore: score,
        matchReason: reason,
        matchTitles: titleTexts
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.matchScore || 0) - Number(a.matchScore || 0));

  return {
    exact: scored.filter((item) => item.matchScore >= 100),
    shorthand: scored.filter((item) => item.matchScore >= 88 && item.matchScore < 100),
    related: scored.filter((item) => item.matchScore >= 70 && item.matchScore < 88),
    all: scored
  };
}

export function mergeAnimeMetadata(existing = {}, incoming = {}, statusOverride) {
  // SPRINT4_AUTO_KNOWLEDGE_MERGE
  return enrichAnimeKnowledge({
    ...existing,
    ...incoming,

    // Keep the existing stable library id so this updates instead of adding another card.
    id: existing.id || animeIdFromTitle(incoming),

    // Prefer the official enriched title when upgrading shorthand entries.
    title: incoming.officialTitle || incoming.title || existing.title,

    // Preserve personal/user-owned fields.
    joeScore: existing.joeScore ?? incoming.joeScore,
    finalRank: existing.finalRank ?? incoming.finalRank,
    status: statusOverride || existing.status || incoming.status || 'Watching',
    favorite: Boolean(existing.favorite),
    rewatches: Number(existing.rewatches || 0),
    notes: existing.notes || incoming.notes || '',
    addedFrom: existing.addedFrom || incoming.addedFrom || 'Importer',

    // Keep existing user metadata only when incoming does not have better metadata.
    cover: incoming.cover || existing.cover || '',
    synopsis: incoming.synopsis || existing.synopsis || '',
    genres: incoming.genres?.length ? incoming.genres : existing.genres || [],
    studio: incoming.studio || existing.studio || '',
    year: incoming.year || existing.year || '',
    episodeCount: incoming.episodeCount || existing.episodeCount || 0,
    episodes: incoming.episodes || incoming.episodeCount || existing.episodes || existing.episodeCount || 0,
    communityScore: incoming.communityScore || existing.communityScore || '',
    malScore: incoming.malScore || incoming.communityScore || existing.malScore || existing.communityScore || '',
    kitsuId: incoming.kitsuId || existing.kitsuId || '',
    malId: incoming.malId || existing.malId || '',
    officialTitle: incoming.officialTitle || existing.officialTitle || incoming.title || existing.title,
    japaneseTitle: incoming.japaneseTitle || existing.japaneseTitle || '',
    titleSynonyms: incoming.titleSynonyms?.length ? incoming.titleSynonyms : existing.titleSynonyms || [],
    trailerUrl: incoming.trailerUrl || existing.trailerUrl || '',
    metadataUpdatedAt: incoming.metadataUpdatedAt || new Date().toISOString()
  });
}

function createLocalFallbackAnime(title, status = 'Watching', reason = '') {
  return enrichAnimeKnowledge({
    id: `anime-${titleKey(title)}`,
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
  const hasGenres = Array.isArray(item.genres) && item.genres.length > 0;
  const hasIdentity = Boolean(item.malId || item.kitsuId || item.officialTitle);
  const hasCoreDetails = Boolean(
    item.synopsis ||
    item.description ||
    item.year ||
    item.episodeCount ||
    item.episodes
  );

  return Boolean(hasGenres && hasIdentity && hasCoreDetails);
}


async function completeImportedMetadata(candidate = {}, library = []) {
  if (!needsWikidataRepair(candidate)) {
    return {
      candidate: {
        ...candidate,
        metadataNeedsReview: false,
        metadataReviewReason: ''
      },
      metadataEnrichment: {
        attempted: false,
        improved: false,
        fields: [],
        unresolved: false
      }
    };
  }

  let result = null;

  for (let attempt = 1; attempt <= IMPORT_WIKIDATA_ATTEMPTS; attempt += 1) {
    result = await enrichMissingMetadata(candidate, library);

    if (!result.unresolved || attempt >= IMPORT_WIKIDATA_ATTEMPTS) break;

    console.warn(
      `Importer Wikidata completion unresolved for ${candidate.title || 'title'}; retrying (${attempt}/${IMPORT_WIKIDATA_ATTEMPTS})`,
      result.reason || ''
    );
    await wait(IMPORT_RETRY_DELAY_MS * attempt);
  }

  return {
    candidate: result.anime,
    metadataEnrichment: {
      attempted: true,
      improved: Boolean(result.improved),
      fields: result.fields || [],
      unresolved: Boolean(result.unresolved),
      reason: result.reason || '',
      source: result.source || '',
      matchedTitle: result.matchedTitle || '',
      matchedQuery: result.matchedQuery || '',
      confidence: result.confidence || 0,
      candidates: result.candidates || []
    }
  };
}


export async function enrichAnimeCandidate({
  candidate = {},
  library = [],
  status = 'Watching'
} = {}) {
  if (!candidate?.title && !candidate?.officialTitle) {
    throw new Error('A resolved anime candidate is required.');
  }

  let enriched = {
    ...candidate,
    status: status || candidate.status || 'Watching'
  };

  const needsKitsuMetadata = Boolean(
    enriched.kitsuId &&
    (
      !enriched.genres?.length ||
      !enriched.studio ||
      !(enriched.synopsis || enriched.description) ||
      !(enriched.episodeCount || enriched.episodes)
    )
  );

  if (needsKitsuMetadata) {
    try {
      const kitsuMetadata = await retryImportStage(
        `Kitsu enrichment for ${enriched.title || enriched.officialTitle}`,
        () => fetchKitsuMetadata(enriched),
        { attempts: IMPORT_KITSU_ATTEMPTS }
      );

      enriched = {
        ...enriched,
        ...kitsuMetadata,
        id: enriched.id || kitsuMetadata.id || animeIdFromTitle(kitsuMetadata),
        title: enriched.title || kitsuMetadata.title,
        officialTitle:
          kitsuMetadata.officialTitle ||
          kitsuMetadata.title ||
          enriched.officialTitle ||
          enriched.title,
        status: status || enriched.status || kitsuMetadata.status || 'Watching'
      };
    } catch (error) {
      console.warn(
        'Selected anime Kitsu enrichment failed:',
        enriched.title || enriched.officialTitle,
        error
      );
    }
  }

  let metadataEnrichment = {
    attempted: false,
    improved: false,
    fields: [],
    unresolved: false
  };

  try {
    const completion = await completeImportedMetadata(enriched, library);
    enriched = completion.candidate;
    metadataEnrichment = completion.metadataEnrichment;
  } catch (error) {
    console.warn(
      'Selected anime metadata completion failed:',
      enriched.title || enriched.officialTitle,
      error
    );

    metadataEnrichment = {
      attempted: true,
      improved: false,
      fields: [],
      unresolved: true,
      reason: error?.message || String(error)
    };
  }

  return {
    candidate: {
      ...enriched,
      id: enriched.id || animeIdFromTitle(enriched),
      status: status || enriched.status || 'Watching',
      metadataNeedsRefresh: Boolean(
        enriched.metadataNeedsRefresh ||
        metadataEnrichment.unresolved
      )
    },
    metadataEnrichment
  };
}


export async function searchAnimeCandidates(title, { limit = 8 } = {}) {
  const clean = cleanTitle(title);
  const kitsuResults = await searchKitsuAnime(clean, {
    limit: Math.max(limit, 8)
  });

  return kitsuResults
    .map((item) => {
      const label = classifyResult(item, clean);
      const score = labelWeight(label) + (label === 'Exact Match' ? 120 : 0);

      return {
        ...item,
        importScore: score,
        importLabel: label,
        importConfidence: confidenceFromScore(score, label),
        metadataSource: 'kitsu',
        metadataNeedsRefresh: !item.genres?.length
      };
    })
    .sort((a, b) => {
      if (labelWeight(b.importLabel) !== labelWeight(a.importLabel)) {
        return labelWeight(b.importLabel) - labelWeight(a.importLabel);
      }
      return Number(b.importScore || 0) - Number(a.importScore || 0);
    })
    .slice(0, limit);
}


export async function importAnimeByTitle({
  title,
  status = 'Watching',
  library = []
}) {
  const localDuplicate = findLocalTitleMatch(library, title);

  if (localDuplicate && localEntryHasUsableMetadata(localDuplicate)) {
    return {
      duplicate: localDuplicate,
      candidate: {
        ...localDuplicate,
        status
      },
      merged: mergeAnimeMetadata(
        localDuplicate,
        { ...localDuplicate, status },
        status
      ),
      results: [],
      localOnly: true,
      skippedRemoteLookup: true,
      metadataEnrichment: {
        attempted: false,
        improved: false,
        fields: [],
        unresolved: false
      }
    };
  }

  let metadataEnrichment = {
    attempted: false,
    improved: false,
    fields: [],
    unresolved: false
  };

  const manualMetadata = getManualMetadataForAnime(title);

  if (manualMetadata) {
    let candidate = applyMetadataToAnime(
      {
        title,
        status,
        addedFrom: 'manual metadata override'
      },
      manualMetadata
    );

    try {
      const completion = await completeImportedMetadata(candidate, library);
      candidate = completion.candidate;
      metadataEnrichment = completion.metadataEnrichment;
    } catch (error) {
      console.warn('Automatic metadata completion failed:', title, error);
      metadataEnrichment = {
        attempted: true,
        improved: false,
        fields: [],
        unresolved: true,
        reason: error?.message || String(error)
      };
    }

    const duplicate = findDuplicateAnime(library, candidate) || localDuplicate;

    return {
      candidate,
      duplicate,
      merged: duplicate
        ? mergeAnimeMetadata(duplicate, candidate, status)
        : undefined,
      manualOverride: true,
      metadataEnrichment
    };
  }

  let results = [];
  let lookupError = '';

  try {
    results = await retryImportStage(
      `Kitsu search for ${title}`,
      () => searchAnimeCandidates(title, { limit: 5 }),
      { attempts: IMPORT_KITSU_ATTEMPTS }
    );
  } catch (error) {
    lookupError = error?.message || String(error);
    console.warn(
      'Kitsu search unavailable, using local fallback for:',
      title,
      error
    );
  }

  let candidate =
    results[0] || createLocalFallbackAnime(title, status, lookupError);

  const needsKitsuEnrichment = Boolean(
    results.length &&
      (
        !candidate.genres?.length ||
        !candidate.studio ||
        !(candidate.synopsis || candidate.description) ||
        !(candidate.episodeCount || candidate.episodes)
      )
  );

  if (needsKitsuEnrichment) {
    try {
      const enrichmentInput = {
        ...candidate,
        title: candidate.title || title,
        officialTitle: candidate.officialTitle || candidate.title || title,
        status
      };

      const enriched = await retryImportStage(
        `Kitsu enrichment for ${title}`,
        () => fetchKitsuMetadata(enrichmentInput),
        { attempts: IMPORT_KITSU_ATTEMPTS }
      );

      candidate = {
        ...candidate,
        ...enriched,
        id: candidate.id || enriched.id || animeIdFromTitle(enriched),
        title: candidate.title || enriched.title || title,
        officialTitle:
          enriched.officialTitle ||
          enriched.title ||
          candidate.officialTitle ||
          candidate.title ||
          title,
        status,
        genres: enriched.genres?.length
          ? enriched.genres
          : candidate.genres || [],
        studio: enriched.studio || candidate.studio || '',
        synopsis:
          enriched.synopsis ||
          enriched.description ||
          candidate.synopsis ||
          candidate.description ||
          '',
        description:
          enriched.description ||
          enriched.synopsis ||
          candidate.description ||
          candidate.synopsis ||
          '',
        episodeCount:
          enriched.episodeCount ||
          enriched.episodes ||
          candidate.episodeCount ||
          candidate.episodes ||
          0,
        episodes:
          enriched.episodes ||
          enriched.episodeCount ||
          candidate.episodes ||
          candidate.episodeCount ||
          0,
        metadataSource:
          enriched.metadataSource ||
          candidate.metadataSource ||
          'kitsu',
        metadataUpdatedAt:
          enriched.metadataUpdatedAt ||
          candidate.metadataUpdatedAt ||
          new Date().toISOString()
      };
    } catch (error) {
      console.warn('Importer Kitsu enrichment failed:', title, error);

      candidate = {
        ...candidate,
        metadataNeedsRefresh: true,
        syncStatus: {
          ...(candidate.syncStatus || {}),
          metadata: Boolean(
            candidate.genres?.length ||
              candidate.synopsis ||
              candidate.description
          ),
          poster: Boolean(candidate.cover),
          dirty: true,
          metadataError: error?.message || String(error),
          lastMetadataAttempt: new Date().toISOString()
        }
      };
    }
  }

  // Automatic completion is best-effort. A Wikidata miss must never throw the
  // whole title into the list-import Needs Review queue.
  try {
    const completion = await completeImportedMetadata(candidate, library);
    candidate = completion.candidate;
    metadataEnrichment = completion.metadataEnrichment;
  } catch (error) {
    console.warn('Automatic metadata completion failed:', title, error);
    metadataEnrichment = {
      attempted: true,
      improved: false,
      fields: [],
      unresolved: true,
      reason: error?.message || String(error)
    };
  }

  const duplicate = findDuplicateAnime(library, candidate) || localDuplicate;

  if (duplicate) {
    return {
      duplicate,
      candidate,
      merged: mergeAnimeMetadata(duplicate, candidate, status),
      results,
      metadataLookupFailed: Boolean(lookupError),
      lookupError,
      metadataEnrichment
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
      notes:
        candidate.notes ||
        (
          lookupError
            ? 'Added locally. Metadata refresh needed.'
            : 'Added from JoeAnimeDB importer.'
        ),
      metadataNeedsRefresh: Boolean(
        candidate.metadataNeedsRefresh ||
          lookupError ||
          metadataEnrichment.unresolved
      )
    },
    results,
    metadataLookupFailed: Boolean(lookupError),
    lookupError,
    metadataEnrichment
  };
}
