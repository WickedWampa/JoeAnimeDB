import { DNA_LIMITS, DNA_WEIGHTS } from './weights';
import {
  addWeightedValue,
  average,
  getScore,
  isWatchedLike,
  mostRewatched,
  normalizeStatus,
  topEntries
} from './statistics';

function influenceScore(anime) {
  const score = getScore(anime);
  const rewatches = Number(anime.rewatches || 0);
  const favorite = Boolean(anime.favorite || anime.favoriteRank);
  const status = normalizeStatus(anime.status);

  let influence = score * DNA_WEIGHTS.score;

  if (favorite) influence += DNA_WEIGHTS.favorite;
  if (rewatches > 0) influence += rewatches * DNA_WEIGHTS.rewatch;
  if (status === 'watching') influence += DNA_WEIGHTS.watching;
  if (status === 'completed' || status === 'watched') influence += DNA_WEIGHTS.completed;

  return Number(influence.toFixed(2));
}

export function generateAnimeDNA(library = []) {
  const anime = Array.isArray(library) ? library : [];
  const rated = anime.filter((item) => getScore(item) > 0);
  const watched = anime.filter(isWatchedLike);

  const genreMap = {};
  const studioMap = {};
  const statusMap = {};

  for (const item of rated) {
    const influence = influenceScore(item);

    for (const genre of item.genres || []) {
      addWeightedValue(genreMap, genre, influence);
    }

    addWeightedValue(studioMap, item.studio, influence);
    addWeightedValue(statusMap, item.status || 'Untracked', 1);
  }

  const scores = rated.map(getScore);
  const episodes = anime.map((item) => Number(item.episodeCount || item.episodes || 0));

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      anime: anime.length,
      rated: rated.length,
      watched: watched.length,
      favorites: anime.filter((item) => Boolean(item.favorite || item.favoriteRank)).length,
      rewatches: anime.reduce((sum, item) => sum + Number(item.rewatches || 0), 0)
    },
    averages: {
      score: average(scores),
      episodes: average(episodes)
    },
    topGenres: topEntries(genreMap, DNA_LIMITS.topGenres),
    topStudios: topEntries(studioMap, DNA_LIMITS.topStudios),
    statuses: topEntries(statusMap, 10),
    mostRewatched: mostRewatched(anime, DNA_LIMITS.topRewatches),
    weights: DNA_WEIGHTS
  };
}

export function summarizeAnimeDNA(dna) {
  if (!dna) return 'No Anime DNA generated yet.';

  const topGenre = dna.topGenres?.[0]?.name || 'Unknown';
  const topStudio = dna.topStudios?.[0]?.name || 'Unknown';
  const avgScore = dna.averages?.score || 0;

  return `Your Anime DNA leans toward ${topGenre}, with ${topStudio} as a major studio signal and an average personal score of ${avgScore}.`;
}
