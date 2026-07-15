import catalogSeed from '../data/animeCatalogSeed.json';
import { fetchMetadata, needsArtworkRepair, sleep } from './metadata';
import { fetchKitsuCatalogPage, fetchKitsuLiveDiscoverFeeds } from './kitsuProvider';

const JIKAN_TOP_ANIME_URL = 'https://api.jikan.moe/v4/top/anime';
const JIKAN_CURRENT_SEASON_URL = 'https://api.jikan.moe/v4/seasons/now';
const JIKAN_UPCOMING_SEASON_URL = 'https://api.jikan.moe/v4/seasons/upcoming';

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
  let providerResult;

  try {
    const response = await fetch(`${JIKAN_TOP_ANIME_URL}?page=${safePage}&limit=${safeLimit}`, {
      signal,
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      if ([429, 500, 502, 503, 504].includes(response.status)) {
        throw new Error(`Jikan is temporarily unavailable (${response.status}).`);
      }
      throw new Error(`Catalog fetch failed (${response.status}).`);
    }

    const payload = await response.json();
    const remoteTitles = Array.isArray(payload?.data) ? payload.data : [];
    providerResult = {
      rows: remoteTitles.map(normalizeTopAnime),
      page: safePage,
      nextPage: payload?.pagination?.has_next_page === false ? 1 : safePage + 1,
      received: remoteTitles.length,
      source: 'jikan'
    };
  } catch (jikanError) {
    if (jikanError?.name === 'AbortError') throw jikanError;
    console.warn('Jikan catalog page failed; trying Kitsu fallback.', jikanError);

    try {
      providerResult = await fetchKitsuCatalogPage({ page: safePage, limit: safeLimit });
    } catch (kitsuError) {
      console.warn('Kitsu catalog fallback failed.', kitsuError);
      throw new Error('Neither Jikan nor Kitsu could fetch more Discover titles right now.');
    }
  }

  const blockedKeys = makeIdentitySet([...library, ...catalog]);
  const added = [];

  for (const normalized of providerResult.rows || []) {
    const keys = identityKeys(normalized);
    if ([...keys].some((key) => blockedKeys.has(key))) continue;
    keys.forEach((key) => blockedKeys.add(key));
    added.push(normalized);
  }

  return {
    added,
    page: providerResult.page || safePage,
    nextPage: providerResult.nextPage || safePage + 1,
    received: providerResult.received || 0,
    provider: providerResult.source || 'unknown',
    catalog: mergeCatalogEntries({
      library,
      catalog: [...catalog, ...added],
      seed: []
    })
  };
}

function normalizeSeasonAnime(match = {}, bucket = 'current') {
  const normalized = normalizeTopAnime(match);
  const airedFrom = match.aired?.from || '';
  const airedTo = match.aired?.to || '';
  const broadcastDay = match.broadcast?.day || '';
  const broadcastTime = match.broadcast?.time || '';

  return {
    ...normalized,
    id: `catalog-mal-${match.mal_id}`,
    status: match.status || '',
    season: match.season || '',
    year: match.year || normalized.year || '',
    airedFrom,
    airedTo,
    broadcastDay,
    broadcastTime,
    trailerUrl: match.trailer?.url || '',
    discoverBucket: bucket,
    discoverSource: bucket === 'current' ? 'Jikan Current Season' : 'Jikan Upcoming Season',
    discoverSyncedAt: new Date().toISOString(),
    catalogSource: bucket === 'current' ? 'Jikan Current Season' : 'Jikan Upcoming Season'
  };
}

function retryDelay(attempt, response) {
  const retryAfter = Number(response?.headers?.get?.('retry-after') || 0);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(15000, retryAfter * 1000);
  }

  return Math.min(12000, 1200 * (2 ** attempt)) + Math.round(Math.random() * 350);
}

async function fetchJikanPage(url, {
  signal,
  retries = 3,
  timeoutMs = 18000,
  label = 'Jikan feed'
} = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);

    const abortFromParent = () => timeoutController.abort();
    signal?.addEventListener?.('abort', abortFromParent, { once: true });

    let response;

    try {
      response = await fetch(url, {
        signal: timeoutController.signal,
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      if (response.ok) {
        const payload = await response.json();
        return Array.isArray(payload?.data) ? payload.data : [];
      }

      const retryable = [429, 500, 502, 503, 504].includes(response.status);
      lastError = new Error(`${label} returned ${response.status}.`);

      if (!retryable || attempt >= retries) break;
    } catch (error) {
      if (signal?.aborted) throw error;

      lastError = error?.name === 'AbortError'
        ? new Error(`${label} timed out.`)
        : new Error(`${label} could not be reached.`);

      if (attempt >= retries) break;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener?.('abort', abortFromParent);
    }

    await sleep(retryDelay(attempt, response));
  }

  throw lastError || new Error(`${label} is temporarily unavailable.`);
}

async function fetchJikanFeedWithFallback({
  primaryUrl,
  fallbackUrl,
  signal,
  label
}) {
  try {
    return {
      rows: await fetchJikanPage(primaryUrl, { signal, label }),
      source: 'season'
    };
  } catch (primaryError) {
    console.warn(`${label} primary endpoint failed; trying fallback.`, primaryError);

    try {
      return {
        rows: await fetchJikanPage(fallbackUrl, {
          signal,
          label: `${label} fallback`,
          retries: 2
        }),
        source: 'top'
      };
    } catch (fallbackError) {
      console.warn(`${label} fallback endpoint failed.`, fallbackError);
      return {
        rows: [],
        source: 'cache',
        error: fallbackError?.message || primaryError?.message || `${label} failed.`
      };
    }
  }
}

export async function fetchLiveDiscoverCatalog({
  library = [],
  catalog = [],
  limitPerFeed = 25,
  signal
} = {}) {
  const safeLimit = Math.max(1, Math.min(25, Number(limitPerFeed || 25)));
  const cachedCurrent = (catalog || []).filter((item) => item?.discoverBucket === 'current');
  const cachedUpcoming = (catalog || []).filter((item) => item?.discoverBucket === 'upcoming');

  const currentResult = await fetchJikanFeedWithFallback({
    primaryUrl: `${JIKAN_CURRENT_SEASON_URL}?limit=${safeLimit}&sfw=true`,
    fallbackUrl: `${JIKAN_TOP_ANIME_URL}?filter=airing&limit=${safeLimit}&sfw=true`,
    signal,
    label: 'Current-season feed'
  });

  await sleep(1400);

  const upcomingResult = await fetchJikanFeedWithFallback({
    primaryUrl: `${JIKAN_UPCOMING_SEASON_URL}?limit=${safeLimit}&sfw=true`,
    fallbackUrl: `${JIKAN_TOP_ANIME_URL}?filter=upcoming&limit=${safeLimit}&sfw=true`,
    signal,
    label: 'Upcoming-season feed'
  });

  let currentRows = currentResult.rows.map((item) => normalizeSeasonAnime(item, 'current'));
  let upcomingRows = upcomingResult.rows.map((item) => normalizeSeasonAnime(item, 'upcoming'));
  const warnings = [currentResult.error, upcomingResult.error].filter(Boolean);
  const sources = {
    current: currentRows.length ? `jikan-${currentResult.source}` : 'none',
    upcoming: upcomingRows.length ? `jikan-${upcomingResult.source}` : 'none'
  };

  if (!currentRows.length || !upcomingRows.length) {
    try {
      const kitsu = await fetchKitsuLiveDiscoverFeeds({ limit: Math.min(safeLimit, 20) });
      if (!currentRows.length && kitsu.current.length) {
        currentRows = kitsu.current;
        sources.current = 'kitsu';
      }
      if (!upcomingRows.length && kitsu.upcoming.length) {
        upcomingRows = kitsu.upcoming;
        sources.upcoming = 'kitsu';
      }
    } catch (kitsuError) {
      warnings.push(`Kitsu fallback failed: ${kitsuError?.message || kitsuError}`);
    }
  }

  const usedCachedCurrent = !currentRows.length && cachedCurrent.length > 0;
  const usedCachedUpcoming = !upcomingRows.length && cachedUpcoming.length > 0;
  if (usedCachedCurrent) sources.current = 'cache';
  if (usedCachedUpcoming) sources.upcoming = 'cache';

  const incoming = [...currentRows, ...upcomingRows];

  if (!incoming.length && !usedCachedCurrent && !usedCachedUpcoming) {
    throw new Error('Jikan and Kitsu are both unavailable, and no cached live Discover titles exist yet.');
  }

  const existingByProviderId = new Map();
  (catalog || []).forEach((item) => {
    if (item?.malId || item?.mal_id) existingByProviderId.set(`mal:${item.malId || item.mal_id}`, item);
    if (item?.kitsuId) existingByProviderId.set(`kitsu:${item.kitsuId}`, item);
  });

  const mergedIncoming = incoming.map((item) => {
    const key = item.malId ? `mal:${item.malId}` : item.kitsuId ? `kitsu:${item.kitsuId}` : '';
    const current = key ? existingByProviderId.get(key) : null;
    return current ? { ...current, ...item, id: current.id || item.id } : item;
  });

  // mergeCatalogEntries intentionally keeps the richest metadata record. A live
  // Jikan/Kitsu row can be less complete than an existing catalog record, though,
  // which previously caused discoverBucket/source fields to be discarded. The
  // status message still reported 20 fetched titles, but Discover could not find
  // any rows tagged as current/upcoming. Re-apply the live feed fields after the
  // metadata merge so the richer record is retained and the live classification
  // remains available to the UI.
  const liveFieldsByTitle = new Map(
    mergedIncoming.map((item) => [titleKey(item.title), item])
  );

  const nextCatalog = incoming.length
    ? mergeCatalogEntries({ library, catalog: [...catalog, ...mergedIncoming], seed: [] })
        .map((item) => {
          const live = liveFieldsByTitle.get(titleKey(item.title));
          if (!live) return item;

          return {
            ...item,
            discoverBucket: live.discoverBucket,
            discoverSource: live.discoverSource,
            discoverSyncedAt: live.discoverSyncedAt,
            catalogSource: live.catalogSource || item.catalogSource,
            status: live.status || item.status,
            season: live.season || item.season,
            airedFrom: live.airedFrom || item.airedFrom,
            airedTo: live.airedTo || item.airedTo,
            broadcastDay: live.broadcastDay || item.broadcastDay,
            broadcastTime: live.broadcastTime || item.broadcastTime,
            trailerUrl: live.trailerUrl || item.trailerUrl,
            kitsuId: live.kitsuId || item.kitsuId,
            malId: live.malId || item.malId
          };
        })
    : catalog;

  return {
    catalog: nextCatalog,
    currentCount: currentRows.length || cachedCurrent.length,
    upcomingCount: upcomingRows.length || cachedUpcoming.length,
    received: incoming.length,
    syncedAt: new Date().toISOString(),
    warnings,
    partial: warnings.length > 0 || Object.values(sources).includes('cache'),
    usedCache: usedCachedCurrent || usedCachedUpcoming,
    sources
  };
}

