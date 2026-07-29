import catalogSeed from '../data/animeCatalogSeed.json';
import { fetchMetadata, needsArtworkRepair, sleep } from './metadata';
import { fetchKitsuCatalogPage, fetchKitsuLiveDiscoverFeeds } from './kitsuProvider';

export function titleKey(title = '') {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function hasUsefulMetadata(item) {
  return Boolean(
    item?.cover &&
    (item?.synopsis || item?.description) &&
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

function persistentCatalogFields(current = {}, incoming = {}) {
  const currentUpdated = new Date(current.listUpdatedAt || 0).getTime() || 0;
  const incomingUpdated = new Date(incoming.listUpdatedAt || 0).getTime() || 0;
  return incomingUpdated >= currentUpdated && incoming.listUpdatedAt
    ? incoming
    : current;
}

function mergeCatalogPair(current = {}, incoming = {}) {
  const metadataFirst = richness(incoming) >= richness(current)
    ? { ...current, ...incoming }
    : { ...incoming, ...current };
  const persistent = persistentCatalogFields(current, incoming);

  return {
    ...metadataFirst,
    id: current.id || incoming.id,
    kitsuId: incoming.kitsuId || current.kitsuId || '',
    malId: incoming.malId || incoming.mal_id || current.malId || current.mal_id || null,
    followed: Boolean(persistent.followed),
    ignored: Boolean(persistent.ignored),
    followedAt: persistent.followedAt || '',
    listUpdatedAt: persistent.listUpdatedAt || '',
    followingSnapshot: persistent.followingSnapshot || current.followingSnapshot || incoming.followingSnapshot,
    followingLastCheckedAt:
      persistent.followingLastCheckedAt ||
      current.followingLastCheckedAt ||
      incoming.followingLastCheckedAt ||
      '',
    followingCheckError:
      persistent.followingCheckError ??
      current.followingCheckError ??
      incoming.followingCheckError ??
      '',
    followingEvents:
      persistent.followingEvents ||
      current.followingEvents ||
      incoming.followingEvents ||
      []
  };
}

export function mergeCatalogEntries({ library = [], catalog = [], seed = catalogSeed } = {}) {
  const merged = [];

  for (const item of [...seed, ...catalog]) {
    const keys = identityKeys(item);
    if (!keys.size || library.some((entry) => sameCatalogIdentity(entry, item))) continue;

    const duplicateIndex = merged.findIndex((candidate) =>
      sameCatalogIdentity(candidate, item)
    );

    if (duplicateIndex < 0) {
      const key = titleKey(item.title);
      merged.push({
        id: item.id || `catalog-${key}`,
        ...item
      });
      continue;
    }

    merged[duplicateIndex] = mergeCatalogPair(merged[duplicateIndex], item);
  }

  return merged;
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

      nextCatalog = nextCatalog.map((candidate) =>
        sameCatalogIdentity(candidate, item)
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


export function identityKeys(item = {}) {
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
  const kitsuId = item.kitsuId || item.kitsu_id;
  if (kitsuId) keys.add(`kitsu:${String(kitsuId)}`);

  const embeddedKitsuId = String(item.id || '').match(
    /(?:anime-kitsu|catalog-kitsu|kitsu)[-_]?(\d+)$/i
  );
  if (embeddedKitsuId) keys.add(`kitsu:${embeddedKitsuId[1]}`);

  return keys;
}

export function sameCatalogIdentity(left = {}, right = {}) {
  const leftKitsu = left.kitsuId || left.kitsu_id;
  const rightKitsu = right.kitsuId || right.kitsu_id;
  if (leftKitsu && rightKitsu) return String(leftKitsu) === String(rightKitsu);

  const leftMal = left.malId || left.mal_id;
  const rightMal = right.malId || right.mal_id;
  if (leftMal && rightMal) return String(leftMal) === String(rightMal);

  const leftKeys = identityKeys(left);
  return [...identityKeys(right)].some((key) =>
    key.startsWith('title:') && leftKeys.has(key)
  );
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
  if (signal?.aborted) throw new DOMException('Catalog request aborted.', 'AbortError');

  let providerResult;
  try {
    providerResult = await fetchKitsuCatalogPage({ page: safePage, limit: safeLimit });
  } catch (kitsuError) {
    console.warn('Kitsu catalog page failed.', kitsuError);
    throw new Error('Kitsu could not fetch more Discover titles right now.');
  }

  const blocked = [...library, ...catalog];
  const added = [];

  for (const normalized of providerResult.rows || []) {
    if (blocked.some((item) => sameCatalogIdentity(item, normalized))) continue;
    blocked.push(normalized);
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

export async function fetchLiveDiscoverCatalog({
  library = [],
  catalog = [],
  limitPerFeed = 25,
  signal
} = {}) {
  const safeLimit = Math.max(1, Math.min(100, Number(limitPerFeed || 60)));
  const cachedCurrent = (catalog || []).filter((item) => item?.discoverBucket === 'current');
  const cachedUpcoming = (catalog || []).filter((item) => item?.discoverBucket === 'upcoming');

  if (signal?.aborted) throw new DOMException('Live Discover request aborted.', 'AbortError');

  let currentRows = [];
  let upcomingRows = [];
  const warnings = [];
  const sources = {
    current: 'none',
    upcoming: 'none'
  };

  try {
    const kitsu = await fetchKitsuLiveDiscoverFeeds({
      currentLimit: Math.min(safeLimit, 40),
      upcomingLimit: safeLimit
    });
    currentRows = kitsu.current || [];
    upcomingRows = kitsu.upcoming || [];
    warnings.push(...(kitsu.warnings || []));
    if (currentRows.length) sources.current = 'kitsu';
    if (upcomingRows.length) sources.upcoming = 'kitsu';
  } catch (kitsuError) {
    if (signal?.aborted) throw new DOMException('Live Discover request aborted.', 'AbortError');
    warnings.push(`Kitsu feed failed: ${kitsuError?.message || kitsuError}`);
    console.warn('Kitsu live Discover feed failed; using cached rows when available.', kitsuError);
  }

  if (!currentRows.length && !cachedCurrent.length) {
    warnings.push('Kitsu returned no current-season titles.');
  }
  if (!upcomingRows.length && !cachedUpcoming.length) {
    warnings.push('Kitsu returned no upcoming titles.');
  }

  const usedCachedCurrent = !currentRows.length && cachedCurrent.length > 0;
  const usedCachedUpcoming = !upcomingRows.length && cachedUpcoming.length > 0;
  if (usedCachedCurrent) sources.current = 'cache';
  if (usedCachedUpcoming) sources.upcoming = 'cache';

  const incoming = [...currentRows, ...upcomingRows];

  if (!incoming.length && !usedCachedCurrent && !usedCachedUpcoming) {
    throw new Error('Kitsu is unavailable, and no cached live Discover titles exist yet.');
  }

  const existingByProviderId = new Map();
  (catalog || []).forEach((item) => {
    if (item?.malId || item?.mal_id) existingByProviderId.set(`mal:${item.malId || item.mal_id}`, item);
    if (item?.kitsuId) existingByProviderId.set(`kitsu:${item.kitsuId}`, item);
  });

  const mergedIncoming = incoming.map((item) => {
    const key = item.kitsuId
      ? `kitsu:${item.kitsuId}`
      : item.malId
        ? `mal:${item.malId}`
        : '';
    const current = key ? existingByProviderId.get(key) : null;
    return current ? { ...current, ...item, id: current.id || item.id } : item;
  });

  // mergeCatalogEntries intentionally keeps the richest metadata record. A live
  // Kitsu row can be less complete than an existing catalog record, though,
  // which previously caused discoverBucket/source fields to be discarded. The
  // status message still reported 20 fetched titles, but Discover could not find
  // any rows tagged as current/upcoming. Re-apply the live feed fields after the
  // metadata merge so the richer record is retained and the live classification
  // remains available to the UI.
  const nextCatalog = incoming.length
    ? mergeCatalogEntries({ library, catalog: [...catalog, ...mergedIncoming], seed: [] })
        .map((item) => {
          const live = mergedIncoming.find((candidate) =>
            sameCatalogIdentity(candidate, item)
          );
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

  const allLive = sources.current === 'kitsu' && sources.upcoming === 'kitsu';
  const allCached = sources.current === 'cache' && sources.upcoming === 'cache';
  const state = allLive ? 'live' : allCached ? 'offline' : 'partial';

  return {
    catalog: nextCatalog,
    currentCount: currentRows.length || cachedCurrent.length,
    upcomingCount: upcomingRows.length || cachedUpcoming.length,
    received: incoming.length,
    syncedAt: new Date().toISOString(),
    warnings,
    partial: warnings.length > 0 || Object.values(sources).includes('cache'),
    usedCache: usedCachedCurrent || usedCachedUpcoming,
    offline: state === 'offline',
    state,
    sources
  };
}
