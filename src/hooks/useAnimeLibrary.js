import { useEffect, useMemo, useState } from 'react';
import { countBy, filterAnime, score } from '../utils/animeUtils';
import { fetchMetadata, isRemoteCover, needsArtworkRepair, sleep } from '../services/metadata';
import { animeRepository } from '../repositories/animeRepository';
import seedData from '../data/animeSeed.json';

export function useAnimeLibrary() {
  const [data, setData] = useState(() => ({ ...seedData, anime: [] }));
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncText, setSyncText] = useState('');

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
      avg: avg.toFixed(2),
      topGenre: genres[0]?.[0] || '—',
      rewatches,
      posters,
      databaseEngine: data.engine || animeRepository.engine,
      databasePath: data.path || ''
    };
  }, [anime, data.engine, data.path]);

  async function syncMetadata() {
    const repairQueue = anime
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => needsArtworkRepair(item));

    const message = repairQueue.length
      ? `Repair ${repairQueue.length} missing poster(s) first, then refresh metadata? This can take a few minutes.`
      : 'Refresh posters and metadata for all titles? This takes a few minutes.';

    if (!confirm(message)) return;

    setSyncing(true);
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

    const missing = nextAnime.filter((item) => needsArtworkRepair(item)).length;
    setSyncText(missing ? `Done — ${missing} poster(s) still need manual art.` : 'Done — poster wall repaired!');
    await sleep(1600);
    setSyncing(false);
    setSyncText('');
  }

  return {
    data,
    anime,
    filtered,
    stats,
    loading,
    query,
    setQuery,
    syncing,
    syncText,
    updateData,
    updateAnime,
    syncMetadata
  };
}
