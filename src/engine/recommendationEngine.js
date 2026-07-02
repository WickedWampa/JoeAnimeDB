import { generateAnimeDNA } from './animeDNA';
import { getScore, normalizeText } from './statistics';

function norm(value) {
  return normalizeText(value).toLowerCase();
}

function titleKey(title = '') {
  return String(title).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function scoreMap(entries = []) {
  const map = new Map();

  for (const entry of entries) {
    map.set(norm(entry.name), Number(entry.value || 0));
  }

  return map;
}

function maxMapValue(map) {
  return Math.max(...map.values(), 1);
}

function strength(value, max) {
  if (!value || !max) return 0;
  return value / max;
}

function getEpisodes(item) {
  return Number(item?.episodeCount || item?.episodes || 0);
}

function getCommunityScore(item) {
  return Number(item?.malScore || item?.communityScore || item?.score || 0);
}

export function getUnseenCatalog(library = [], catalog = []) {
  const watchedKeys = new Set(
    asList(library)
      .map((item) => titleKey(item.title))
      .filter(Boolean)
  );

  const seenCatalogKeys = new Set();

  return asList(catalog).filter((item) => {
    const key = titleKey(item.title);
    if (!key) return false;
    if (watchedKeys.has(key)) return false;
    if (seenCatalogKeys.has(key)) return false;
    seenCatalogKeys.add(key);
    return true;
  });
}

export function recommendAnime(library = [], catalog = [], options = {}) {
  const limit = options.limit || 5;
  const anime = asList(library);
  const candidates = getUnseenCatalog(anime, catalog);
  const dna = generateAnimeDNA(anime);

  const genreScores = scoreMap(dna.topGenres);
  const studioScores = scoreMap(dna.topStudios);
  const maxGenre = maxMapValue(genreScores);
  const maxStudio = maxMapValue(studioScores);
  const avgScore = Number(dna.averages?.score || 0);
  const preferredEpisodes = Number(dna.averages?.episodes || 0);

  return candidates
    .map((candidate) => {
      let matchScore = 0;
      const reasons = [];

      for (const genre of asList(candidate.genres)) {
        const genreStrength = strength(genreScores.get(norm(genre)), maxGenre);

        if (genreStrength > 0) {
          matchScore += genreStrength * 34;
          reasons.push(`matches your ${genre} taste`);
        }
      }

      const studioStrength = strength(studioScores.get(norm(candidate.studio)), maxStudio);
      if (studioStrength > 0) {
        matchScore += studioStrength * 24;
        reasons.push(`connects to your ${candidate.studio} studio signal`);
      }

      const communityScore = getCommunityScore(candidate);
      if (communityScore > 0) {
        matchScore += Math.min(communityScore, 10) * 2;
      }

      const candidateEpisodes = getEpisodes(candidate);
      if (preferredEpisodes > 0 && candidateEpisodes > 0) {
        const distance = Math.abs(preferredEpisodes - candidateEpisodes);
        const lengthFit = Math.max(0, 1 - distance / Math.max(preferredEpisodes, candidateEpisodes));
        matchScore += lengthFit * 12;

        if (lengthFit > 0.7) {
          reasons.push('fits your usual episode-count comfort zone');
        }
      }

      const strongFavorite = anime.find((item) => {
        const userScore = getScore(item);
        const genreOverlap = asList(item.genres).some((genre) =>
          asList(candidate.genres).map(norm).includes(norm(genre))
        );
        const sameStudio = norm(item.studio) && norm(item.studio) === norm(candidate.studio);

        return (Boolean(item.favorite) || userScore >= Math.max(avgScore, 8.5)) && (genreOverlap || sameStudio);
      });

      if (strongFavorite) {
        matchScore += 12;
        reasons.push(`shares DNA with ${strongFavorite.title}`);
      }

      if (candidate.cover) matchScore += 2;
      if (candidate.synopsis) matchScore += 2;
      if (candidate.year) matchScore += 1;

      return {
        ...candidate,
        match: Math.max(1, Math.min(99, Math.round(matchScore))),
        reasons: [...new Set(reasons)].slice(0, 3)
      };
    })
    .filter((candidate) => candidate.match > 1)
    .sort((a, b) => {
      if (b.match !== a.match) return b.match - a.match;
      return getCommunityScore(b) - getCommunityScore(a);
    })
    .slice(0, limit);
}

export function formatRecommendationAnswer(recommendations = []) {
  if (!recommendations.length) {
    return 'I need catalog entries before I can recommend unseen anime. Hit Update Database to build the recommendation catalog.';
  }

  return recommendations
    .map((item, index) => {
      const meta = [
        item.match ? `${item.match}% match` : null,
        item.year || null,
        item.episodes ? `${item.episodes} eps` : null
      ].filter(Boolean).join(' · ');

      const reasons = item.reasons?.length ? `\n   Why: ${item.reasons.join(', ')}.` : '';

      return `${index + 1}. ${item.title}${meta ? ` (${meta})` : ''}${reasons}`;
    })
    .join('\n\n');
}
