import { kitsuIdOf, partitionContinuations } from './kitsuRelationshipService';

function normalizeStatus(value = '') {
  return String(value || '').toLowerCase().replace(/[\s_-]+/g, '');
}

function titleOf(item = {}) {
  return item.officialTitle || item.title || 'Unknown title';
}

function progressOf(item = {}) {
  const value = Number(
    item.watchedEpisodes
    ?? item.episodesWatched
    ?? item.episodeProgress
    ?? item.progress
    ?? item.watchedEpisodeCount
    ?? item.currentEpisode
    ?? 0
  );
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function selectWatchingTitles(library = []) {
  return [...library]
    .filter((item) => normalizeStatus(item.status) === 'watching')
    .sort((a, b) =>
      String(b.listUpdatedAt || b.updatedAt || '').localeCompare(String(a.listUpdatedAt || a.updatedAt || ''))
      || progressOf(b) - progressOf(a)
      || titleOf(a).localeCompare(titleOf(b))
    );
}

export function selectHomeDecisionData({
  library = [],
  continuations = [],
  directSequelCandidateCount = continuations.length
} = {}) {
  const watchingTitles = selectWatchingTitles(library);
  const { returning, missedSequels } = partitionContinuations(continuations);
  const kitsuLinkedTitles = library.filter((item) => Boolean(kitsuIdOf(item)));

  return {
    watchingTitles,
    returning,
    missedSequels,
    diagnostics: {
      libraryTitleCount: library.length,
      watchingCount: watchingTitles.length,
      kitsuLinkedTitleCount: kitsuLinkedTitles.length,
      directSequelCandidateCount: Number(directSequelCandidateCount || 0),
      returningCandidateCount: returning.length,
      missedSequelCandidateCount: missedSequels.length,
      watchingTitles: watchingTitles.map(titleOf),
      kitsuLinkedTitles: kitsuLinkedTitles.map((item) => ({
        title: titleOf(item),
        kitsuId: kitsuIdOf(item)
      })),
      returningTitles: returning.map(titleOf),
      missedSequelTitles: missedSequels.map(titleOf)
    }
  };
}
