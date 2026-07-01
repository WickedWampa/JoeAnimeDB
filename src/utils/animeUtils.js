export function score(anime) {
  return Number(anime.joeScore ?? anime.rating ?? anime.predictedScore ?? 0);
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
        item.studio,
        item.status,
        item.priority,
        item.confidence,
        item.type,
        item.year,
        ...(item.genres || [])
      ].join(' ').toLowerCase();
      return !terms.length || terms.every((term) => haystack.includes(term));
    })
    .sort((a, b) => Number(a.finalRank || 9999) - Number(b.finalRank || 9999));
}

