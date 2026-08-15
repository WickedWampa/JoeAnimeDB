function numericScore(item = {}) {
  return Number(item.joeScore ?? item.score ?? item.finalScore ?? item.rating ?? 0);
}

export function getTasteReadiness(library = []) {
  const anime = Array.isArray(library) ? library.filter(Boolean) : [];
  const completed = anime.filter(
    (item) => String(item.status || '').toLowerCase() === 'completed'
  ).length;
  const rated = anime.filter((item) => numericScore(item) > 0).length;
  const favorites = anime.filter((item) => Boolean(item.favorite)).length;
  const rewatches = anime.reduce(
    (sum, item) => sum + Math.max(0, Number(item.rewatches || 0)),
    0
  );
  const signalCount = completed + rated + favorites + rewatches;

  return {
    librarySize: anime.length,
    completed,
    rated,
    favorites,
    rewatches,
    signalCount,
    hasTasteData: signalCount > 0,
    hasPersonalizedTaste: completed >= 3 || rated >= 3 || favorites + rewatches >= 2
  };
}
