import { buildWatchmodeCatalogIndexCandidates } from './watchmodeCatalogIndexer';
import {
  fetchWhereToWatch,
  getCachedWhereToWatch,
  getSavedWatchRegion,
  getWatchmodeProviderCacheSnapshot
} from './watchmodeService';

export const WATCHMODE_SHARED_CACHE_DISCOVERY_KEY = 'joeanime-watchmode-shared-cache-discovery-v1';
export const WATCHMODE_SHARED_CACHE_DISCOVERY_VERSION = 1;

const RUN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_SESSION_LIMIT = 12;
const DEFAULT_BATCH_SIZE = 2;
const DEFAULT_BATCH_DELAY_MS = 250;

let activeDiscoveryPromise = null;

function readState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WATCHMODE_SHARED_CACHE_DISCOVERY_KEY) || '{}');
    if (parsed?.version === WATCHMODE_SHARED_CACHE_DISCOVERY_VERSION && parsed.scopes) return parsed;
  } catch {}
  return { version: WATCHMODE_SHARED_CACHE_DISCOVERY_VERSION, scopes: {} };
}

function writeState(state) {
  try {
    localStorage.setItem(WATCHMODE_SHARED_CACHE_DISCOVERY_KEY, JSON.stringify(state));
  } catch {}
}

function wait(duration, signal) {
  if (!duration || signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = globalThis.setTimeout(done, duration);
    function done() {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener?.('abort', done);
      resolve();
    }
    signal?.addEventListener?.('abort', done, { once: true });
  });
}

function publish(summary) {
  globalThis.__JOEANIME_WATCHMODE_SHARED_CACHE_DISCOVERY__ = summary;
}

export function getWatchmodeSharedCacheDiscoverySnapshot() {
  return readState();
}

async function executeDiscovery({
  library = [],
  catalog = [],
  enabled = true,
  region = getSavedWatchRegion(),
  sessionLimit = DEFAULT_SESSION_LIMIT,
  batchSize = DEFAULT_BATCH_SIZE,
  batchDelayMs = DEFAULT_BATCH_DELAY_MS,
  minimumIntervalMs = RUN_INTERVAL_MS,
  fetcher = fetchWhereToWatch,
  signal
} = {}) {
  const normalizedRegion = String(region || 'US').toUpperCase();
  const candidates = buildWatchmodeCatalogIndexCandidates(library, catalog);
  const state = readState();
  const scope = state.scopes[normalizedRegion] || {};
  const now = Date.now();
  const lastRunAt = Number(scope.lastRunAt || 0);
  const summary = {
    status: 'idle',
    mode: 'cache-only',
    region: normalizedRegion,
    candidateCount: candidates.length,
    scanned: 0,
    attempted: 0,
    localCacheSkipped: 0,
    sharedHits: 0,
    cacheMisses: 0,
    terminal: 0,
    failed: 0,
    cursor: candidates.length ? Number(scope.cursor || 0) % candidates.length : 0
  };

  if (!enabled || !candidates.length || signal?.aborted) {
    const result = { ...summary, status: signal?.aborted ? 'cancelled' : 'disabled' };
    publish(result);
    return result;
  }

  if (lastRunAt && now - lastRunAt < Math.max(0, Number(minimumIntervalMs) || 0)) {
    const result = { ...summary, status: 'recently-checked', lastRunAt };
    publish(result);
    return result;
  }

  const cacheSnapshot = getWatchmodeProviderCacheSnapshot();
  const start = summary.cursor;
  const queue = [];
  const limit = Math.max(1, Math.min(Number(sessionLimit) || DEFAULT_SESSION_LIMIT, candidates.length));

  for (let offset = 0; offset < candidates.length && queue.length < limit; offset += 1) {
    const item = candidates[(start + offset) % candidates.length];
    summary.scanned += 1;
    if (getCachedWhereToWatch(item, {
      region: normalizedRegion,
      allowStale: true,
      cacheSnapshot
    })) {
      summary.localCacheSkipped += 1;
      continue;
    }
    queue.push(item);
  }

  summary.status = 'running';
  publish({ ...summary });
  const size = Math.max(1, Number(batchSize) || DEFAULT_BATCH_SIZE);

  for (let offset = 0; offset < queue.length && !signal?.aborted; offset += size) {
    const batch = queue.slice(offset, offset + size);
    const results = await Promise.all(batch.map(async (item) => {
      try {
        const payload = await fetcher(item, {
          region: normalizedRegion,
          requestMode: 'cache-only'
        });
        return { payload, status: String(payload?.status || 'cache_miss') };
      } catch (error) {
        return { error, status: 'failed' };
      }
    }));

    for (const result of results) {
      summary.attempted += 1;
      if (result.status === 'ready' && result.payload?.cacheBackend === 'KV') {
        summary.sharedHits += 1;
      } else if (result.status === 'cache_miss') {
        summary.cacheMisses += 1;
      } else if (result.status === 'needs_review' || result.status === 'not_found') {
        summary.terminal += 1;
      } else {
        summary.failed += 1;
      }
    }

    if (offset + batch.length < queue.length) {
      await wait(batchDelayMs, signal);
    }
  }

  const nextCursor = candidates.length
    ? (start + Math.max(1, summary.scanned)) % candidates.length
    : 0;
  const completedAt = Date.now();
  const result = {
    ...summary,
    status: signal?.aborted ? 'cancelled' : 'complete',
    cursor: nextCursor,
    completedAt
  };
  state.scopes[normalizedRegion] = {
    cursor: nextCursor,
    lastRunAt: completedAt,
    lastSummary: result
  };
  writeState(state);
  publish(result);
  return result;
}

export function runWatchmodeSharedCacheDiscovery(options = {}) {
  if (activeDiscoveryPromise) return activeDiscoveryPromise;
  activeDiscoveryPromise = executeDiscovery(options).finally(() => {
    activeDiscoveryPromise = null;
  });
  return activeDiscoveryPromise;
}
