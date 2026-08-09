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
  fetchLiveDiscoverCatalog
} from '../services/catalogService';
import seedData from '../data/animeSeed.json';
import { createNewUserDemoDatabase } from '../services/newUserMode';
import { auditGenomeCoverage } from '../ai/genome/runtime/autoGenomeRuntime';
import { preservePersonalAnimeData } from '../services/personalAnimeData';


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

export function useAnimeLibrary() {
  const [data, setData] = useState(() => ({ ...seedData, anime: [], catalog: [] }));
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
    let alive = true;
    let contentRatingTimer;

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
          if (alive) setData(createNewUserDemoDatabase());
          return;
        }

        const loaded = await animeRepository.getDatabase();
        if (alive) {
          if (requestedNewUserMode && window.JoeAnimeDB?.desktop) {
            localStorage.removeItem('joeanime-new-user-mode');
            setNewUserMode(false);
          }
          setData(loaded);
          startContentRatingBackfill(loaded);
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
      lastPrompt: ''
    }
  };

  async function enableNewUserMode() {
    localStorage.setItem('joeanime-new-user-mode', 'true');
    setNewUserMode(true);
    const demo = createNewUserDemoDatabase();
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
    const demo = createNewUserDemoDatabase();
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
    if (newUserMode) {
      const previousData = dataRef.current || { ...seedData, anime: [], catalog: [] };
      const currentAnime = previousData.anime || [];
      const malId = updatedAnime.malId ?? updatedAnime.mal_id;
      const existing = currentAnime.find((item) =>
        (malId && String(item.malId || '') === String(malId)) ||
        String(item.id) === String(updatedAnime.id)
      );

      const nextAnime = existing
        ? currentAnime.map((item) =>
            String(item.id) === String(existing.id)
              ? { ...item, ...updatedAnime, id: existing.id }
              : item
          )
        : [...currentAnime, updatedAnime];

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
    console.group(`[Metadata Repair Debug][Hook] ${updatedAnime.title || updatedAnime.id}`);
    console.log('REACT STATE BEFORE REPOSITORY UPDATE', {
      count: beforeAnime.length,
      incoming: {
        id: updatedAnime.id,
        title: updatedAnime.title,
        malId: updatedAnime.malId ?? updatedAnime.mal_id ?? null,
        kitsuId: updatedAnime.kitsuId ?? updatedAnime.kitsu_id ?? null
      }
    });

    const saved = await animeRepository.updateAnime(updatedAnime);
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
    const conversation = {
      lastRecommendations: Array.isArray(context.lastRecommendations)
        ? context.lastRecommendations.slice(0, 10)
        : [],
      lastReferencedTitle: String(context.lastReferencedTitle || ''),
      lastPrompt: String(context.lastPrompt || '')
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
            lastPrompt: ''
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
      genome: genomeSummary
    };

    setSyncText(
      missing
        ? `Done — ${alreadyReady} skipped locally, ${updateQueue.length} refreshed, ${missing} poster(s) still need manual art. Catalog/genomes updated.`
        : `Done — ${alreadyReady} skipped locally, ${updateQueue.length} refreshed. Catalog/genomes updated.`
    );

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
