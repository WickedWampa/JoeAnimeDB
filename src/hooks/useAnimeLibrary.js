import { useEffect, useMemo, useRef, useState } from 'react';
import { countBy, filterAnime, score } from '../utils/animeUtils';
import { isRemoteCover, needsArtworkRepair, sleep } from '../services/metadata';
import { fetchMetadataFromProvider, hasManualMetadataOverride } from '../services/metadataProvider';
import { animeRepository } from '../repositories/animeRepository';
import { updateCatalogMetadata, fetchMoreCatalogTitles as fetchMoreCatalogPage } from '../services/catalogService';
import seedData from '../data/animeSeed.json';
import { createNewUserDemoDatabase } from '../services/newUserMode';


function hasGoodMetadata(item = {}) {
  return Boolean(
    item.malId ||
    item.officialTitle ||
    item.synopsis ||
    item.description ||
    item.studio ||
    item.year ||
    item.episodeCount ||
    item.episodes ||
    (Array.isArray(item.genres) && item.genres.length)
  );
}

function metadataIsStale(item = {}) {
  if (!item.metadataUpdatedAt) return false;

  const updated = new Date(item.metadataUpdatedAt).getTime();
  if (!Number.isFinite(updated)) return false;

  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return Date.now() - updated > thirtyDays && !hasGoodMetadata(item);
}

function shouldRefreshMetadata(item = {}) {
  return hasManualMetadataOverride(item) || needsArtworkRepair(item) || !hasGoodMetadata(item) || metadataIsStale(item) || item.syncStatus?.dirty;
}

const METADATA_LOOKUP_TIMEOUT_MS = 22000;
const METADATA_BASE_DELAY_MS = 1450;
const METADATA_RETRY_DELAYS_MS = [0, 2500, 5500];

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
  let lastError = null;

  for (let attempt = 0; attempt < METADATA_RETRY_DELAYS_MS.length; attempt++) {
    const waitMs = METADATA_RETRY_DELAYS_MS[attempt];

    if (waitMs) {
      await sleep(waitMs);
    }

    try {
      return await withTimeout(
        fetchMetadataFromProvider(item),
        METADATA_LOOKUP_TIMEOUT_MS,
        `Metadata lookup for ${item.title || 'title'}`
      );
    } catch (error) {
      lastError = error;

      const status = Number(
        error?.status ||
        String(error?.message || '').match(/\b(429|500|502|503|504)\b/)?.[1] ||
        0
      );

      const retryable = [429, 500, 502, 503, 504].includes(status);

      if (!retryable || attempt === METADATA_RETRY_DELAYS_MS.length - 1) {
        throw error;
      }

      console.warn(
        `Retryable Jikan error for ${item.title || 'title'}: ${status}. Backing off before retry.`
      );
    }
  }

  throw lastError || new Error('Metadata lookup failed');
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

  async function updateData(next) {
    setData(next);

    if (newUserMode) {
      return next;
    }

    const saved = await animeRepository.saveDatabase(next);
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

    const saved = await animeRepository.updateAnime(updatedAnime);
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
        ? 'Only those titles will contact Jikan.'
        : 'No Jikan metadata calls are needed.',
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

        try {
          const existing = nextAnime[index];
          const refreshed = await fetchMetadataWithBackoff(existing);

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
            dirty: false,
            metadataError: '',
            lastMetadataSync: new Date().toISOString()
          });
        } catch (error) {
          console.warn('Metadata refresh failed:', title, error);

          nextAnime[index] = setItemSyncStatus(nextAnime[index], {
            metadataError: error?.message || String(error),
            lastMetadataAttempt: new Date().toISOString(),
          });

          setSyncText(
            `Skipped ${title}: ${error?.message || 'metadata lookup failed'}. Continuing...`
          );
        }

        const saved = await updateData({ ...data, anime: nextAnime });
        nextAnime = [...(saved.anime || nextAnime)];
        await sleep(isRepair ? 1800 : METADATA_BASE_DELAY_MS);
      }
    } else {
      setSyncText(`Local scan complete — ${alreadyReady} titles already have usable metadata.`);
      await sleep(500);
    }

    const latest = await animeRepository.getDatabase();

    const catalogResult = await updateCatalogMetadata({
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
      const GENOME_TIMEOUT_MS = 30000;

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
    syncMetadata
  };
}
