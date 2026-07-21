import { useEffect, useMemo, useRef, useState } from 'react';
import { countBy, filterAnime, score } from '../utils/animeUtils';
import { isRemoteCover, needsArtworkRepair, sleep } from '../services/metadata';
import { hasManualMetadataOverride } from '../services/metadataProvider';
import { fetchKitsuMetadata } from '../services/kitsuProvider';
import { animeRepository } from '../repositories/animeRepository';
import { updateCatalogMetadata, fetchMoreCatalogTitles as fetchMoreCatalogPage, fetchLiveDiscoverCatalog } from '../services/catalogService';
import seedData from '../data/animeSeed.json';
import { createNewUserDemoDatabase } from '../services/newUserMode';


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
  // Library repair is deliberately Kitsu-only. This avoids Jikan 504/rate-limit
  // stalls while retaining Kitsu categories and production relationships.
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

    async function load() {
      try {
        if (localStorage.getItem('joeanime-new-user-mode') === 'true') {
          if (alive) setData(createNewUserDemoDatabase());
          return;
        }

        const loaded = await animeRepository.getDatabase();
        if (alive) setData(loaded);
      } catch (error) {
        console.error('Failed to load JoeAnimeDB database.', error);
        if (alive) setData(seedData);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => { alive = false; };
  }, []);

  const anime = data.anime || [];
  const catalog = data.catalog || [];

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
      const key = String(updatedAnime.id || updatedAnime.malId || updatedAnime.title);
      const exists = currentCatalog.some((item) =>
        String(item.id || item.malId || item.title) === key
      );

      const nextCatalog = exists
        ? currentCatalog.map((item) =>
            String(item.id || item.malId || item.title) === key
              ? { ...item, ...updatedAnime }
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

    const next = {
      ...data,
      anime: anime.filter((item) => String(item.id) !== String(id))
    };

    const saved = await animeRepository.saveDatabase(next);
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
          nextAnime[index] = setItemSyncStatus({
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
          }, {
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

    let savedData = catalogResult.saved;

    if (window.JoeAnimeDB?.generateMissingGenomesForLibrary) {
      setSyncProgress({
        step: 2,
        stepTotal: 2,
        label: 'Checking Genome Coverage',
        processed: 0,
        total: savedData.anime?.length || 0,
        percent: 95,
        current: 'Running local Genome audit'
      });

      setSyncText('Checking local Genome coverage...');

      // Genome generation is a bonus post-update task. It must never trap the
      // entire database updater if the Electron handler stalls or an AI call
      // never resolves.
      const GENOME_TIMEOUT_MS = 15000;

      try {
        const genomeResult = await Promise.race([
          window.JoeAnimeDB.generateMissingGenomesForLibrary(savedData.anime || [], {
            limit: 0,
            delayMs: 1200
          }),
          new Promise((resolve) =>
            setTimeout(() => resolve({
              ok: false,
              timedOut: true,
              error: 'Genome audit timed out'
            }), GENOME_TIMEOUT_MS)
          )
        ]);

        if (!genomeResult?.ok) {
          if (genomeResult?.timedOut) {
            console.warn('Genome audit timed out; finishing database update normally.');
            setSyncText('Database updated. Genome audit timed out and was skipped for now.');
          } else {
            console.warn('Genome batch failed:', genomeResult);
            setSyncText(
              'Database updated, but Genome generation was skipped: ' +
              (genomeResult?.error || 'Unknown error')
            );
          }
        }
      } catch (error) {
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

    setSyncProgress({
      step: 2,
      stepTotal: 2,
      label: 'Update Complete',
      processed: catalogResult.updated,
      total: catalogResult.total,
      percent: 100,
      current: ''
    });

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
  }

  return {
    data,
    anime,
    catalog,
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
    deleteAnime,
    fetchMoreCatalogTitles,
    refreshLiveDiscover,
    syncMetadata
  };
}
