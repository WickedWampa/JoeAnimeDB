import { normalizeKitsuAnime } from './kitsuProvider';

const KITSU_API_BASE = 'https://kitsu.io/api/edge';
const BATCH_SIZE = 20;
const REQUEST_TIMEOUT_MS = 12000;

function numericId(value) {
  const normalized = String(value || '').trim();
  return /^\d+$/.test(normalized) ? normalized : '';
}

function chunk(items = [], size = BATCH_SIZE) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

async function fetchMappingBatch(malIds, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = `${KITSU_API_BASE}/mappings?filter[externalSite]=myanimelist/anime` +
      `&filter[externalId]=${encodeURIComponent(malIds.join(','))}` +
      `&include=item&page[limit]=${BATCH_SIZE}`;
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/vnd.api+json' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Kitsu MAL mapping returned HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Resolves MAL anime IDs through Kitsu's provider-owned mapping relationship.
 * This is exact identity data, so it is safer and faster than title search.
 */
export async function fetchKitsuAnimeByMalIds(malIds = [], fetchImpl = fetch) {
  const uniqueIds = [...new Set(malIds.map(numericId).filter(Boolean))];
  const results = new Map();
  const batches = chunk(uniqueIds);
  const responses = await Promise.allSettled(
    batches.map((batch) => fetchMappingBatch(batch, fetchImpl))
  );

  for (const response of responses) {
    if (response.status !== 'fulfilled') continue;
    const payload = response.value || {};
    const animeById = new Map(
      (Array.isArray(payload.included) ? payload.included : [])
        .filter((resource) => resource?.type === 'anime')
        .map((resource) => [String(resource.id), resource])
    );

    for (const mapping of Array.isArray(payload.data) ? payload.data : []) {
      const malId = numericId(mapping?.attributes?.externalId);
      const externalSite = String(mapping?.attributes?.externalSite || '').toLowerCase();
      const item = mapping?.relationships?.item?.data;
      const animeResource = item?.type === 'anime' ? animeById.get(String(item.id)) : null;
      if (!malId || externalSite !== 'myanimelist/anime' || !animeResource) continue;

      results.set(malId, {
        ...normalizeKitsuAnime(animeResource, { malId: Number(malId) }),
        malId: Number(malId),
        identityNeedsReview: false,
        metadataNeedsReview: false,
        identityResolutionStatus: 'verified',
        identityLinkageSource: 'kitsu-official-mal-mapping',
        identityLinkageUpdatedAt: new Date().toISOString()
      });
    }
  }

  return results;
}
