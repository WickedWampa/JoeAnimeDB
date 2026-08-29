import { useEffect, useMemo, useRef, useState } from 'react';
import { countBy, filterAnime, score } from '../utils/animeUtils';
import { isRemoteCover, needsArtworkRepair, sleep } from '../services/metadata';
import { hasManualMetadataOverride } from '../services/metadataProvider';
import { fetchKitsuMetadata } from '../services/kitsuProvider';
import { animeRepository } from '../repositories/animeRepository';
import { sameAnimeIdentity } from '../services/titleIdentity';
import {
  updateCatalogContentRatings,
  updateCatalogMetadata,
  fetchMoreCatalogTitles as fetchMoreCatalogPage,
  fetchLiveDiscoverCatalog,
  mergeCatalogEntries
} from '../services/catalogService';
import seedData from '../data/animeSeed.json';
import { createNewUserDemoDatabase } from '../services/newUserMode';
import { auditGenomeCoverage } from '../ai/genome/runtime/autoGenomeRuntime';
import { preservePersonalAnimeData } from '../services/personalAnimeData';
import { promoteCatalogTitleToLibrary } from '../services/quickAdd';
import { sanitizeJoeAIConversationMessages } from '../ai/intelligence/joeAIIntelligence';
import {
  deferUntilAfterFirstPaint,
  measureAsyncStartupTask,
  measureStartupTask
} from '../services/startupPerformance';
import { repairLibraryKitsuLinkages } from '../services/libraryKitsuLinkageRepair';
import { malIdOf, repairLibraryMalLinkages } from '../services/libraryMalLinkageRepair';
import { kitsuIdOf } from '../services/kitsuRelationshipService';

const HOME_BOOTSTRAP_KEY = 'joeanime-home-bootstrap-v1';

function homeBootstrapItem(item = {}) {
  const fields = [
    'id', 'kitsuId', 'kitsu_id', 'malId', 'title', 'officialTitle', 'englishTitle',
    'cover', 'poster', 'posterUrl', 'image', 'imageUrl', 'status', 'watchedEpisodes',
    'episodesWatched', 'episodeProgress', 'progress', 'watchedEpisodeCount',
    'currentEpisode', 'episodeCount', 'episodes', 'totalEpisodes', 'favorite',
    'joeScore', 'score', 'rating', 'rewatches', 'type', 'year', 'genres', 'followed'
  ];
  return Object.fromEntries(fields.filter((field) => item[field] != null).map((field) => [field, item[field]]));
}

export function readHomeBootstrapSnapshot() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HOME_BOOTSTRAP_KEY) || 'null');
    if (!parsed || !Array.isArray(parsed.anime)) return null;
    return {
      ...seedData,
      anime: parsed.anime,
      catalog: Array.isArray(parsed.catalog) ? parsed.catalog : [],
      profile: parsed.profile && typeof parsed.profile === 'object' ? parsed.profile : seedData.profile
    };
  } catch {
    return null;
  }
}

export function writeHomeBootstrapSnapshot(database = {}) {
  try {
    const snapshot = {
      savedAt: Date.now(),
      anime: (Array.isArray(database.anime) ? database.anime : []).map(homeBootstrapItem),
      catalog: (Array.isArray(database.catalog) ? database.catalog : [])
        .filter((item) => item.followed)
        .map(homeBootstrapItem),
      profile: database.profile || {}
    };
    localStorage.setItem(HOME_BOOTSTRAP_KEY, JSON.stringify(snapshot));
    return snapshot;
  } catch {
    return null;
  }
}

function hasGoodMetadata(item = {}) {
  const hasGenres = Array.isArray(item.genres) && item.genres.length > 0;
  const hasIdentity = Boolean(item.malId || item.kitsuId || item.officialTitle);
  const hasCoreDetails = Boolean(
    item.synopsis ||
    item.description ||
    item.year ||
    item.episodeCount ||
    item.episodes
  );

  // A poster/title-only Kitsu fallback is not analytics-ready. Genres are the
  // minimum required for Home and Analytics; identity/core details prevent an
  // empty genre-only shell from being treated as complete.
  return Boolean(hasGenres && hasIdentity && hasCoreDetails);
}

function metadataIsStale(item = {}) {
  if (!item.metadataUpdatedAt) return false;

  const updated = new Date(item.metadataUpdatedAt).getTime();
  if (!Number.isFinite(updated)) return false;

  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return Date.now() - updated > thirtyDays && !hasGoodMetadata(item);
}

function shouldRefreshMetadata(item = {}) {
  // Identity-review titles must be resolved by the existing Needs Review flow.
  // A background metadata refresh must never turn an ambiguous candidate into
  // a persisted Kitsu identity merely because it ranked first.
  if (item.identityNeedsReview) return false;

  const studioRepairAttempts = Number(
    item.studioRepairAttempts ??
    item.syncStatus?.studioRepairAttempts ??
    0
  );

  const needsStudioRepair = Boolean(
    !item.studio &&
    studioRepairAttempts < 2
  );

  return (
    hasManualMetadataOverride(item) ||
    needsArtworkRepair(item) ||
    !hasGoodMetadata(item) ||
    metadataIsStale(item) ||
    Boolean(item.metadataNeedsRefresh) ||
    Boolean(item.syncStatus?.dirty) ||
    needsStudioRepair
  );
}

function setItemSyncStatus(item = {}, updates = {}) {
  return {
    ...item,
    metadataNeedsRefresh:
      typeof updates.dirty === 'boolean'
        ? updates.dirty
        : Boolean(item.metadataNeedsRefresh),
    syncStatus: {
      ...(item.syncStatus || {}),
      ...updates
    }
  };
}

const METADATA_LOOKUP_TIMEOUT_MS = 9000;
const METADATA_BASE_DELAY_MS = 1450;
const METADATA_RETRY_DELAYS_MS = [0];

async function withTimeout(promise, timeoutMs, label = 'Metadata lookup') {
  let timer;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)} seconds`)),
          timeoutMs
        );
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchMetadataWithBackoff(item = {}) {
  // Library repair is deliberately Kitsu-only so every repaired title uses the
  // same categories and production relationships.
  return withTimeout(
    fetchKitsuMetadata(item),
    METADATA_LOOKUP_TIMEOUT_MS,
    `Kitsu metadata lookup for ${item.title || 'title'}`
  );
}


const emptyProgress = {
  step: 1,
  stepTotal: 2,
  label: 'Preparing update',
  processed: 0,
  total: 0,
  percent: 0,
  current: ''
};

function bootstrapCatalog(database = {}) {
  let cachedRows = [];
  try {
    const cached = JSON.parse(localStorage.getItem('joeanime-live-discover-cache-v1') || '{}');
    cachedRows = Array.isArray(cached?.rows) ? cached.rows : [];
  } catch {}

  return {
    ...database,
    catalog: mergeCatalogEntries({
      library: database.anime || [],
      catalog: [...(database.catalog || []), ...cachedRows]
    })
  };
}

export function useAnimeLibrary() {
  const initialDataRef = useRef(undefined);
  if (initialDataRef.current === undefined) {
    initialDataRef.current = measureStartupTask(
      'homeBootstrapRead',
      () => readHomeBootstrapSnapshot()
    );
  }
  const [data, setData] = useState(() => initialDataRef.current || { ...seedData, anime: [], catalog: [] });
  const dataRef = useRef(data);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncText, setSyncText] = useState('');
  const [syncProgress, setSyncProgress] = useState(emptyProgress);
  const [newUserMode, setNewUserMode] = useState(() => localStorage.getItem('joeanime-new-user-mode') === 'true');

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (loading) return undefined;
    return deferUntilAfterFirstPaint(() => {
      measureStartupTask('homeBootstrapWrite', () => writeHomeBootstrapSnapshot(data), {
        libraryTitleCount: data.anime?.length || 0
      });
    });
  }, [data, loading]);

  useEffect(() => {
    let alive = true;
    let contentRatingTimer;
    let cancelCatalogBootstrap;

    function startContentRatingBackfill(database) {
      contentRatingTimer = window.setTimeout(async () => {
        try {
          const result = await updateCatalogContentRatings({
            library: database.anime || [],
            catalog: database.catalog || [],
            repository: animeRepository,
            limit: 200,
            batchSize: 4
          });

          if (!alive || !result.updated) return;
          dataRef.current = result.saved;
          setData(result.saved);
        } catch (error) {
          // Startup must remain usable offline. Failed or unmatched titles keep
          // no completion marker, so the next launch or Update Database retries.
          console.warn('Background content-rating backfill was deferred.', error);
        }
      }, 1200);
    }

    async function load() {
      try {
        const requestedNewUserMode = localStorage.getItem('joeanime-new-user-mode') === 'true';

        // New User Mode is a browser/mobile preview state. A stale copy of the
        // flag must never hide an existing desktop SQLite library after an
        // installer update.
        if (requestedNewUserMode && !window.JoeAnimeDB?.desktop) {
          if (alive) setData(bootstrapCatalog(createNewUserDemoDatabase()));
          return;
        }

        const loaded = await measureAsyncStartupTask(
          'localLibraryRetrieval',
          () => animeRepository.getDatabase()
        );
        if (alive) {
          if (requestedNewUserMode && window.JoeAnimeDB?.desktop) {
            localStorage.removeItem('joeanime-new-user-mode');
            setNewUserMode(false);
          }
          dataRef.current = loaded;
          setData(loaded);
          setLoading(false);

          // Live Discover merging and metadata backfill are useful, but neither
          // belongs on the critical path to an interactive Home screen.
          cancelCatalogBootstrap = deferUntilAfterFirstPaint(() => {
            if (!alive || dataRef.current !== loaded) return;
            const bootstrapped = measureStartupTask(
              'catalogBootstrapMerge',
              () => bootstrapCatalog(loaded),
              { catalogTitleCount: loaded.catalog?.length || 0 }
            );
            dataRef.current = bootstrapped;
            setData(bootstrapped);
            startContentRatingBackfill(bootstrapped);
          });
        }
      } catch (error) {
        console.error('Failed to load JoeAnimeDB database.', error);
        if (alive) setData(seedData);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
      cancelCatalogBootstrap?.();
      window.clearTimeout(contentRatingTimer);
    };
  }, []);

  const anime = data.anime || [];
  const catalog = data.catalog || [];
  const joeAI = data.joeAI || {
    feedback: [],
    preferences: [],
    conversation: {
      lastRecommendations: [],
      lastReferencedTitle: '',
      lastPrompt: '',
      lastRecommendationPrompt: '',
      messages: [],
      recentRecommendationKeys: [],
      lastConstraints: { exclude: [] }
    }
  };

  async function enableNewUserMode() {
    localStorage.setItem('joeanime-new-user-mode', 'true');
    setNewUserMode(true);
    const demo = bootstrapCatalog(createNewUserDemoDatabase());
    setData(demo);
    return demo;
  }

  async function exitNewUserMode() {
    localStorage.removeItem('joeanime-new-user-mode');
    setNewUserMode(false);
    setLoading(true);

    try {
      const loaded = await animeRepository.getDatabase();
      setData(loaded);
      return loaded;
    } finally {
      setLoading(false);
    }
  }

  async function resetNewUserMode() {
    const demo = bootstrapCatalog(createNewUserDemoDatabase());
    setData(demo);
    return demo;
  }

  async function updateData(nextOrUpdater) {
    const current = dataRef.current || data;
    const next = typeof nextOrUpdater === 'function'
      ? nextOrUpdater(current)
      : nextOrUpdater;

    dataRef.current = next;
    setData(next);

    if (newUserMode) {
      return next;
    }

    const saved = await animeRepository.saveDatabase(next);
    dataRef.current = saved;
    setData(saved);
    return saved;
  }

  async function updateAnime(updatedAnime) {
    const libraryAnime = promoteCatalogTitleToLibrary(updatedAnime);

    if (newUserMode) {
      const previousData = dataRef.current || { ...seedData, anime: [], catalog: [] };
      const currentAnime = previousData.anime || [];
      const malId = libraryAnime.malId ?? libraryAnime.mal_id;
      const existing = currentAnime.find((item) =>
        (malId && String(item.malId || '') === String(malId)) ||
        String(item.id) === String(libraryAnime.id)
      );

      const nextAnime = existing
        ? currentAnime.map((item) =>
            String(item.id) === String(existing.id)
              ? { ...item, ...libraryAnime, id: existing.id }
              : item
          )
        : [...currentAnime, libraryAnime];

      const nextSnapshot = {
        ...previousData,
        anime: nextAnime
      };

      // Update the ref immediately so rapid sequential bulk imports always see
      // the title that was just added instead of a stale React render.
      dataRef.current = nextSnapshot;
      setData(nextSnapshot);

      return nextSnapshot;
    }

    const before = dataRef.current || data || { anime: [] };
    const beforeAnime = Array.isArray(before.anime) ? before.anime : [];
    console.group(`[Metadata Repair Debug][Hook] ${libraryAnime.title || libraryAnime.id}`);
    console.log('REACT STATE BEFORE REPOSITORY UPDATE', {
      count: beforeAnime.length,
      incoming: {
        id: libraryAnime.id,
        title: libraryAnime.title,
        malId: libraryAnime.malId ?? libraryAnime.mal_id ?? null,
        kitsuId: libraryAnime.kitsuId ?? libraryAnime.kitsu_id ?? null
      }
    });

    const saved = await animeRepository.updateAnime(libraryAnime);
    const afterAnime = Array.isArray(saved?.anime) ? saved.anime : [];
    const afterIds = new Set(afterAnime.map((item) => String(item.id)));
    const beforeIds = new Set(beforeAnime.map((item) => String(item.id)));
    console.log('REACT STATE AFTER REPOSITORY UPDATE', {
      count: afterAnime.length,
      delta: afterAnime.length - beforeAnime.length,
      removed: beforeAnime.filter((item) => !afterIds.has(String(item.id))).map((item) => ({
        id: item.id,
        title: item.title,
        malId: item.malId ?? item.mal_id ?? null,
        kitsuId: item.kitsuId ?? item.kitsu_id ?? null
      })),
      added: afterAnime.filter((item) => !beforeIds.has(String(item.id))).map((item) => ({
        id: item.id,
        title: item.title,
        malId: item.malId ?? item.mal_id ?? null,
        kitsuId: item.kitsuId ?? item.kitsu_id ?? null
      }))
    });
    console.groupEnd();

    dataRef.current = saved;
    setData(saved);
    return saved;
  }

  async function updateCatalogAnime(updatedAnime) {
    const current = dataRef.current || data;

    if (newUserMode) {
      const currentCatalog = current.catalog || [];
      const existing = currentCatalog.find((item) =>
        String(item.id) === String(updatedAnime.id) ||
        sameAnimeIdentity(item, updatedAnime)
      );

      const nextCatalog = existing
        ? currentCatalog.map((item) =>
            String(item.id) === String(existing.id)
              ? {
                  ...item,
                  ...updatedAnime,
                  id: existing.id,
                  kitsuId: updatedAnime.kitsuId || item.kitsuId || ''
                }
              : item
          )
        : [...currentCatalog, updatedAnime];

      const next = { ...current, catalog: nextCatalog };
      dataRef.current = next;
      setData(next);
      return next;
    }

    const saved = await animeRepository.updateCatalogAnime(updatedAnime);
    dataRef.current = saved;
    setData(saved);
    return saved;
  }

  async function recordJoeAIFeedback(entry) {
    const current = dataRef.current || data;
    const createdAt = entry.createdAt || new Date().toISOString();
    const payload = { ...entry, createdAt };

    if (newUserMode) {
      const nextState = {
        ...(current.joeAI || {}),
        feedback: [payload, ...(current.joeAI?.feedback || [])]
      };
      const next = { ...current, joeAI: nextState };
      dataRef.current = next;
      setData(next);
      return nextState;
    }

    const nextState = await animeRepository.recordJoeAIFeedback(payload);
    const next = { ...current, joeAI: nextState };
    dataRef.current = next;
    setData(next);
    return nextState;
  }

  async function setJoeAIPreference(preference) {
    const current = dataRef.current || data;
    const payload = {
      ...preference,
      updatedAt: preference.updatedAt || new Date().toISOString()
    };

    if (newUserMode) {
      const nextState = {
        ...(current.joeAI || {}),
        preferences: [
          payload,
          ...(current.joeAI?.preferences || []).filter((item) => item.key !== payload.key)
        ]
      };
      const next = { ...current, joeAI: nextState };
      dataRef.current = next;
      setData(next);
      return nextState;
    }

    const nextState = await animeRepository.setJoeAIPreference(payload);
    const next = { ...current, joeAI: nextState };
    dataRef.current = next;
    setData(next);
    return nextState;
  }

  async function deleteJoeAIFeedback(id) {
    const current = dataRef.current || data;
    const nextState = newUserMode
      ? {
          ...(current.joeAI || {}),
          feedback: (current.joeAI?.feedback || []).filter((entry) =>
            String(entry.id) !== String(id)
          )
        }
      : await animeRepository.deleteJoeAIFeedback(id);
    const next = { ...current, joeAI: nextState };
    dataRef.current = next;
    setData(next);
    return nextState;
  }

  async function deleteJoeAIPreference(key) {
    const current = dataRef.current || data;
    const nextState = newUserMode
      ? {
          ...(current.joeAI || {}),
          preferences: (current.joeAI?.preferences || []).filter((entry) =>
            entry.key !== key
          )
        }
      : await animeRepository.deleteJoeAIPreference(key);
    const next = { ...current, joeAI: nextState };
    dataRef.current = next;
    setData(next);
    return nextState;
  }

  async function resetJoeAILearning() {
    const current = dataRef.current || data;
    const nextState = newUserMode
      ? {
          ...(current.joeAI || {}),
          feedback: [],
          preferences: []
        }
      : await animeRepository.resetJoeAILearning();
    const next = { ...current, joeAI: nextState };
    dataRef.current = next;
    setData(next);
    return nextState;
  }

  async function setJoeAIConversationContext(context = {}) {
    const current = dataRef.current || data;
    const previousConversation = current.joeAI?.conversation || {};
    const conversation = {
      ...previousConversation,
      ...context,
      lastRecommendations: Array.isArray(context.lastRecommendations)
        ? context.lastRecommendations.slice(0, 10)
        : Array.isArray(previousConversation.lastRecommendations)
          ? previousConversation.lastRecommendations.slice(0, 10)
          : [],
      lastReferencedTitle: String(context.lastReferencedTitle ?? previousConversation.lastReferencedTitle ?? ''),
      lastPrompt: String(context.lastPrompt ?? previousConversation.lastPrompt ?? ''),
      lastRecommendationPrompt: String(
        context.lastRecommendationPrompt ?? previousConversation.lastRecommendationPrompt ?? ''
      ),
      messages: sanitizeJoeAIConversationMessages(
        context.messages ?? previousConversation.messages ?? [],
        48
      ),
      recentRecommendationKeys: Array.isArray(context.recentRecommendationKeys)
        ? context.recentRecommendationKeys.slice(0, 48)
        : Array.isArray(previousConversation.recentRecommendationKeys)
          ? previousConversation.recentRecommendationKeys.slice(0, 48)
          : [],
      lastConstraints: context.lastConstraints && typeof context.lastConstraints === 'object'
        ? context.lastConstraints
        : previousConversation.lastConstraints && typeof previousConversation.lastConstraints === 'object'
          ? previousConversation.lastConstraints
          : { exclude: [] },
      updatedAt: new Date().toISOString()
    };
    const nextState = newUserMode
      ? { ...(current.joeAI || {}), conversation }
      : await animeRepository.setJoeAIConversationContext(conversation);
    const next = { ...current, joeAI: nextState };
    dataRef.current = next;
    setData(next);
    return nextState;
  }

  async function clearJoeAIConversationContext() {
    const current = dataRef.current || data;
    const nextState = newUserMode
      ? {
          ...(current.joeAI || {}),
          conversation: {
            lastRecommendations: [],
            lastReferencedTitle: '',
            lastPrompt: '',
            lastRecommendationPrompt: '',
            messages: [],
            recentRecommendationKeys: [],
            lastConstraints: { exclude: [] }
          }
        }
      : await animeRepository.clearJoeAIConversationContext();
    const next = { ...current, joeAI: nextState };
    dataRef.current = next;
    setData(next);
    return nextState;
  }

  async function deleteAnime(id) {
    if (newUserMode) {
      let nextSnapshot = null;

      setData((previousData) => {
        nextSnapshot = {
          ...previousData,
          anime: (previousData.anime || []).filter((item) => String(item.id) !== String(id))
        };

        return nextSnapshot;
      });

      return nextSnapshot || {
        ...data,
        anime: (data.anime || []).filter((item) => String(item.id) !== String(id))
      };
    }

    const current = dataRef.current || data;
    const next = {
      ...current,
      anime: (current.anime || []).filter((item) => String(item.id) !== String(id))
    };

    const saved = await animeRepository.saveDatabase(next);
    dataRef.current = saved;
    setData(saved);
    return saved;
  }

  const filtered = useMemo(() => filterAnime(anime, query), [anime, query]);

  const stats = useMemo(() => {
    const avg = anime.reduce((sum, item) => sum + score(item), 0) / Math.max(anime.length, 1);
    const genres = countBy(anime.flatMap((item) => item.genres || []));
    const rewatches = anime.reduce((sum, item) => sum + Number(item.rewatches || 0), 0);
    const posters = anime.filter((item) => isRemoteCover(item.cover)).length;

    return {
      total: anime.length,
      catalogTotal: catalog.length,
      avg: avg.toFixed(2),
      topGenre: genres[0]?.[0] || '—',
      rewatches,
      posters,
      databaseEngine: data.engine || animeRepository.engine,
      databasePath: data.path || ''
    };
  }, [anime, catalog.length, data.engine, data.path]);

  function setLibraryProgress({ processed, total, title, label = 'Refreshing Library Metadata' }) {
    const percent = total ? Math.round((processed / total) * 50) : 0;

    setSyncProgress({
      step: 1,
      stepTotal: 2,
      label,
      processed,
      total,
      percent,
      current: title
    });
  }

  function setCatalogProgress({ processed, total, title }) {
    const catalogPercent = total ? Math.round((processed / total) * 50) : 0;

    setSyncProgress({
      step: 2,
      stepTotal: 2,
      label: 'Building Recommendation Catalog',
      processed,
      total,
      percent: 50 + catalogPercent,
      current: title
    });
  }

  async function refreshLiveDiscover({ limitPerFeed = 25 } = {}) {
    const current = dataRef.current || data;
    const result = await fetchLiveDiscoverCatalog({
      library: current.anime || [],
      catalog: current.catalog || [],
      limitPerFeed
    });

    let saved;

    if (newUserMode) {
      saved = { ...current, catalog: result.catalog };
      dataRef.current = saved;
      setData(saved);
    } else {
      saved = await animeRepository.importCatalog(result.catalog);
      dataRef.current = saved;
      setData(saved);
    }

    localStorage.setItem('joeanime-discover-live-synced-at', result.syncedAt);
    return { ...result, saved };
  }

  async function fetchMoreCatalogTitles({ limit = 25 } = {}) {
    const current = dataRef.current || data;
    const currentAnime = current.anime || [];
    const currentCatalog = current.catalog || [];
    const savedPage = Number(localStorage.getItem('joeanime-discover-next-page') || 1);

    const result = await fetchMoreCatalogPage({
      library: currentAnime,
      catalog: currentCatalog,
      page: savedPage,
      limit
    });

    let saved;

    if (newUserMode) {
      saved = { ...current, catalog: result.catalog };
      dataRef.current = saved;
      setData(saved);
    } else {
      saved = await animeRepository.importCatalog(result.catalog);
      dataRef.current = saved;
      setData(saved);
    }

    localStorage.setItem('joeanime-discover-next-page', String(result.nextPage));
    return { ...result, saved };
  }

  async function syncMetadata() {
    const auditRows = anime.map((item, index) => ({
      item,
      index,
      needsMetadata: shouldRefreshMetadata(item),
      needsArtwork: needsArtworkRepair(item)
    }));

    const updateQueue = auditRows.filter((row) => row.needsMetadata);
    const alreadyReady = auditRows.length - updateQueue.length;

    const message = [
      'Smart database update:',
      '',
      `• ${anime.length} titles scanned locally`,
      `• ${alreadyReady} already have usable metadata/artwork`,
      `• ${updateQueue.length} need missing/dirty metadata or artwork repair`,
      '',
      updateQueue.length
        ? 'Only those titles will contact Kitsu.'
        : 'No library metadata calls are needed.',
      '',
      'Continue and build recommendation catalog / genomes?'
    ].join('\n');

    // Native browser confirm() can steal caret/focus in Electron after long async updates.
    // Run the updater directly and keep confirmation in the visible UI later if needed.
    console.info(message);

    document.body.style.cursor = 'default';
    setSyncing(true);
    setSyncText('Scanning local database...');
    setSyncProgress({
      ...emptyProgress,
      label: 'Local Database Audit',
      processed: alreadyReady,
      total: anime.length,
      percent: updateQueue.length ? 1 : 50,
      current: `${alreadyReady} skipped locally`
    });

    let nextAnime = [...anime];

    if (updateQueue.length) {
      for (let passIndex = 0; passIndex < updateQueue.length; passIndex++) {
        const { index } = updateQueue[passIndex];
        const title = nextAnime[index].title;
        const isRepair = needsArtworkRepair(nextAnime[index]);
        const operationLabel = isRepair
          ? 'Repairing Artwork / Metadata'
          : 'Refreshing Missing Metadata';

        setLibraryProgress({
          processed: passIndex + 1,
          total: updateQueue.length,
          title,
          label: operationLabel
        });

        setSyncText(`${operationLabel} ${passIndex + 1}/${updateQueue.length}: ${title}`);

        let lookupSucceeded = false;

        try {
          const existing = nextAnime[index];
          const refreshed = await fetchMetadataWithBackoff(existing);

          console.log('[Library Updater] Refreshed metadata', {
            title,
            existingStudio: existing.studio || '',
            refreshedStudio: refreshed.studio || '',
            refreshedStudios: refreshed.studios || [],
            refreshedProductionStudios: refreshed.productionStudios || [],
            refreshedGenres: refreshed.genres || [],
            refreshedMetadataNeedsRefresh: refreshed.metadataNeedsRefresh,
            refreshedSyncStatus: refreshed.syncStatus
          });

          lookupSucceeded = true;

          // A normal database update refreshes metadata without renaming the
          // user's library entry. Official title data may be stored separately,
          // but the display title remains untouched.
          nextAnime[index] = setItemSyncStatus(preservePersonalAnimeData(existing, {
            ...existing,
            ...refreshed,
            title: existing.title,
            officialTitle:
              refreshed.officialTitle ||
              refreshed.title ||
              existing.officialTitle ||
              existing.title,
            titleSynonyms: [
              ...new Set([
                ...(existing.titleSynonyms || []),
                ...(refreshed.titleSynonyms || []),
                refreshed.title
              ])
            ].filter((value) => value && value !== existing.title)
          }), {
            metadata: true,
            poster: !needsArtworkRepair({ ...existing, ...refreshed }),
            dirty: Boolean(refreshed.metadataNeedsRefresh),
            studioLookupAttempted: Boolean(
              refreshed.studioLookupAttemptedAt ||
              refreshed.syncStatus?.studioLookupAttempted ||
              !existing.studio
            ),
            studioRepairAttempts: !existing.studio
              ? Number(existing.studioRepairAttempts ?? existing.syncStatus?.studioRepairAttempts ?? 0) + 1
              : Number(existing.studioRepairAttempts ?? existing.syncStatus?.studioRepairAttempts ?? 0),
            metadataError: '',
            lastMetadataSync: new Date().toISOString()
          });

          console.log('[Library Updater] Merged anime before save', {
            title,
            studio: nextAnime[index].studio || '',
            studios: nextAnime[index].studios || [],
            productionStudios: nextAnime[index].productionStudios || [],
            genres: nextAnime[index].genres || [],
            metadataNeedsRefresh: nextAnime[index].metadataNeedsRefresh,
            syncStatus: nextAnime[index].syncStatus
          });
        } catch (error) {
          console.warn('Metadata refresh failed:', title, error);

          const failedItem = nextAnime[index];
          const attempts = !failedItem.studio
            ? Number(failedItem.studioRepairAttempts ?? failedItem.syncStatus?.studioRepairAttempts ?? 0) + 1
            : Number(failedItem.studioRepairAttempts ?? failedItem.syncStatus?.studioRepairAttempts ?? 0);

          nextAnime[index] = setItemSyncStatus({
            ...failedItem,
            studioRepairAttempts: attempts
          }, {
            studioRepairAttempts: attempts,
            metadataError: error?.message || String(error),
            lastMetadataAttempt: new Date().toISOString(),
          });

          setSyncText(
            `Skipped ${title}: ${error?.message || 'Kitsu lookup failed'}. Moving to the next title...`
          );
        }

        const currentSnapshot = dataRef.current || data;
        const saved = await updateData({
          ...currentSnapshot,
          anime: nextAnime
        });

        const savedRow = (saved.anime || []).find((item) =>
          String(item.id) === String(nextAnime[index]?.id)
        );

        console.log('[Library Updater] Saved anime after database round-trip', {
          title,
          id: nextAnime[index]?.id || '',
          studio: savedRow?.studio || '',
          studios: savedRow?.studios || [],
          productionStudios: savedRow?.productionStudios || [],
          genres: savedRow?.genres || [],
          metadataNeedsRefresh: savedRow?.metadataNeedsRefresh,
          syncStatus: savedRow?.syncStatus
        });

        nextAnime = [...(saved.anime || nextAnime)];
        await sleep(lookupSucceeded ? (isRepair ? 500 : 150) : 35);
      }
    } else {
      setSyncText(`Local scan complete — ${alreadyReady} titles already have usable metadata.`);
      await sleep(500);
    }

    const latest = await animeRepository.getDatabase();

    let catalogResult;

    if (updateQueue.length > 0) {
      // Keep "Update Database" focused on the user's library first. The old
      // behavior immediately processed 50 recommendation-catalog entries, which
      // looked like the same wrong titles were being refreshed every run.
      const saved = await animeRepository.getDatabase();
      catalogResult = {
        saved,
        updated: 0,
        total: saved.catalog?.length || catalog.length,
        deferred: true
      };

      setSyncProgress({
        step: 2,
        stepTotal: 2,
        label: 'Library Metadata Repaired',
        processed: updateQueue.length,
        total: updateQueue.length,
        percent: 90,
        current: 'Recommendation catalog refresh deferred'
      });

      setSyncText(
        `Library metadata pass finished. Recommendation catalog refresh was deferred until the library is analytics-ready.`
      );
    } else {
      catalogResult = await updateCatalogMetadata({
        library: latest.anime || nextAnime,
        catalog: latest.catalog || catalog,
        repository: animeRepository,
        limit: 50,
        onProgress: ({ index, total, title }) => {
          setCatalogProgress({
            processed: index,
            total,
            title
          });

          setSyncText(`Building recommendation catalog ${index}/${total}: ${title}`);
        }
      });
    }

    const contentRatingResult = await updateCatalogContentRatings({
      library: catalogResult.saved.anime || latest.anime || nextAnime,
      catalog: catalogResult.saved.catalog || latest.catalog || catalog,
      repository: animeRepository,
      limit: 200,
      onProgress: ({ index, total, title }) => {
        setCatalogProgress({
          processed: index,
          total,
          title
        });

        setSyncText(`Checking catalog content ratings ${index}/${total}: ${title}`);
      }
    });

    catalogResult = {
      ...catalogResult,
      saved: contentRatingResult.saved,
      contentRatings: contentRatingResult
    };

    let savedData = catalogResult.saved;

    let genomeSummary = {
      supported: Boolean(window.JoeAnimeDB?.generateMissingGenomesForLibrary),
      covered: 0,
      missing: 0,
      generated: 0,
      tiers: {},
      status: 'not-run'
    };

    if (window.JoeAnimeDB?.generateMissingGenomesForLibrary) {
      const genomeAudit = auditGenomeCoverage(savedData.anime || []);
      genomeSummary = {
        supported: true,
        covered: genomeAudit.coveredCount,
        missing: genomeAudit.missingCount,
        generated: 0,
        tiers: genomeAudit.tiers,
        status: genomeAudit.missingCount ? 'generating' : 'complete'
      };
      const tierSummary = Object.entries(genomeAudit.tiers)
        .map(([tier, count]) => `${tier}: ${count}`)
        .join(', ');

      setSyncProgress({
        step: 2,
        stepTotal: 2,
        label: 'Checking Genome Coverage',
        processed: genomeAudit.coveredCount,
        total: genomeAudit.total,
        percent: genomeAudit.total
          ? Math.round((genomeAudit.coveredCount / genomeAudit.total) * 100)
          : 100,
        current: genomeAudit.missingCount
          ? `${genomeAudit.missingCount} missing — ${genomeAudit.coveredCount} already covered`
          : 'Every library title already has Genome coverage'
      });

      setSyncText(
        genomeAudit.missingCount
          ? `Genome audit: skipping ${genomeAudit.coveredCount} covered title(s)${tierSummary ? ` (${tierSummary})` : ''}. Generating ${genomeAudit.missingCount} missing Genome(s)...`
          : `Genome audit complete: all ${genomeAudit.coveredCount} title(s) are already covered${tierSummary ? ` (${tierSummary})` : ''}. Nothing to generate.`
      );

      // Genome generation is a bonus post-update task. It must never trap the
      // entire database updater if the Electron handler stalls or an AI call
      // never resolves.
      const GENOME_TIMEOUT_MS = 10 * 60 * 1000;

      try {
        if (!genomeAudit.missingCount) {
          console.info('Genome audit skipped generation; complete coverage:', genomeAudit.tiers);
        } else {
          const stopGenomeProgress = window.JoeAnimeDB.onGenomeGenerationProgress?.((progress = {}) => {
            const generated = Math.max(
              0,
              Math.min(genomeAudit.missingCount, Number(progress.processed || 0))
            );
            const overallProcessed = Math.min(
              genomeAudit.total,
              genomeAudit.coveredCount + generated
            );
            const overallPercent = genomeAudit.total
              ? Math.round((overallProcessed / genomeAudit.total) * 100)
              : 100;
            const currentTitle = progress.title || 'Generating missing Genome';

            setSyncProgress({
              step: 2,
              stepTotal: 2,
              label: 'Generating Missing Genomes',
              processed: overallProcessed,
              total: genomeAudit.total,
              percent: overallPercent,
              current: `${generated}/${genomeAudit.missingCount} generated — ${currentTitle}`
            });

            setSyncText(
              `Genome audit skipped ${genomeAudit.coveredCount} covered title(s). ` +
              `Generating ${generated}/${genomeAudit.missingCount}: ${currentTitle}`
            );
          });

          let genomeResult;
          try {
            genomeResult = await Promise.race([
              window.JoeAnimeDB.generateMissingGenomesForLibrary(genomeAudit.missing, {
                limit: 0,
                delayMs: 0
              }),
              new Promise((resolve) =>
                setTimeout(() => resolve({
                  ok: false,
                  timedOut: true,
                  error: 'Genome audit timed out'
                }), GENOME_TIMEOUT_MS)
              )
            ]);
          } finally {
            stopGenomeProgress?.();
          }

          if (!genomeResult?.ok) {
            if (genomeResult?.timedOut) {
              genomeSummary.status = 'timed-out';
              console.warn('Genome audit timed out; finishing database update normally.');
              setSyncText('Database updated. Genome audit timed out and was skipped for now.');
            } else {
              genomeSummary.status = 'failed';
              console.warn('Genome batch failed:', genomeResult);
              setSyncText(
                'Database updated, but Genome generation was skipped: ' +
                (genomeResult?.error || 'Unknown error')
              );
            }
          } else {
            genomeSummary.generated = genomeAudit.missingCount;
            genomeSummary.status = 'complete';
          }
        }
      } catch (error) {
        genomeSummary.status = 'failed';
        console.warn('Genome audit crashed; finishing database update normally.', error);
        setSyncText('Database updated. Genome audit failed and was skipped for now.');
      }
    }

    // Phase 2: after the existing updater has completed, use the same safe
    // identity rules as MAL import and Home to repair missing Kitsu links
    // across every library status. Ambiguous or failed titles never abort the
    // pass and never receive an untrusted Kitsu ID.
    const linkageSummary = await repairLibraryKitsuLinkages({
      library: savedData.anime || nextAnime,
      catalog: savedData.catalog || [],
      onProgress: ({ index, total, title }) => {
        const percent = total ? 90 + Math.round((index / total) * 9) : 99;
        setSyncProgress({
          step: 2,
          stepTotal: 2,
          label: 'Safe Kitsu Linkage Repair',
          processed: index,
          total,
          percent: Math.min(99, percent),
          current: title
        });
        setSyncText(`Checking Kitsu linkage ${index}/${total}: ${title}`);
      }
    });

    // Persist identity-only patches by JoeAnimeDB record ID. Never route this
    // maintenance pass through replaceAll/upsert dedupe: a linkage repair must
    // not replace, merge, or delete any library row.
    const linkageCountBefore = (savedData.anime || nextAnime).length;
    const newReviewUpdates = linkageSummary.updates.filter((update) => update.kind === 'review');
    const preexistingReviewCount = linkageSummary.needsReview - newReviewUpdates.length;
    let repairedPersisted = 0;
    let reviewPersisted = 0;
    let rejected = 0;

    for (let index = 0; index < linkageSummary.updates.length; index += 1) {
      const update = linkageSummary.updates[index];
      setSyncText(`Saving safe Kitsu linkage ${index + 1}/${linkageSummary.updates.length}`);
      const outcome = await animeRepository.updateAnimeIdentityLinkage(update.item);
      if (outcome?.ok) {
        if (update.kind === 'repaired') repairedPersisted += 1;
        else reviewPersisted += 1;
      } else {
        rejected += 1;
        console.warn('Safe Kitsu linkage update rejected:', {
          id: update.item?.id,
          title: update.item?.title,
          reason: outcome?.reason || 'unknown'
        });
      }
    }

    savedData = await animeRepository.getDatabase();
    const linkageCountAfter = (savedData.anime || []).length;
    if (linkageCountAfter !== linkageCountBefore) {
      throw new Error(
        `Safe Kitsu linkage repair changed library count from ${linkageCountBefore} to ${linkageCountAfter}.`
      );
    }

    linkageSummary.repaired = repairedPersisted;
    linkageSummary.needsReview = preexistingReviewCount + reviewPersisted;
    linkageSummary.unresolved += rejected;
    linkageSummary.rejected = rejected;
    linkageSummary.linkedAfter = (savedData.anime || []).filter((item) => Boolean(kitsuIdOf(item))).length;

    // Kitsu publishes an official MyAnimeList mapping for most linked anime.
    // Use only that provider-owned relationship: never infer a MAL ID from a
    // title, never overwrite one, and persist each patch by exact record ID.
    const malLinkageSummary = await repairLibraryMalLinkages({
      library: savedData.anime || [],
      onProgress: ({ index, total, title }) => {
        setSyncProgress({
          step: 2,
          stepTotal: 2,
          label: 'Safe MAL Linkage Repair',
          processed: index,
          total,
          percent: 99,
          current: title
        });
        setSyncText(`Checking official MAL mappings ${index}/${total}: ${title}`);
      }
    });

    const malLinkageCountBefore = (savedData.anime || []).length;
    let malRepairedPersisted = 0;
    let malRejected = 0;
    for (let index = 0; index < malLinkageSummary.updates.length; index += 1) {
      const update = malLinkageSummary.updates[index];
      setSyncText(`Saving safe MAL linkage ${index + 1}/${malLinkageSummary.updates.length}`);
      const outcome = await animeRepository.updateAnimeIdentityLinkage(update.item);
      if (outcome?.ok) malRepairedPersisted += 1;
      else {
        malRejected += 1;
        console.warn('Safe MAL linkage update rejected:', {
          id: update.item?.id,
          title: update.item?.title,
          reason: outcome?.reason || 'unknown'
        });
      }
    }

    savedData = await animeRepository.getDatabase();
    const malLinkageCountAfter = (savedData.anime || []).length;
    if (malLinkageCountAfter !== malLinkageCountBefore) {
      throw new Error(
        `Safe MAL linkage repair changed library count from ${malLinkageCountBefore} to ${malLinkageCountAfter}.`
      );
    }
    malLinkageSummary.repaired = malRepairedPersisted;
    malLinkageSummary.unresolved += malRejected;
    malLinkageSummary.rejected = malRejected;
    malLinkageSummary.linkedAfter = (savedData.anime || []).filter((item) => Boolean(malIdOf(item))).length;

    setSyncProgress({
      step: 2,
      stepTotal: 2,
      label: 'Update Complete',
      processed: savedData.anime?.length || 0,
      total: savedData.anime?.length || 0,
      percent: 100,
      current: 'Finished'
    });

    setData(savedData);

    const missing = (savedData.anime || nextAnime).filter((item) => needsArtworkRepair(item)).length;
    const summary = {
      completedAt: new Date().toISOString(),
      scanned: auditRows.length,
      skipped: alreadyReady,
      refreshed: updateQueue.length,
      missingArtwork: missing,
      catalog: {
        updated: Number(catalogResult.updated || 0),
        total: Number(catalogResult.total || 0),
        deferred: Boolean(catalogResult.deferred),
        contentRatingsUpdated: Number(catalogResult.contentRatings?.updated || 0),
        contentRatingsFailed: Number(catalogResult.contentRatings?.failed || 0),
        contentRatingsRemaining: Number(catalogResult.contentRatings?.remaining || 0)
      },
      genome: genomeSummary,
      kitsuLinkage: {
        scanned: linkageSummary.scanned,
        eligible: linkageSummary.eligible,
        skippedLinked: linkageSummary.skippedLinked,
        repaired: linkageSummary.repaired,
        needsReview: linkageSummary.needsReview,
        unresolved: linkageSummary.unresolved,
        linkedBefore: linkageSummary.linkedBefore,
        linkedAfter: linkageSummary.linkedAfter,
        rejected: linkageSummary.rejected
      },
      malLinkage: {
        scanned: malLinkageSummary.scanned,
        eligible: malLinkageSummary.eligible,
        skippedLinked: malLinkageSummary.skippedLinked,
        skippedNoKitsu: malLinkageSummary.skippedNoKitsu,
        repaired: malLinkageSummary.repaired,
        unresolved: malLinkageSummary.unresolved,
        collisions: malLinkageSummary.collisions,
        linkedBefore: malLinkageSummary.linkedBefore,
        linkedAfter: malLinkageSummary.linkedAfter,
        rejected: malLinkageSummary.rejected,
        requestFailed: malLinkageSummary.requestFailed
      }
    };

    const linkageText = `${linkageSummary.repaired} Kitsu link${linkageSummary.repaired === 1 ? '' : 's'} repaired, ` +
      `${linkageSummary.needsReview} need review, ${linkageSummary.unresolved} unresolved` +
      (linkageSummary.rejected ? ` (${linkageSummary.rejected} unsafe update${linkageSummary.rejected === 1 ? '' : 's'} rejected)` : '');
    const malLinkageText = `${malLinkageSummary.repaired} MAL ID${malLinkageSummary.repaired === 1 ? '' : 's'} added` +
      (malLinkageSummary.unresolved ? `, ${malLinkageSummary.unresolved} unresolved` : '');
    setSyncText(`Database updated — ${linkageText}; ${malLinkageText}${missing ? `; ${missing} poster(s) still need manual art` : ''}.`);

    await sleep(2200);
    document.body.style.cursor = 'default';
    setSyncing(false);
    setSyncText('');
    setSyncProgress(emptyProgress);
    return summary;
  }

  async function restoreBackup(database = {}) {
    setLoading(true);
    try {
      const restored = await animeRepository.restoreBackup(database);
      dataRef.current = restored;
      setData(restored);
      return restored;
    } finally {
      setLoading(false);
    }
  }

  async function resetDatabase() {
    setLoading(true);
    try {
      const reset = await animeRepository.reset();
      dataRef.current = reset;
      setData(reset);
      return reset;
    } finally {
      setLoading(false);
    }
  }

  return {
    data,
    anime,
    catalog,
    joeAI,
    filtered,
    stats,
    loading,
    query,
    setQuery,
    syncing,
    syncText,
    syncProgress,
    newUserMode,
    enableNewUserMode,
    exitNewUserMode,
    resetNewUserMode,
    updateData,
    updateAnime,
    updateCatalogAnime,
    recordJoeAIFeedback,
    setJoeAIPreference,
    deleteJoeAIFeedback,
    deleteJoeAIPreference,
    resetJoeAILearning,
    setJoeAIConversationContext,
    clearJoeAIConversationContext,
    deleteAnime,
    fetchMoreCatalogTitles,
    refreshLiveDiscover,
    syncMetadata,
    restoreBackup,
    resetDatabase
  };
}
