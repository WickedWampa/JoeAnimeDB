import { useEffect, useMemo, useState } from 'react';
import { countBy, filterAnime, score } from '../utils/animeUtils';
import { isRemoteCover, needsArtworkRepair, sleep } from '../services/metadata';
import { fetchMetadataFromProvider, hasManualMetadataOverride } from '../services/metadataProvider';
import { animeRepository } from '../repositories/animeRepository';
import { updateCatalogMetadata } from '../services/catalogService';
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

function setItemSyncStatus(item = {}, patch = {}) {
  return {
    ...item,
    syncStatus: {
      ...(item.syncStatus || {}),
      ...patch
    }
  };
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
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncText, setSyncText] = useState('');
  const [syncProgress, setSyncProgress] = useState(emptyProgress);
  const [newUserMode, setNewUserMode] = useState(() => localStorage.getItem('joeanime-new-user-mode') === 'true');

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
      let nextSnapshot = null;

      setData((previousData) => {
        const currentAnime = previousData.anime || [];
        const exists = currentAnime.some((item) => String(item.id) === String(updatedAnime.id));

        const nextAnime = exists
          ? currentAnime.map((item) => String(item.id) === String(updatedAnime.id) ? updatedAnime : item)
          : [...currentAnime, updatedAnime];

        nextSnapshot = {
          ...previousData,
          anime: nextAnime
        };

        return nextSnapshot;
      });

      return nextSnapshot || {
        ...data,
        anime: [...(data.anime || []), updatedAnime]
      };
    }

    const saved = await animeRepository.updateAnime(updatedAnime);
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
      `• ${updateQueue.length} need Jikan metadata/artwork repair`,
      '',
      updateQueue.length
        ? 'Only missing/dirty titles will hit Jikan.'
        : 'No Jikan metadata refresh needed.',
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

        setLibraryProgress({
          processed: passIndex + 1,
          total: updateQueue.length,
          title,
          label: isRepair ? 'Repairing Artwork / Metadata' : 'Refreshing Missing Metadata'
        });

        setSyncText(`${isRepair ? 'Repairing artwork' : 'Refreshing missing metadata'} ${passIndex + 1}/${updateQueue.length}: ${title}`);

        try {
          const refreshed = await fetchMetadataFromProvider(nextAnime[index]);
          nextAnime[index] = setItemSyncStatus(refreshed, {
            metadata: true,
            poster: !needsArtworkRepair(refreshed),
            dirty: false,
            lastMetadataSync: new Date().toISOString()
          });
        } catch (error) {
          console.warn('Metadata failed:', title, error);
          nextAnime[index] = setItemSyncStatus(nextAnime[index], {
            metadataError: error?.message || String(error),
            lastMetadataAttempt: new Date().toISOString()
          });
        }

        const saved = await updateData({ ...data, anime: nextAnime });
        nextAnime = [...(saved.anime || nextAnime)];
        await sleep(isRepair ? 1750 : 1250);
      }
    } else {
      setSyncText(`Local scan complete — ${alreadyReady} titles skipped. No metadata calls needed.`);
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
        label: 'Generating Missing Genomes',
        processed: 0,
        total: savedData.anime?.length || 0,
        percent: 95,
        current: 'Local Genome audit first'
      });

      setSyncText('Checking local Genome coverage and generating only missing cards...');

      const genomeResult = await window.JoeAnimeDB.generateMissingGenomesForLibrary(savedData.anime || [], {
        limit: 0,
        delayMs: 1200
      });

      if (!genomeResult?.ok) {
        console.warn('Genome batch failed:', genomeResult);
        setSyncText('Catalog updated, but Genome generation failed: ' + (genomeResult?.error || 'Unknown error'));
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
    deleteAnime,
    syncMetadata
  };
}
