import { useEffect, useMemo, useRef, useState } from 'react';
import {
  applyVerifiedCatalogLinkageRepair,
  fetchContinuationTitles,
  getCachedContinuationTitles
} from '../services/kitsuRelationshipService';
import { selectHomeDecisionData } from '../services/homeDecisionSelector';
import { isNativeAndroid } from '../platform/runtime';
import {
  getWatchmodeProviderCacheSnapshot,
  getSavedStreamingApps,
  getSavedWatchRegion,
  groupWatchProvidersByPreference,
  STREAMING_APPS_KEY
} from '../services/watchmodeService';
import {
  getKitsuStreamingCacheSnapshot,
  primeKitsuStreamingLinks
} from '../services/kitsuStreamingService';
import { getCachedStreamingAvailability } from '../services/streamingAvailabilityService';
import {
  deferUntilAfterFirstPaint,
  measureAsyncStartupTask,
  measureStartupTask,
  recordStartupTiming
} from '../services/startupPerformance';

const SERVICE_RESULT_LIMIT = 6;
const SERVICE_CANDIDATE_LIMIT = 48;

function titleOf(item = {}) {
  return item.officialTitle || item.title || '';
}

function identityKey(item = {}) {
  if (item.kitsuId) return `kitsu:${item.kitsuId}`;
  return titleOf(item).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function normalizeStatus(value = '') {
  return String(value || '').toLowerCase().replace(/[\s_-]+/g, '');
}

function isInLibrary(candidate, library = []) {
  const key = identityKey(candidate);
  return library.some((item) => identityKey(item) === key);
}

function topTasteSignals(library = []) {
  const scores = new Map();
  for (const item of library) {
    const rating = Number(item.joeScore || item.score || item.rating || 0);
    const weight = 1 + Math.max(0, rating - 6) + Number(Boolean(item.favorite)) * 2 + Number(item.rewatches || 0);
    for (const genre of Array.isArray(item.genres) ? item.genres : []) {
      scores.set(String(genre).toLowerCase(), (scores.get(String(genre).toLowerCase()) || 0) + weight);
    }
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
}

export function buildHomeServiceCandidates(library = [], catalog = [], dailyPick = null) {
  const signals = new Map(topTasteSignals(library));
  const candidates = [];
  const seen = new Set();

  const add = (item, bonus = 0, { allowLibrary = false } = {}) => {
    if (!item || (!allowLibrary && isInLibrary(item, library))) return;
    const key = identityKey(item);
    if (!key || seen.has(key)) return;
    seen.add(key);

    const genreScore = (Array.isArray(item.genres) ? item.genres : [])
      .reduce((sum, genre) => sum + Number(signals.get(String(genre).toLowerCase()) || 0), 0);
    const communityScore = Number(item.communityScore || item.malScore || 0);
    const identityScore = Number(Boolean(item.year || item.startYear || item.releaseYear)) * 24
      + Number(Boolean(item.type || item.subtype || item.format || item.showType)) * 16
      + Number(Boolean(item.kitsuId || item.malId)) * 8;
    candidates.push({ item, score: bonus + genreScore + communityScore + identityScore });
  };

  for (const item of library) {
    const status = normalizeStatus(item.status);
    const statusBonus = status === 'watching'
      ? 1600
      : ['plantowatch', 'planned'].includes(status)
        ? 1500
        : ['onhold', 'paused'].includes(status)
          ? 1400
          : 0;
    if (statusBonus) add(item, statusBonus, { allowLibrary: true });
  }

  add(dailyPick, 1300);
  for (const item of catalog) add(item);

  return candidates
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item)
    .slice(0, SERVICE_CANDIDATE_LIMIT);
}

function preferredServiceResult(item, selectedApps, region, {
  allowStale = false,
  watchmodeCacheSnapshot,
  kitsuCacheSnapshot
} = {}) {
  const payload = getCachedStreamingAvailability(item, {
    region,
    allowStale,
    watchmodeCacheSnapshot,
    kitsuCacheSnapshot
  });
  if (payload?.status !== 'ready') return null;
  const { preferred } = groupWatchProvidersByPreference(payload.providers, selectedApps);
  if (!preferred.length) return null;
  return {
    item,
    providers: preferred,
    preferredProvider: preferred[0],
    source: payload.source || 'unknown'
  };
}

function cachedServiceResults(candidates, selectedApps, region) {
  if (!selectedApps.length) return [];
  const watchmodeCacheSnapshot = getWatchmodeProviderCacheSnapshot();
  const kitsuCacheSnapshot = getKitsuStreamingCacheSnapshot();
  return candidates
    .map((item) => preferredServiceResult(item, selectedApps, region, {
      watchmodeCacheSnapshot,
      kitsuCacheSnapshot
    }) || preferredServiceResult(item, selectedApps, region, {
      allowStale: true,
      watchmodeCacheSnapshot,
      kitsuCacheSnapshot
    }))
    .filter(Boolean)
    .slice(0, SERVICE_RESULT_LIMIT);
}

export function useHomeDecisionData({
  library = [],
  catalog = [],
  dailyPick = null,
  updateAnime,
  enableSecondaryRefresh = true
} = {}) {
  const [candidates, setCandidates] = useState([]);
  const [streamingApps, setStreamingApps] = useState(() => getSavedStreamingApps());
  const [region, setRegion] = useState(() => getSavedWatchRegion());
  const [serviceCacheVersion, setServiceCacheVersion] = useState(0);
  const [continuations, setContinuations] = useState(() =>
    getCachedContinuationTitles(library, catalog, { allowStale: true })
  );
  const [relationshipTrace, setRelationshipTrace] = useState(null);
  const [returningPending, setReturningPending] = useState(true);
  const [onServices, setOnServices] = useState([]);
  const [servicesPending, setServicesPending] = useState(streamingApps.length > 0);
  const [serviceTrace, setServiceTrace] = useState(null);
  const updateAnimeRef = useRef(updateAnime);
  const persistingLinkagesRef = useRef(new Set());

  useEffect(() => {
    updateAnimeRef.current = updateAnime;
  }, [updateAnime]);

  useEffect(() => deferUntilAfterFirstPaint(() => {
    setCandidates(measureStartupTask(
      'homeServiceCandidateGeneration',
      () => buildHomeServiceCandidates(library, catalog, dailyPick),
      { libraryTitleCount: library.length, catalogTitleCount: catalog.length }
    ));
  }), [library, catalog, dailyPick]);

  useEffect(() => {
    const refresh = () => setStreamingApps(getSavedStreamingApps());
    const refreshCache = () => setServiceCacheVersion((version) => version + 1);
    const refreshRegion = () => setRegion(getSavedWatchRegion());
    const storage = (event) => {
      if (!event.key || event.key === STREAMING_APPS_KEY) refresh();
    };
    window.addEventListener('joeanime:streaming-apps-changed', refresh);
    window.addEventListener('joeanime:watchmode-cache-changed', refreshCache);
    window.addEventListener('joeanime:kitsu-streaming-cache-changed', refreshCache);
    window.addEventListener('joeanime:watch-region-changed', refreshRegion);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener('joeanime:streaming-apps-changed', refresh);
      window.removeEventListener('joeanime:watchmode-cache-changed', refreshCache);
      window.removeEventListener('joeanime:kitsu-streaming-cache-changed', refreshCache);
      window.removeEventListener('joeanime:watch-region-changed', refreshRegion);
      window.removeEventListener('storage', storage);
    };
  }, []);

  useEffect(() => {
    if (!streamingApps.length || !candidates.length) return undefined;
    const controller = new AbortController();
    const cancelSchedule = deferUntilAfterFirstPaint(() => {
      void primeKitsuStreamingLinks(candidates, { signal: controller.signal })
        .catch(() => {});
    });
    return () => {
      controller.abort();
      cancelSchedule();
    };
  }, [candidates, streamingApps.length]);

  useEffect(() => {
    let cancelled = false;
    setRelationshipTrace(null);
    setReturningPending(true);

    const cancelSchedule = deferUntilAfterFirstPaint(() => {
      void (async () => {
        try {
          const cached = measureStartupTask(
            'sequelCacheRead',
            () => getCachedContinuationTitles(library, catalog, { allowStale: true }),
            { libraryTitleCount: library.length }
          );
          if (!cancelled) setContinuations(cached);

          if (!enableSecondaryRefresh) {
            if (!cancelled) setReturningPending(false);
            return;
          }

          const items = await measureAsyncStartupTask(
            'kitsuRelationshipRefresh',
            () => fetchContinuationTitles(library, catalog, {
              onTrace: (trace) => {
                if (!cancelled) setRelationshipTrace(trace);
              },
              onLinkageRepairs: async (repairs) => {
                if (cancelled || !updateAnimeRef.current) return 0;
                let persisted = 0;

                for (const repair of repairs) {
                  const key = `${repair.libraryId}:${repair.kitsuId}`;
                  if (persistingLinkagesRef.current.has(key)) continue;
                  persistingLinkagesRef.current.add(key);

                  try {
                    const item = repair.libraryItem;
                    const repaired = applyVerifiedCatalogLinkageRepair(item, repair);
                    if (repaired === item) continue;
                    await updateAnimeRef.current(repaired);
                    persisted += 1;
                  } catch (error) {
                    console.warn(`Could not persist Kitsu linkage for ${repair.libraryItem?.title || repair.libraryId}:`, error);
                  } finally {
                    persistingLinkagesRef.current.delete(key);
                  }
                }

                return persisted;
              }
            }),
            { libraryTitleCount: library.length }
          );
          if (!cancelled) setContinuations(items);
        } finally {
          if (!cancelled) setReturningPending(false);
        }
      })();
    });
    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, [library, catalog, enableSecondaryRefresh]);

  useEffect(() => {
    let cancelled = false;
    if (!streamingApps.length) {
      setOnServices([]);
      setServicesPending(false);
      setServiceTrace({ selectedStreamingApps: [], candidateCount: candidates.length, resultCount: 0, requestCount: 0 });
      return undefined;
    }

    setServicesPending(true);
    const cancelSchedule = deferUntilAfterFirstPaint(() => {
      void (async () => {
        const cached = measureStartupTask(
          'watchmodeCacheRead',
          () => cachedServiceResults(candidates, streamingApps, region),
          { candidateCount: candidates.length }
        );
        if (!cancelled) {
          setOnServices(cached);
          setServiceTrace({
            selectedStreamingApps: streamingApps,
            candidateCount: candidates.length,
            cachedResultCount: cached.length,
            resultCount: cached.length,
            requestCount: 0
          });
        }

        if (!cancelled) {
          setServicesPending(false);
          setServiceTrace({
            selectedStreamingApps: streamingApps,
            candidateCount: candidates.length,
            cachedResultCount: cached.length,
            resultCount: cached.length,
            requestCount: 0,
            cacheOnly: true,
            zeroDollarMode: true,
            providerStrategy: 'kitsu-first-with-watchmode-verified-override'
          });
        }
      })();
    });
    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, [candidates, region, serviceCacheVersion, streamingApps]);

  const decisionSelection = useMemo(() => {
    const startedAt = globalThis.performance?.now?.() ?? Date.now();
    const selection = selectHomeDecisionData({
      library,
      continuations,
      directSequelCandidateCount: relationshipTrace?.directSequelCandidateCount ?? continuations.length
    });
    const duration = (globalThis.performance?.now?.() ?? Date.now()) - startedAt;
    const detail = {
      libraryTitleCount: library.length,
      watchingTitleCount: selection.watchingTitles.length,
      continuationCount: continuations.length
    };
    recordStartupTiming('homeDecisionSelection', duration, detail);
    recordStartupTiming('continueWatchingSelection', duration, detail);
    return selection;
  }, [continuations, library, relationshipTrace?.directSequelCandidateCount]);

  const diagnostics = useMemo(() => ({
    ...decisionSelection.diagnostics,
    ...(relationshipTrace || {}),
    ...(serviceTrace || {}),
    watchmodeCatalogIndex: {
      status: 'disabled',
      reason: 'zero_dollar_mode'
    },
    runtime: globalThis.JoeAnimeDB?.desktop
      ? 'electron'
      : isNativeAndroid()
        ? 'android'
        : 'web',
    layout: typeof document !== 'undefined' && document.body?.classList.contains('tvLayoutMode') ? 'tv' : 'standard'
  }), [decisionSelection.diagnostics, relationshipTrace, serviceTrace]);

  useEffect(() => {
    globalThis.__JOEANIME_HOME_DIAGNOSTICS__ = diagnostics;
  }, [diagnostics]);

  return {
    watchingTitles: decisionSelection.watchingTitles,
    returning: decisionSelection.returning,
    missedSequels: decisionSelection.missedSequels,
    returningPending,
    onServices,
    servicesPending,
    hasStreamingApps: streamingApps.length > 0,
    diagnostics
  };
}
