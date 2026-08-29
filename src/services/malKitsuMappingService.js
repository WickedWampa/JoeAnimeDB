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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchMappingBatchWithRetry(malIds, fetchImpl, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchMappingBatch(malIds, fetchImpl);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await wait(300 * attempt);
    }
  }
  throw lastError;
}

/**
 * Resolves MAL anime IDs through Kitsu's provider-owned mapping relationship.
 * This is exact identity data, so it is safer and faster than title search.
 */
export async function fetchKitsuAnimeByMalIds(malIds = [], fetchImpl = fetch) {
  const uniqueIds = [...new Set(malIds.map(numericId).filter(Boolean))];
  const results = new Map();
  const batches = chunk(uniqueIds);
  const responses = [];
  // Kitsu can throttle a burst of parallel mapping requests. Sequential,
  // retried batches keep one transient failure from turning 20 valid imports
  // into false Needs Review entries.
  for (const batch of batches) {
    try {
      responses.push(await fetchMappingBatchWithRetry(batch, fetchImpl));
    } catch (error) {
      console.warn('Kitsu MAL mapping batch failed after retries:', batch, error);
    }
  }

  for (const payload of responses) {
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

export async function fetchKitsuAnimeByIds(kitsuIds = [], fetchImpl = fetch) {
  const uniqueIds = [...new Set(kitsuIds.map(numericId).filter(Boolean))];
  const results = new Map();

  for (const batch of chunk(uniqueIds)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const url = `${KITSU_API_BASE}/anime?filter[id]=${encodeURIComponent(batch.join(','))}&page[limit]=${BATCH_SIZE}`;
      const response = await fetchImpl(url, {
        headers: { Accept: 'application/vnd.api+json' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Kitsu anime batch returned HTTP ${response.status}`);
      const payload = await response.json();
      for (const resource of Array.isArray(payload.data) ? payload.data : []) {
        if (resource?.type !== 'anime') continue;
        results.set(String(resource.id), {
          ...normalizeKitsuAnime(resource),
          kitsuId: String(resource.id),
          identityNeedsReview: false,
          metadataNeedsReview: false,
          identityResolutionStatus: 'verified',
          identityLinkageSource: 'joeanime-export-kitsu-id'
        });
      }
    } catch (error) {
      console.warn('Kitsu anime ID batch failed:', batch, error);
    } finally {
      clearTimeout(timeout);
    }
  }

  return results;
}
