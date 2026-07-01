export function normalizeText(value) {
  return String(value || '').trim();
}

export function normalizeStatus(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, '');
}

export function getScore(anime) {
  return Number(anime?.joeScore ?? anime?.rating ?? anime?.predictedScore ?? 0);
}

export function isWatchedLike(anime) {
  const status = normalizeStatus(anime?.status);
  return ['watched', 'completed', 'watching'].includes(status);
}

export function addWeightedValue(map, key, value) {
  const cleanKey = normalizeText(key);
  if (!cleanKey) return;
  map[cleanKey] = Number((map[cleanKey] || 0) + value);
}

export function topEntries(map, limit = 10) {
  return Object.entries(map)
    .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function average(values) {
  const clean = values.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  if (!clean.length) return 0;
  return Number((clean.reduce((sum, value) => sum + value, 0) / clean.length).toFixed(2));
}

export function mostRewatched(anime, limit = 8) {
  return [...anime]
    .filter((item) => Number(item.rewatches || 0) > 0)
    .sort((a, b) => Number(b.rewatches || 0) - Number(a.rewatches || 0))
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      title: item.title,
      rewatches: Number(item.rewatches || 0),
      score: getScore(item)
    }));
}
