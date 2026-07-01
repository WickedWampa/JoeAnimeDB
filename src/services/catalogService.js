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

export function buildCatalogQueue({ library = [], catalog = [], seed = catalogSeed, limit = 50 } = {}) {
  const libraryKeys = new Set(library.map((item) => titleKey(item.title)).filter(Boolean));
  const seenKeys = new Set();
  const merged = [];

  for (const item of [...catalog, ...seed]) {
    const key = titleKey(item.title);
    if (!key || libraryKeys.has(key) || seenKeys.has(key)) continue;

    seenKeys.add(key);
    merged.push({
      id: item.id || `catalog-${key}`,
      ...item
    });
  }

  return merged
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
  const baseCatalog = [...catalog, ...catalogSeed];
  const queue = buildCatalogQueue({ library, catalog, seed: catalogSeed, limit });

  if (!queue.length) {
    const saved = await repository.importCatalog(baseCatalog);
    return {
      saved,
      updated: 0,
      total: baseCatalog.length
    };
  }

  let nextCatalog = [...baseCatalog];

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
    await sleep(1400);
  }

  const saved = await repository.importCatalog(nextCatalog);

  return {
    saved,
    updated: queue.length,
    total: nextCatalog.length
  };
}
