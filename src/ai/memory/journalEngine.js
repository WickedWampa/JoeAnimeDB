function titleOf(item = {}) {
  return item.officialTitle || item.title || 'Unknown title';
}

export function buildMemoryJournal(library = [], previousProfile = null, nextProfile = null) {
  const now = new Date().toISOString();
  const completed = library.filter((item) => String(item.status || '').toLowerCase() === 'completed').map(titleOf).slice(0, 12);
  const watching = library.filter((item) => String(item.status || '').toLowerCase() === 'watching').map(titleOf).slice(0, 12);
  const favorites = library.filter((item) => item.favorite).map(titleOf).slice(0, 12);
  const rewatched = library.filter((item) => Number(item.rewatches || 0) > 0).map((item) => `${titleOf(item)} (${item.rewatches}x)`).slice(0, 12);

  const learned = (nextProfile?.strongest || [])
    .slice(0, 5)
    .map((dimension) => `${dimension.label}: ${dimension.score}% confidence ${dimension.confidence}%`);

  return {
    createdAt: now,
    type: 'profile_snapshot',
    summary: 'JoeAI generated a taste profile snapshot from the current library.',
    completed,
    watching,
    favorites,
    rewatched,
    learned
  };
}
