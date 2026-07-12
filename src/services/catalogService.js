import catalogSeed from '../data/animeCatalogSeed.json';
import { fetchMetadata, needsArtworkRepair, sleep } from './metadata';

const JIKAN_TOP_ANIME_URL = 'https://api.jikan.moe/v4/top/anime';

function titleKey(title = '') {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function hasUsefulMetadata(item) {
  return Boolean(
    item?.cover &&
    item?.synopsis &&
    item?.studio &&
    Array.isArray(item?.genres) &&
    item.genres.length
  );
}

function richness(item) {
  return [
    item?.cover,
    item?.synopsis,
    item?.studio,
    item?.year,
    item?.episodes || item?.episodeCount,
    item?.malScore || item?.communityScore,
    Array.isArray(item?.genres) && item.genres.length
  ].filter(Boolean).length;
}

export function mergeCatalogEntries({ library = [], catalog = [], seed = catalogSeed } = {}) {
  const libraryKeys = new Set(library.map((item) => titleKey(item.title)).filter(Boolean));
  const byKey = new Map();

  for (const item of [...seed, ...catalog]) {
    const key = titleKey(item.title);
    if (!key || libraryKeys.has(key)) continue;

    const current = byKey.get(key);
    if (!current || richness(item) >= richness(current)) {
      byKey.set(key, {
        id: item.id || current?.id || `catalog-${key}`,
        ...current,
        ...item
      });
    }
  }

  return [...byKey.values()];
}

export function buildCatalogQueue({ library = [], catalog = [], seed = catalogSeed, limit = 50 } = {}) {
  return mergeCatalogEntries({ library, catalog, seed })
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => needsArtworkRepair(item) || !hasUsefulMetadata(item))
    .slice(0, limit);
}

export async function updateCatalogMetadata({
  library = [],
  catalog = [],
  repository,
  onProgress,
  limit = 50
} = {}) {
  let nextCatalog = mergeCatalogEntries({ library, catalog, seed: catalogSeed });
  const queue = buildCatalogQueue({ library, catalog: nextCatalog, seed: [], limit });

  if (!queue.length) {
    const saved = await repository.importCatalog(nextCatalog);
    return {
      saved,
      updated: 0,
      total: nextCatalog.length
    };
  }

  for (let passIndex = 0; passIndex < queue.length; passIndex++) {
    const { item } = queue[passIndex];

    onProgress?.({
      index: passIndex + 1,
      total: queue.length,
      title: item.title
    });

    try {
      const enriched = await fetchMetadata(item);
      const key = titleKey(enriched.title || item.title);

      nextCatalog = nextCatalog.map((candidate) =>
        titleKey(candidate.title) === key
          ? {
              ...candidate,
              ...enriched,
              title: candidate.title || enriched.officialTitle || enriched.title,
              officialTitle:
                enriched.officialTitle ||
                enriched.title ||
                candidate.officialTitle ||
                candidate.title,
              titleSynonyms: [
                ...new Set([
                  ...(candidate.titleSynonyms || []),
                  ...(enriched.titleSynonyms || []),
                  enriched.title
                ])
              ].filter((value) => value && value !== candidate.title)
            }
          : candidate
      );
    } catch (error) {
      console.warn('Catalog metadata failed:', item.title, error);
    }

    await repository.importCatalog(nextCatalog);
    await sleep(500);
  }

  const saved = await repository.importCatalog(nextCatalog);

  return {
    saved,
    updated: queue.length,
    total: nextCatalog.length
  };
}


function remoteCover(match = {}) {
  return match.images?.jpg?.large_image_url ||
    match.images?.webp?.large_image_url ||
    match.images?.jpg?.image_url ||
    match.images?.webp?.image_url ||
    '';
}

function normalizeTopAnime(match = {}) {
  const genres = [
    ...(match.genres || []),
    ...(match.themes || []),
    ...(match.demographics || [])
  ].map((entry) => entry?.name).filter(Boolean);

  return {
    id: `catalog-mal-${match.mal_id}`,
    malId: match.mal_id,
    title: match.title_english || match.title || 'Unknown title',
    officialTitle: match.title_english || match.title || 'Unknown title',
    japaneseTitle: match.title_japanese || '',
    titleSynonyms: match.title_synonyms || [],
    cover: remoteCover(match),
    synopsis: match.synopsis || '',
    type: match.type || 'TV',
    year: match.year || match.aired?.from?.slice?.(0, 4) || '',
    episodeCount: match.episodes || 0,
    episodes: match.episodes || 0,
    communityScore: match.score || '',
    malScore: match.score || '',
    members: match.members || 0,
    popularity: match.popularity || '',
    rank: match.rank || '',
    studio: match.studios?.length ? match.studios.map((studio) => studio.name).join(' / ') : '',
    genres: [...new Set(genres)].slice(0, 10),
    metadataReady: true,
    canonicalTitleVersion: 1,
    canonicalTitleUpdatedAt: new Date().toISOString(),
    catalogSource: 'Jikan Top Anime',
    metadataUpdatedAt: new Date().toISOString()
  };
}

function identityKeys(item = {}) {
  const keys = new Set();
  const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

  [
    item.title,
    item.officialTitle,
    item.englishTitle,
    item.japaneseTitle,
    ...(item.titleSynonyms || []),
    ...(item.synonyms || [])
  ].filter(Boolean).map(normalize).filter(Boolean).forEach((key) => keys.add(`title:${key}`));

  const malId = item.malId || item.mal_id;
  if (malId) keys.add(`mal:${String(malId)}`);

  return keys;
}

function makeIdentitySet(items = []) {
  const keys = new Set();
  items.forEach((item) => identityKeys(item).forEach((key) => keys.add(key)));
  return keys;
}

export async function fetchMoreCatalogTitles({
  library = [],
  catalog = [],
  page = 1,
  limit = 25,
  signal
} = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safeLimit = Math.max(1, Math.min(25, Number(limit || 25)));

  let response;

  try {
    response = await fetch(`${JIKAN_TOP_ANIME_URL}?page=${safePage}&limit=${safeLimit}`, {
      signal,
      headers: { Accept: 'application/json' }
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new Error('Jikan could not be reached. Try again in a minute.');
  }

  if (!response.ok) {
    if ([429, 500, 502, 503, 504].includes(response.status)) {
      throw new Error(`Jikan is temporarily unavailable (${response.status}). Try again shortly.`);
    }
    throw new Error(`Catalog fetch failed (${response.status}).`);
  }

  const payload = await response.json();
  const remoteTitles = Array.isArray(payload?.data) ? payload.data : [];
  const blockedKeys = makeIdentitySet([...library, ...catalog]);
  const added = [];

  for (const remote of remoteTitles) {
    const normalized = normalizeTopAnime(remote);
    const keys = identityKeys(normalized);
    if ([...keys].some((key) => blockedKeys.has(key))) continue;

    keys.forEach((key) => blockedKeys.add(key));
    added.push(normalized);
  }

  return {
    added,
    page: safePage,
    nextPage: payload?.pagination?.has_next_page === false ? 1 : safePage + 1,
    received: remoteTitles.length,
    catalog: mergeCatalogEntries({
      library,
      catalog: [...catalog, ...added],
      seed: []
    })
  };
}
