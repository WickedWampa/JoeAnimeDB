export const PERSONAL_ANIME_FIELDS = [
  'id',
  'title',
  'joeScore',
  'rating',
  'finalRank',
  'status',
  'favorite',
  'rewatches',
  'notes',
  'priority',
  'personalTags',
  'userTags',
  'watchProgress',
  'episodesWatched',
  'startedAt',
  'completedAt',
  'addedAt',
  'dateAdded',
  'addedFrom'
];

export function preservePersonalAnimeData(original = {}, refreshed = {}) {
  const preserved = { ...refreshed };

  PERSONAL_ANIME_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(original, field)) {
      preserved[field] = original[field];
    }
  });

  return preserved;
}
