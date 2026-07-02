import { cleanTitle } from './metadata';

const BLOCKED_TYPES = new Set(['Music', 'CM', 'PV', 'Unknown']);

function titleKey(title = '') {
  return String(title).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function tokenize(title = '') {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
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

function classifyResult(result, query) {
  const wantedKey = titleKey(query);
  const wantedTokens = tokenize(query);
  const keys = [
    result.title,
    result.officialTitle,
    result.japaneseTitle,
    ...(result.titleSynonyms || [])
  ].filter(Boolean).map(titleKey);

  const exact = keys.some((key) => key === wantedKey);
  if (exact) return 'Exact Match';

  const title = titleKey(result.title);
  const official = titleKey(result.officialTitle);

  const startsWithQuery = title.startsWith(wantedKey) || official.startsWith(wantedKey);
  const containsQuery = title.includes(wantedKey) || official.includes(wantedKey);
  const hasAllTokens = wantedTokens.length > 0 && wantedTokens.every((token) => title.includes(token) || official.includes(token));

  if (startsWithQuery || (containsQuery && hasAllTokens)) {
    if (result.year && result.year > 2010 && /season|part|kingdom|second|2|ii/i.test(result.title)) return 'Sequel';
    return 'Strong Match';
  }

  if (/sinbad|gaiden|side story|spin/i.test(result.title)) return 'Spinoff';

  return 'Related';
}

export function animeIdFromTitle(item) {
  return `anime-${String(item?.malId || item?.mal_id || item?.id || titleKey(item?.title)).replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}`;
}

export function findDuplicateAnime(library = [], candidate = {}) {
  const candidateKey = titleKey(candidate.title || candidate.officialTitle);
  const candidateMalId = candidate.malId || candidate.mal_id;

  return library.find((item) => {
    const itemMalId = item.malId || item.mal_id;
    const sameMalId = candidateMalId && itemMalId && String(candidateMalId) === String(itemMalId);
    const sameTitle = candidateKey && titleKey(item.title) === candidateKey;
    const officialTitleMatch = candidate.officialTitle && titleKey(item.title) === titleKey(candidate.officialTitle);

    return sameMalId || sameTitle || officialTitleMatch;
  });
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
  const wantedKey = titleKey(cleanTitle(query));
  const wantedTokens = tokenize(cleanTitle(query));
  const allKeys = getAllTitles(match).map(titleKey);

  let score = 0;

  if (allKeys.some((key) => key === wantedKey)) score += 120;
  if (allKeys.some((key) => key.startsWith(wantedKey))) score += 70;
  if (allKeys.some((key) => key.includes(wantedKey))) score += 42;

  const primaryKey = titleKey(match.title_english || match.title || '');
  const tokenHits = wantedTokens.filter((token) => primaryKey.includes(token)).length;
  score += tokenHits * 18;

  if (match.type === 'TV') score += 35;
  if (match.type === 'Movie') score += 12;
  if (match.type === 'OVA' || match.type === 'Special') score += 6;
  if (BLOCKED_TYPES.has(match.type)) score -= 500;

  if (match.episodes) score += Math.min(match.episodes, 50) / 8;
  if (match.score) score += match.score * 1.5;

  // For ambiguous franchise searches like "magi", prefer the earliest main TV entry over later seasons.
  if (allKeys.some((key) => key === wantedKey || key.startsWith(wantedKey))) {
    const year = Number(match.year || 9999);
    score += Math.max(0, 35 - Math.max(0, year - 2000) / 2);
  }

  if (/music|pv|cm/i.test(match.type || '')) score -= 500;

  return score;
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
      const normalized = normalizeJikanAnime(item, { importScore: rankResult(item, clean) });
      return {
        ...normalized,
        importLabel: classifyResult(normalized, clean)
      };
    })
    .sort((a, b) => {
      if (a.importLabel === 'Exact Match' && b.importLabel !== 'Exact Match') return -1;
      if (b.importLabel === 'Exact Match' && a.importLabel !== 'Exact Match') return 1;
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
    return { duplicate, candidate, results };
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
