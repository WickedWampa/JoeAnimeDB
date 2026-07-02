import { cleanTitle } from './metadata';

const BLOCKED_TYPES = new Set(['Music', 'CM', 'PV', 'Unknown']);
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

    // Short-hand upgrade support:
    // "Frieren" should match "Frieren: Beyond Journey's End",
    // but only when the shorter key is distinctive enough.
    for (const itemKey of itemKeys) {
      for (const candidateKey of candidateKeys) {
        const shortEnough = Math.min(itemKey.length, candidateKey.length) >= 6;
        if (shortEnough && (candidateKey.startsWith(itemKey) || itemKey.startsWith(candidateKey))) return true;
      }
    }

    return false;
  });
}

export function mergeAnimeMetadata(existing = {}, incoming = {}, statusOverride) {
  return {
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
  };
}

export function normalizeJikanAnime(match, base = {}) {
  const genres = [
    ...(match.genres || []),
    ...(match.themes || []),
    ...(match.demographics || [])
  ].map((item) => item.name);

  return {
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
  };
}

function rankResult(match, query) {
  const clean = cleanTitle(query);
  const normalized = normalizeJikanAnime(match);
  const label = classifyResult(normalized, clean);
  const allKeys = getAllTitles(match).map(titleKey);
  const wantedKey = titleKey(clean);
  const wantedWords = importantWords(clean);
  const primaryWords = importantWords(match.title_english || match.title || '');

  let score = labelWeight(label);

  if (allKeys.some((key) => key === wantedKey)) score += 120;
  if (allKeys.some((key) => key.startsWith(wantedKey))) score += 60;
  if (wantedWords.length && wantedWords.every((word) => primaryWords.includes(word))) score += 45;

  if (match.type === 'TV') score += 35;
  if (match.type === 'Movie') score += 12;
  if (match.type === 'OVA' || match.type === 'Special') score += 6;
  if (BLOCKED_TYPES.has(match.type)) score -= 500;

  if (match.episodes) score += Math.min(match.episodes, 50) / 8;
  if (match.score) score += match.score * 1.5;

  if (label === 'Exact Match' || label === 'Best Match') {
    const year = Number(match.year || 9999);
    score += Math.max(0, 40 - Math.max(0, year - 2000) / 2);
  }

  if (label === 'Other Franchise') score -= 80;

  return { score, label };
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
  const results = await searchAnimeCandidates(title, { limit: 5 });
  const candidate = results[0] || {
    id: `anime-${titleKey(title)}`,
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
