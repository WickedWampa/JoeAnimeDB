import catalogSeed from '../data/animeCatalogSeed.json';
import { fetchMetadata, needsArtworkRepair, sleep } from './metadata';

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
        titleKey(candidate.title) === key ? { ...candidate, ...enriched } : candidate
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
