import { fetchMetadataFromProvider, getManualMetadataForAnime, applyMetadataToAnime } from './metadataProvider';
import { cleanTitle } from './metadata';
import { enrichAnimeKnowledge } from '../ai/knowledge/knowledgeRegistry';

const BLOCKED_TYPES = new Set(['Music', 'CM', 'PV', 'Unknown']);
const SIDE_CONTENT_RE = /picture drama|recap|summary|special|ova|ona|omake|chibi|mini|digest|pv|cm|music|trailer/i;
const SEQUEL_RE = /\b(part\s*2|part\s*3|season\s*2|season\s*3|2nd|3rd|second season|third season|ii|iii|final)\b/i;
const QUERY_SEQUEL_RE = /\b(part|season|2|3|ii|iii|second|third|final)\b/i;
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

function remoteCover(match) {
  return (
    match.images?.jpg?.large_image_url ||
    match.images?.webp?.large_image_url ||
    match.images?.jpg?.image_url ||
    match.images?.webp?.image_url ||
    ''
  );
}

function getAllTitles(match) {
  return [
    match.title,
    match.title_english,
    match.title_japanese,
    ...(match.title_synonyms || [])
  ].filter(Boolean);
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

function extraWordPenalty(match, query) {
  const queryWords = importantWords(query);
  const titleWords = importantWords(match.title_english || match.title || '');
  if (!queryWords.length || !titleWords.length) return 0;
  const extra = Math.max(0, titleWords.length - queryWords.length);
  return Math.min(55, extra * 5);
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
  return `anime-${String(item?.malId || item?.mal_id || item?.id || titleKey(item?.title)).replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}`;
}

export function findDuplicateAnime(library = [], candidate = {}) {
  const candidateMalId = candidate.malId || candidate.mal_id;
  const candidateKeys = new Set(allCandidateTitleKeys(candidate));

  return library.find((item) => {
    const itemMalId = item.malId || item.mal_id;
    if (candidateMalId && itemMalId && String(candidateMalId) === String(itemMalId)) return true;

    const itemKeys = allCandidateTitleKeys(item);
    if (itemKeys.some((key) => candidateKeys.has(key))) return true;

    // Do not collapse franchise entries by prefix here.
    // Example: "Trigun Stampede" must not silently update "Trigun".
    // Fuzzy / shorthand decisions are handled by findLocalTitleMatches() so the UI can ask the user.

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
    malId: incoming.malId || existing.malId || '',
    officialTitle: incoming.officialTitle || existing.officialTitle || incoming.title || existing.title,
    japaneseTitle: incoming.japaneseTitle || existing.japaneseTitle || '',
    titleSynonyms: incoming.titleSynonyms?.length ? incoming.titleSynonyms : existing.titleSynonyms || [],
    trailerUrl: incoming.trailerUrl || existing.trailerUrl || '',
    metadataUpdatedAt: incoming.metadataUpdatedAt || new Date().toISOString()
  });
}

export function normalizeJikanAnime(match, base = {}) {
  // SPRINT4_AUTO_KNOWLEDGE_NORMALIZE
  const genres = [
    ...(match.genres || []),
    ...(match.themes || []),
    ...(match.demographics || [])
  ].map((item) => item.name);

  return enrichAnimeKnowledge({
    ...base,
    id: base.id || `anime-${match.mal_id}`,
    malId: match.mal_id,
    title: match.title_english || match.title || base.title,
    officialTitle: match.title_english || match.title || base.title,
    japaneseTitle: match.title_japanese || '',
    titleSynonyms: match.title_synonyms || [],
    cover: remoteCover(match) || base.cover || '',
    trailerUrl: match.trailer?.url || base.trailerUrl || '',
    synopsis: match.synopsis || base.synopsis || '',
    type: match.type || base.type || 'TV',
    year: match.year || base.year || '',
    episodeCount: match.episodes || base.episodeCount || 0,
    episodes: match.episodes || base.episodes || 0,
    communityScore: match.score || base.communityScore || '',
    malScore: match.score || base.malScore || '',
    studio: match.studios?.length ? match.studios.map((studio) => studio.name).join(' / ') : base.studio || '',
    genres: genres.length ? [...new Set([...(base.genres || []), ...genres])].slice(0, 8) : base.genres || [],
    metadataUpdatedAt: new Date().toISOString()
  });
}

function rankResult(match, query) {
  const clean = cleanTitle(query);
  const normalized = normalizeJikanAnime(match);
  const label = classifyResult(normalized, clean);
  const allKeys = getAllTitles(match).map(titleKey);
  const wantedKey = titleKey(clean);
  const wantedWords = importantWords(clean);
  const primaryWords = importantWords(match.title_english || match.title || '');

  let score = labelWeight(label); const allTitleText = getAllTitles(match).join(' ');

  if (allKeys.some((key) => key === wantedKey)) score += 120;
  if (allKeys.some((key) => key.startsWith(wantedKey))) score += 60;
  if (wantedWords.length && wantedWords.every((word) => primaryWords.includes(word))) score += 45;

  if (match.type === 'TV') score += 85;
  if (match.type === 'Movie') score += 12;
  if (match.type === 'OVA' || match.type === 'Special' || match.type === 'ONA') score -= 45;
  if (BLOCKED_TYPES.has(match.type)) score -= 500;
  if (SIDE_CONTENT_RE.test(allTitleText) && !SIDE_CONTENT_RE.test(clean)) score -= 160;
  if (SEQUEL_RE.test(allTitleText) && !QUERY_SEQUEL_RE.test(clean)) score -= 80;
  score -= extraWordPenalty(match, clean);

  if (match.episodes) score += Math.min(match.episodes, 50) / 8;
  if (match.score) score += match.score * 1.5; if (match.members) score += Math.min(45, Math.log10(match.members + 1) * 7);

  if (label === 'Exact Match' || label === 'Best Match') {
    const year = Number(match.year || 9999);
    score += Math.max(0, 40 - Math.max(0, year - 2000) / 2);
  }

  if (label === 'Other Franchise') score -= 80;

  return { score, label };
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


export async function searchAnimeCandidates(title, { limit = 8 } = {}) {
  const clean = cleanTitle(title);
  const q = encodeURIComponent(clean);
  const res = await fetch(`https://api.jikan.moe/v4/anime?q=${q}&limit=15&sfw=true`);

  if (!res.ok) throw new Error(`Jikan ${res.status}`);

  const payload = await res.json();

  return (payload.data || [])
    .filter((item) => !BLOCKED_TYPES.has(item.type))
    .map((item) => {
      const ranked = rankResult(item, clean);
      const normalized = normalizeJikanAnime(item, { importScore: ranked.score });
      return {
        ...normalized,
        importLabel: ranked.label,
        importConfidence: confidenceFromScore(ranked.score, ranked.label)
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

export async function importAnimeByTitle({ title, status = 'Watching', library = [] }) {
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
