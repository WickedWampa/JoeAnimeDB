import {
  fetchWhereToWatch,
  getCachedWhereToWatch,
  getSavedWatchRegion,
  getWatchmodeProviderCacheSnapshot
} from './watchmodeService';

export const WATCHMODE_CATALOG_INDEX_KEY = 'joeanime-watchmode-catalog-index-v1';
export const WATCHMODE_CATALOG_INDEX_VERSION = 1;

const SUCCESS_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
const FAILURE_RETRY_MS = 15 * 60 * 1000;
const DEFAULT_SESSION_LIMIT = 48;
const DEFAULT_BATCH_SIZE = 2;
const DEFAULT_BATCH_DELAY_MS = 900;
const MAX_SAVED_ATTEMPTS = 1600;
const SHARED_CACHE_RETRY_MS = 60 * 60 * 1000;

let activeIndexPromise = null;

function titleOf(item = {}) {
  return String(item.officialTitle || item.title || '').trim();
}

function normalizedTitle(item = {}) {
  return titleOf(item).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function identityKey(item = {}) {
  return [
    normalizedTitle(item),
    item.year || item.startYear || item.releaseYear || '',
    String(item.type || item.subtype || item.format || '').toLowerCase()
  ].join('|');
}

function numericScore(item = {}) {
  return Number(item.communityScore ?? item.malScore ?? item.score ?? 0) || 0;
}

function readIndexState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WATCHMODE_CATALOG_INDEX_KEY) || '{}');
    if (parsed?.version === WATCHMODE_CATALOG_INDEX_VERSION && parsed.scopes && typeof parsed.scopes === 'object') {
      return parsed;
    }
  } catch {}

  return {
    version: WATCHMODE_CATALOG_INDEX_VERSION,
    scopes: {}
  };
}

function compactAttempts(attempts = {}) {
  return Object.fromEntries(
    Object.entries(attempts)
      .sort((left, right) => Number(right[1]?.attemptedAt || 0) - Number(left[1]?.attemptedAt || 0))
      .slice(0, MAX_SAVED_ATTEMPTS)
  );
}

function writeIndexState(state) {
  try {
    localStorage.setItem(WATCHMODE_CATALOG_INDEX_KEY, JSON.stringify(state));
  } catch {}
}

function recentAttempt(entry, now) {
  const attemptedAt = Number(entry?.attemptedAt || 0);
  if (!attemptedAt) return false;
  const retryAfter = entry?.status === 'failed' ? FAILURE_RETRY_MS : SUCCESS_RETRY_MS;
  return now - attemptedAt < retryAfter;
}

function waitForNextBatch(duration, signal) {
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

function publishProgress(summary, onProgress) {
  globalThis.__JOEANIME_WATCHMODE_INDEX__ = summary;
  try {
    globalThis.window?.dispatchEvent?.(new CustomEvent('joeanime:watchmode-index-progress', {
      detail: summary
    }));
  } catch {}
  onProgress?.(summary);
}

export function getWatchmodeCatalogIndexSnapshot() {
  return readIndexState();
}

export function buildWatchmodeCatalogIndexCandidates(library = [], catalog = []) {
  const libraryKitsuIds = new Set();
  const libraryMalIds = new Set();
  const libraryTitles = new Set();

  for (const item of Array.isArray(library) ? library : []) {
    const kitsuId = String(item?.kitsuId || item?.kitsu_id || '').trim();
    const malId = String(item?.malId || item?.mal_id || '').trim();
    if (kitsuId) libraryKitsuIds.add(kitsuId);
    if (malId) libraryMalIds.add(malId);
    const title = normalizedTitle(item);
    if (title) libraryTitles.add(title);
  }

  const seen = new Set();
  const candidates = [];

  for (const item of Array.isArray(catalog) ? catalog : []) {
    const title = normalizedTitle(item);
    if (!title) continue;

    const kitsuId = String(item?.kitsuId || item?.kitsu_id || '').trim();
    const malId = String(item?.malId || item?.mal_id || '').trim();
    if ((kitsuId && libraryKitsuIds.has(kitsuId))
      || (malId && libraryMalIds.has(malId))
      || libraryTitles.has(title)) continue;

    const key = identityKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    candidates.push(item);
  }

  return candidates.sort((left, right) => {
    const rightIdentity = Number(Boolean(right.kitsuId || right.malId))
      + Number(Boolean(right.year || right.startYear || right.releaseYear))
      + Number(Boolean(right.type || right.subtype || right.format));
    const leftIdentity = Number(Boolean(left.kitsuId || left.malId))
      + Number(Boolean(left.year || left.startYear || left.releaseYear))
      + Number(Boolean(left.type || left.subtype || left.format));
    return rightIdentity - leftIdentity
      || numericScore(right) - numericScore(left)
      || titleOf(left).localeCompare(titleOf(right));
  });
}

async function executeCatalogIndex({
  library = [],
  catalog = [],
  enabled = true,
  region = getSavedWatchRegion(),
  sessionLimit = DEFAULT_SESSION_LIMIT,
  batchSize = DEFAULT_BATCH_SIZE,
  batchDelayMs = DEFAULT_BATCH_DELAY_MS,
  fetcher = fetchWhereToWatch,
  signal,
  onProgress
} = {}) {
  const normalizedRegion = String(region || 'US').toUpperCase();
  const allCandidates = buildWatchmodeCatalogIndexCandidates(library, catalog);
  const now = Date.now();
  const state = readIndexState();
  const scope = state.scopes[normalizedRegion] || { attempts: {} };
  const attempts = scope.attempts && typeof scope.attempts === 'object' ? scope.attempts : {};
  const cacheSnapshot = getWatchmodeProviderCacheSnapshot();
  let cachedSkipped = 0;
  let recentAttemptSkipped = 0;

  const queue = allCandidates.filter((item) => {
    if (getCachedWhereToWatch(item, { region: normalizedRegion, cacheSnapshot })) {
      cachedSkipped += 1;
      return false;
    }
    if (recentAttempt(attempts[identityKey(item)], now)) {
      recentAttemptSkipped += 1;
      return false;
    }
    return true;
  });

  const summary = {
    status: enabled ? 'running' : 'disabled',
    region: normalizedRegion,
    candidateCount: allCandidates.length,
    queued: queue.length,
    cachedSkipped,
    recentAttemptSkipped,
    attempted: 0,
    ready: 0,
    needsReview: 0,
    notFound: 0,
    failed: 0,
    cursor: Math.min(allCandidates.length, cachedSkipped + recentAttemptSkipped),
    startedAt: new Date().toISOString()
  };

  if (!enabled || signal?.aborted) {
    publishProgress({ ...summary, status: enabled ? 'cancelled' : 'disabled' }, onProgress);
    return summary;
  }

  const pausedUntil = Number(scope.pausedUntil || 0);
  if (pausedUntil > now) {
    const pausedSummary = {
      ...summary,
      status: 'paused',
      pauseReason: scope.pauseReason || 'api_error',
      pausedUntil: new Date(pausedUntil).toISOString()
    };
    publishProgress(pausedSummary, onProgress);
    return pausedSummary;
  }

  publishProgress(summary, onProgress);
  let pauseReason = '';
  let pauseForMs = FAILURE_RETRY_MS;
  const limit = Math.max(0, Math.min(Number(sessionLimit) || DEFAULT_SESSION_LIMIT, queue.length));
  const size = Math.max(1, Number(batchSize) || DEFAULT_BATCH_SIZE);

  for (let offset = 0; offset < limit && !signal?.aborted; offset += size) {
    const batch = queue.slice(offset, Math.min(offset + size, limit));
    const results = await Promise.all(batch.map(async (item) => {
      try {
        const payload = await fetcher(item, {
          region: normalizedRegion,
          requestMode: 'background'
        });
        return { item, status: String(payload?.status || 'not_found'), payload };
      } catch (error) {
        return { item, status: 'failed', error };
      }
    }));

    for (const result of results) {
      const attemptedAt = Date.now();
      attempts[identityKey(result.item)] = {
        attemptedAt,
        status: result.status
      };
      summary.attempted += 1;
      summary.cursor = Math.min(
        allCandidates.length,
        cachedSkipped + recentAttemptSkipped + summary.attempted
      );

      if (result.status === 'ready') {
        summary.ready += 1;
      } else if (result.status === 'needs_review') {
        summary.needsReview += 1;
      } else if (result.status === 'not_found') {
        summary.notFound += 1;
      } else {
        summary.failed += 1;
        const status = Number(result.error?.status || 0);
        pauseReason = status === 429
          ? 'rate_limited'
          : status >= 500
            ? 'api_error'
            : status
              ? `http_${status}`
              : 'offline';
        pauseForMs = Math.max(FAILURE_RETRY_MS, Number(result.error?.retryAfterMs || 0));
      }

      if (result.status !== 'failed' && result.payload?.cacheBackend !== 'KV') {
        pauseReason = 'shared_cache_unavailable';
        pauseForMs = SHARED_CACHE_RETRY_MS;
      }
    }

    const nextPausedUntil = pauseReason ? Date.now() + pauseForMs : 0;
    state.scopes[normalizedRegion] = {
      attempts: compactAttempts(attempts),
      cursor: summary.cursor,
      lastRunAt: Date.now(),
      lastSummary: { ...summary },
      pausedUntil: nextPausedUntil,
      pauseReason
    };
    writeIndexState(state);
    publishProgress({ ...summary }, onProgress);

    if (pauseReason) break;
    if (offset + batch.length < limit) {
      await waitForNextBatch(batchDelayMs, signal);
    }
  }

  const finalSummary = {
    ...summary,
    status: signal?.aborted ? 'cancelled' : (pauseReason ? 'paused' : 'complete'),
    ...(pauseReason ? {
      pauseReason,
      pausedUntil: new Date(Date.now() + pauseForMs).toISOString()
    } : {}),
    completedAt: new Date().toISOString()
  };
  state.scopes[normalizedRegion] = {
    attempts: compactAttempts(attempts),
    cursor: summary.cursor,
    lastRunAt: Date.now(),
    lastSummary: finalSummary,
    pausedUntil: pauseReason ? Date.now() + pauseForMs : 0,
    pauseReason
  };
  writeIndexState(state);
  publishProgress(finalSummary, onProgress);
  return finalSummary;
}

export function runWatchmodeCatalogIndex(options = {}) {
  if (activeIndexPromise) return activeIndexPromise;
  activeIndexPromise = executeCatalogIndex(options).finally(() => {
    activeIndexPromise = null;
  });
  return activeIndexPromise;
}
