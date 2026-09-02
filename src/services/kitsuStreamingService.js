const KITSU_API_BASE = 'https://kitsu.io/api/edge';
const KITSU_STREAMING_CACHE_KEY = 'joeanime-kitsu-streaming-links-v1';
const KITSU_STREAMING_CACHE_VERSION = 1;
const KITSU_STREAMING_READY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const KITSU_STREAMING_STALE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const KITSU_STREAMING_EMPTY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const KITSU_STREAMING_BATCH_SIZE = 20;
const KITSU_STREAMING_TIMEOUT_MS = 9000;

function kitsuIdOf(item = {}) {
  const direct = String(item.kitsuId || item.kitsu_id || item.kitsu?.id || '').trim();
  if (/^\d+$/.test(direct)) return direct;

  const embedded = String(item.id || '').match(/(?:anime-kitsu|catalog-kitsu|kitsu)[-_]?(\d+)$/i);
  return embedded?.[1] || '';
}

function readCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KITSU_STREAMING_CACHE_KEY) || '{}');
    if (Number(parsed?.version) !== KITSU_STREAMING_CACHE_VERSION) {
      return { version: KITSU_STREAMING_CACHE_VERSION, entries: {} };
    }
    return {
      version: KITSU_STREAMING_CACHE_VERSION,
      entries: parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {}
    };
  } catch {
    return { version: KITSU_STREAMING_CACHE_VERSION, entries: {} };
  }
}

function writeCache(cache) {
  try {
    localStorage.setItem(KITSU_STREAMING_CACHE_KEY, JSON.stringify(cache));
  } catch {}

  try {
    window.dispatchEvent(new CustomEvent('joeanime:kitsu-streaming-cache-changed'));
  } catch {}
}

function providerNameFromUrl(value = '') {
  let hostname = '';
  try {
    hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }

  const mappings = [
    ['crunchyroll', 'Crunchyroll'],
    ['netflix', 'Netflix'],
    ['hidive', 'HIDIVE'],
    ['hulu', 'Hulu'],
    ['primevideo', 'Prime Video'],
    ['amazon', 'Prime Video'],
    ['disneyplus', 'Disney+'],
    ['disney', 'Disney+'],
    ['funimation', 'Funimation'],
    ['tubitv', 'Tubi'],
    ['retrocrush', 'RetroCrush'],
    ['pluto', 'Pluto TV'],
    ['youtube', 'YouTube'],
    ['youtu.be', 'YouTube'],
    ['vrv', 'VRV'],
    ['wakanim', 'Wakanim'],
    ['animelab', 'AnimeLab'],
    ['adultswim', 'Adult Swim'],
    ['viz', 'VIZ']
  ];
  const matched = mappings.find(([needle]) => hostname.includes(needle));
  return matched?.[1] || hostname;
}

function normalizeStreamingLink(resource = {}) {
  const attributes = resource.attributes || resource;
  const url = String(attributes.url || '').trim();
  const name = providerNameFromUrl(url);
  if (!name || !/^https:\/\//i.test(url)) return null;

  return {
    name,
    url,
    format: '',
    source: 'kitsu',
    regional: false,
    subs: Array.isArray(attributes.subs) ? attributes.subs : [],
    dubs: Array.isArray(attributes.dubs) ? attributes.dubs : []
  };
}

function dedupeProviders(providers = []) {
  const seen = new Set();
  return providers.filter((provider) => {
    const key = String(provider?.name || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getKitsuStreamingCacheSnapshot() {
  return readCache();
}

export function getCachedKitsuStreamingLinks(item, {
  allowStale = false,
  cacheSnapshot
} = {}) {
  const kitsuId = kitsuIdOf(item);
  if (!kitsuId) return null;

  const cache = cacheSnapshot?.entries ? cacheSnapshot : readCache();
  const entry = cache.entries?.[kitsuId];
  if (!entry?.payload) return null;

  const providers = Array.isArray(entry.payload.providers) ? entry.payload.providers : [];
  const age = Date.now() - Number(entry.savedAt || 0);
  const ttl = providers.length ? KITSU_STREAMING_READY_TTL_MS : KITSU_STREAMING_EMPTY_TTL_MS;
  const maxTtl = providers.length ? KITSU_STREAMING_STALE_TTL_MS : KITSU_STREAMING_EMPTY_TTL_MS;
  if (age > maxTtl || (!allowStale && age > ttl)) return null;

  return {
    ...entry.payload,
    stale: age > ttl,
    source: 'kitsu',
    regional: false
  };
}

async function fetchBatch(ids, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = globalThis.setTimeout(abort, KITSU_STREAMING_TIMEOUT_MS);
  signal?.addEventListener?.('abort', abort, { once: true });

  try {
    const query = new URLSearchParams({
      'filter[id]': ids.join(','),
      include: 'streamingLinks',
      'page[limit]': String(KITSU_STREAMING_BATCH_SIZE)
    });
    const response = await fetch(`${KITSU_API_BASE}/anime?${query.toString()}`, {
      headers: { Accept: 'application/vnd.api+json' },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(
        response.status === 429
          ? 'Kitsu is rate-limiting streaming-link refreshes. Saved links remain available.'
          : `Kitsu streaming links returned HTTP ${response.status}.`
      );
    }
    try {
      const payload = await response.json();
      if (!payload || typeof payload !== 'object') throw new Error('empty');
      return payload;
    } catch {
      throw new Error('Kitsu returned invalid streaming-link data. Saved links remain available.');
    }
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener?.('abort', abort);
  }
}

export async function primeKitsuStreamingLinks(items = [], {
  force = false,
  signal,
  batchSize = KITSU_STREAMING_BATCH_SIZE
} = {}) {
  const unique = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const kitsuId = kitsuIdOf(item);
    if (kitsuId && !unique.has(kitsuId)) unique.set(kitsuId, item);
  }

  const cache = readCache();
  const pendingIds = [...unique.keys()].filter((kitsuId) => (
    force || !getCachedKitsuStreamingLinks({ kitsuId }, { cacheSnapshot: cache })
  ));
  if (!pendingIds.length) {
    return { requested: 0, cached: unique.size, ready: 0, empty: 0, errors: [] };
  }

  const safeBatchSize = Math.min(Math.max(Number(batchSize) || KITSU_STREAMING_BATCH_SIZE, 1), KITSU_STREAMING_BATCH_SIZE);
  let ready = 0;
  let empty = 0;
  let changed = false;
  const updatedEntries = {};
  const errors = [];

  for (let offset = 0; offset < pendingIds.length; offset += safeBatchSize) {
    if (signal?.aborted) break;
    const ids = pendingIds.slice(offset, offset + safeBatchSize);

    try {
      const payload = await fetchBatch(ids, signal);
      const included = Array.isArray(payload.included) ? payload.included : [];
      const linksById = new Map(
        included
          .filter((resource) => resource.type === 'streamingLinks')
          .map((resource) => [String(resource.id), resource])
      );
      const animeById = new Map(
        (Array.isArray(payload.data) ? payload.data : [])
          .map((resource) => [String(resource.id), resource])
      );

      for (const kitsuId of ids) {
        const anime = animeById.get(kitsuId);
        const relationshipIds = anime?.relationships?.streamingLinks?.data
          ?.map((relationship) => String(relationship.id)) || [];
        const providers = dedupeProviders(
          relationshipIds
            .map((id) => normalizeStreamingLink(linksById.get(id)))
            .filter(Boolean)
        );
        const status = providers.length ? 'ready' : 'not_found';
        const nextEntry = {
          savedAt: Date.now(),
          payload: {
            status,
            providers,
            source: 'kitsu',
            regional: false,
            kitsuId
          }
        };
        cache.entries[kitsuId] = nextEntry;
        updatedEntries[kitsuId] = nextEntry;
        if (providers.length) ready += 1;
        else empty += 1;
        changed = true;
      }
    } catch (error) {
      if (signal?.aborted) break;
      errors.push({ ids, message: String(error?.message || error) });
    }
  }

  if (changed) {
    const latest = readCache();
    writeCache({
      version: KITSU_STREAMING_CACHE_VERSION,
      entries: { ...latest.entries, ...updatedEntries }
    });
  }
  return {
    requested: pendingIds.length,
    cached: unique.size - pendingIds.length,
    ready,
    empty,
    errors
  };
}

export { KITSU_STREAMING_CACHE_KEY };
