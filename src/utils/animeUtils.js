import { getAnimeStudios, getAnimeTasteSignals, productionSearchText } from './metadataAdapters';

export function hasUserScore(anime = {}) {
  return anime.joeScore !== undefined && anime.joeScore !== null && anime.joeScore !== '';
}

export function score(anime) {
  return Number(anime.joeScore ?? anime.rating ?? anime.predictedScore ?? 0);
}

export function scoreLabel(anime) {
  return hasUserScore(anime) ? score(anime).toFixed(1) : 'Not Rated';
}

export function compareAnimeByUserScore(a = {}, b = {}) {
  const aRated = hasUserScore(a);
  const bRated = hasUserScore(b);

  if (aRated !== bRated) return aRated ? -1 : 1;

  const scoreDifference = score(b) - score(a);
  if (scoreDifference !== 0) return scoreDifference;

  const legacyRankDifference =
    Number(a.finalRank || Number.MAX_SAFE_INTEGER) -
    Number(b.finalRank || Number.MAX_SAFE_INTEGER);
  if (legacyRankDifference !== 0) return legacyRankDifference;

  return String(a.officialTitle || a.title || '')
    .localeCompare(String(b.officialTitle || b.title || ''));
}

export function sortAnimeByUserScore(items = []) {
  return [...items].sort(compareAnimeByUserScore);
}

export function buildLiveRankMap(items = []) {
  return new Map(
    sortAnimeByUserScore(items)
      .map((item, index) => [String(item.id), index + 1])
  );
}

export function countBy(items) {
  const map = {};
  items.forEach((item) => {
    if (item) map[item] = (map[item] || 0) + 1;
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

export function initials(title) {
  return String(title || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join('')
    .toUpperCase();
}

export function filterAnime(anime, query) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);

  return [...anime]
    .filter((item) => {
      const haystack = [
        item.title,
        productionSearchText(item),
        item.status,
        item.priority,
        item.confidence,
        item.type,
        item.year,
        ...getAnimeTasteSignals(item),
        ...getAnimeStudios(item)
      ].join(' ').toLowerCase();

      return !terms.length || terms.every((term) => haystack.includes(term));
    })
    .sort((a, b) => Number(a.finalRank || 9999) - Number(b.finalRank || 9999));
}
