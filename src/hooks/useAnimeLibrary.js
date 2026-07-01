import { useEffect, useMemo, useState } from 'react';
import { countBy, filterAnime, score } from '../utils/animeUtils';
import { fetchMetadata, isRemoteCover, needsArtworkRepair, sleep } from '../services/metadata';
import { animeRepository } from '../repositories/animeRepository';
import { updateCatalogMetadata } from '../services/catalogService';
import seedData from '../data/animeSeed.json';

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

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
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

  async function updateData(next) {
    setData(next);
    const saved = await animeRepository.saveDatabase(next);
    setData(saved);
    return saved;
  }

  async function updateAnime(updatedAnime) {
    const saved = await animeRepository.updateAnime(updatedAnime);
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

  function setLibraryProgress({ processed, total, title }) {
    const percent = total ? Math.round((processed / total) * 50) : 0;

    setSyncProgress({
      step: 1,
      stepTotal: 2,
      label: 'Refreshing Library Metadata',
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
    const repairQueue = anime
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => needsArtworkRepair(item));

    const message = repairQueue.length
      ? `Repair ${repairQueue.length} missing poster(s), refresh metadata, and build recommendation catalog? This can take a few minutes.`
      : 'Refresh library metadata and build recommendation catalog? This can take a few minutes.';

    if (!confirm(message)) return;

    setSyncing(true);
    setSyncText('Starting update...');
    setSyncProgress(emptyProgress);

    let nextAnime = [...anime];

    const repairIndexes = repairQueue.map(({ index }) => index);
    const orderedIndexes = [
      ...repairIndexes,
      ...anime.map((_, index) => index).filter((index) => !repairIndexes.includes(index))
    ];

    for (let passIndex = 0; passIndex < orderedIndexes.length; passIndex++) {
      const index = orderedIndexes[passIndex];
      const title = nextAnime[index].title;
      const isRepair = needsArtworkRepair(nextAnime[index]);

      setLibraryProgress({
        processed: passIndex + 1,
        total: orderedIndexes.length,
        title
      });

      setSyncText(`${isRepair ? 'Repairing artwork' : 'Refreshing metadata'} ${passIndex + 1}/${orderedIndexes.length}: ${title}`);

      try {
        nextAnime[index] = await fetchMetadata(nextAnime[index]);
      } catch (error) {
        console.warn('Metadata failed:', title, error);
      }

      const saved = await updateData({ ...data, anime: nextAnime });
      nextAnime = [...(saved.anime || nextAnime)];
      await sleep(isRepair ? 1750 : 1250);
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

    setData(catalogResult.saved);

    const missing = nextAnime.filter((item) => needsArtworkRepair(item)).length;

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
        ? `Done — ${missing} poster(s) still need manual art. Catalog updated.`
        : 'Done — library and recommendation catalog refreshed!'
    );

    await sleep(1600);
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
    updateData,
    updateAnime,
    syncMetadata
  };
}
