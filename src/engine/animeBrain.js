import { generateAnimeDNA, summarizeAnimeDNA } from './animeDNA';
import { getScore, normalizeStatus } from './statistics';
import {
  formatRecommendationAnswer,
  getRecommendationDiagnostics,
  recommendAnime
} from './recommendationEngine';

function formatList(items = []) {
  const clean = items.filter(Boolean);
  if (!clean.length) return 'Nothing found yet.';
  if (clean.length === 1) return clean[0];
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
}

export function createAnimeBrain(library = [], catalog = []) {
  const anime = Array.isArray(library) ? library : [];
  const animeCatalog = Array.isArray(catalog) ? catalog : [];
  const dna = generateAnimeDNA(anime);

  function topRated(limit = 5) {
    return [...anime]
      .filter((item) => getScore(item) > 0)
      .sort((a, b) => getScore(b) - getScore(a) || Number(a.finalRank || 9999) - Number(b.finalRank || 9999))
      .slice(0, limit);
  }

  function randomPick() {
    return anime.length ? anime[Math.floor(Math.random() * anime.length)] : null;
  }

  function rewatchPick() {
    return [...anime]
      .filter((item) => getScore(item) >= 8.8 || Number(item.rewatches || 0) > 0 || item.favorite)
      .sort((a, b) => {
        const aValue = getScore(a) + Number(a.rewatches || 0) * 0.6 + (a.favorite ? 1 : 0);
        const bValue = getScore(b) + Number(b.rewatches || 0) * 0.6 + (b.favorite ? 1 : 0);
        return bValue - aValue;
      })[0] || null;
  }

  function recommendationSeed(limit = 5) {
    return [...anime]
      .filter((item) => {
        const status = normalizeStatus(item.status);
        return !['watched', 'completed', 'dropped'].includes(status);
      })
      .sort((a, b) => getScore(b) - getScore(a) || Number(a.finalRank || 9999) - Number(b.finalRank || 9999))
      .slice(0, limit);
  }

  function recommendations(limit = 5) {
    return recommendAnime(anime, animeCatalog, { limit });
  }

  function catalogStatus() {
    const stats = getRecommendationDiagnostics(anime, animeCatalog);
    return [
      'Catalog diagnostics:',
      `Library titles: ${stats.libraryTotal}`,
      `Catalog titles loaded: ${stats.catalogTotal}`,
      `Unseen catalog candidates: ${stats.unseenTotal}`,
      `Enriched unseen candidates: ${stats.enrichedTotal}`
    ].join('\n');
  }

  function answer(question = '') {
    const lower = String(question).toLowerCase();

    if (lower.includes('catalog') || lower.includes('diagnostic') || lower.includes('debug')) {
      return catalogStatus();
    }

    if (lower.includes('dna') || lower.includes('taste')) return summarizeAnimeDNA(dna);

    if (lower.includes('genre')) {
      const genres = dna.topGenres.slice(0, 5).map((item) => item.name);
      return `Your strongest Anime DNA genres are ${formatList(genres)}.`;
    }

    if (lower.includes('studio')) {
      const studios = dna.topStudios.slice(0, 5).map((item) => item.name);
      return `Your strongest studio signals are ${formatList(studios)}.`;
    }

    if (lower.includes('rewatch')) {
      const pick = rewatchPick();
      if (!pick) return 'I need more scores or rewatches before I can pick a rewatch.';
      return `You should probably rewatch ${pick.title}.\nIt has a Joe score of ${getScore(pick).toFixed(1)} and ${Number(pick.rewatches || 0)} recorded rewatch(es).`;
    }

    if (lower.includes('top') || lower.includes('highest') || lower.includes('best')) {
      const titles = topRated().map((item) => `${item.title} (${getScore(item).toFixed(1)})`);
      return `Your top rated anime are ${formatList(titles)}.`;
    }

    if (lower.includes('average') || lower.includes('avg')) {
      return `Your average personal score is ${dna.averages.score.toFixed(2)} across ${dna.totals.rated} rated anime.`;
    }

    if (lower.includes('random')) {
      const pick = randomPick();
      if (!pick) return 'Your library is empty, so I cannot pick anything yet.';
      return `Random pick: ${pick.title}, rank #${pick.finalRank || '—'}, Joe score ${getScore(pick).toFixed(1)}.`;
    }

    if (lower.includes('recommend') || lower.includes('next') || lower.includes('watch') || lower.includes('new anime')) {
      const picks = recommendations(5);

      if (picks.length) {
        return `Based on your Anime DNA, these unseen catalog picks look strongest:\n\n${formatRecommendationAnswer(picks)}`;
      }

      const fallback = recommendationSeed();
      if (!fallback.length) {
        return `I need catalog entries before I can recommend unseen anime. Hit Update Database to build the recommendation catalog.\n\n${catalogStatus()}`;
      }

      return `I do not have catalog matches yet, but from your existing library queue try ${formatList(fallback.map((item) => `${item.title} (${getScore(item).toFixed(1)})`))}.\n\n${catalogStatus()}`;
    }

    if (lower.includes('bleach')) return 'Bleach is GOAT.\nAnime DNA confirms heavy Soul Reaper energy.';

    return 'Try asking about your Anime DNA, top genres, top studios, catalog status, top rated anime, average score, rewatches, recommendations, or a random pick.';
  }

  return {
    dna,
    topRated,
    randomPick,
    rewatchPick,
    recommendationSeed,
    recommendations,
    catalogStatus,
    answer
  };
}
