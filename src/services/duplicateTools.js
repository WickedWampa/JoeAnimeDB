function titleKey(title = '') {
  return String(title).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function allKeys(item = {}) {
  return [
    item.title,
    item.officialTitle,
    item.japaneseTitle,
    ...(item.titleSynonyms || [])
  ]
    .filter(Boolean)
    .map(titleKey)
    .filter(Boolean);
}

function likelySameAnime(a = {}, b = {}) {
  const aMal = a.malId || a.mal_id;
  const bMal = b.malId || b.mal_id;

  if (aMal && bMal && String(aMal) === String(bMal)) return true;

  const aKeys = allKeys(a);
  const bKeys = allKeys(b);

  if (aKeys.some((key) => bKeys.includes(key))) return true;

  for (const aKey of aKeys) {
    for (const bKey of bKeys) {
      const shorter = Math.min(aKey.length, bKey.length);
      if (shorter >= 6 && (aKey.startsWith(bKey) || bKey.startsWith(aKey))) return true;
    }
  }

  return false;
}

function metadataScore(item = {}) {
  return [
    item.malId,
    item.cover,
    item.synopsis,
    item.studio,
    item.year,
    item.episodeCount || item.episodes,
    item.communityScore || item.malScore,
    item.officialTitle,
    item.japaneseTitle,
    item.titleSynonyms?.length,
    item.trailerUrl,
    item.genres?.length
  ].filter(Boolean).length;
}

function personalScore(item = {}) {
  return [
    item.joeScore,
    item.finalRank,
    item.status,
    item.favorite,
    Number(item.rewatches || 0) > 0,
    item.notes
  ].filter(Boolean).length;
}

export function findDuplicateGroups(anime = []) {
  const groups = [];
  const used = new Set();

  for (let i = 0; i < anime.length; i++) {
    if (used.has(anime[i].id)) continue;

    const group = [anime[i]];

    for (let j = i + 1; j < anime.length; j++) {
      if (used.has(anime[j].id)) continue;
      if (likelySameAnime(anime[i], anime[j]) || group.some((item) => likelySameAnime(item, anime[j]))) {
        group.push(anime[j]);
      }
    }

    if (group.length > 1) {
      group.forEach((item) => used.add(item.id));
      groups.push(group);
    }
  }

  return groups;
}

export function suggestKeeper(group = []) {
  return [...group].sort((a, b) => {
    const personalDelta = personalScore(b) - personalScore(a);
    if (personalDelta) return personalDelta;

    const metadataDelta = metadataScore(b) - metadataScore(a);
    if (metadataDelta) return metadataDelta;

    return String(a.title).localeCompare(String(b.title));
  })[0];
}

export function mergeDuplicateGroup(group = [], keeperId) {
  const keeper = group.find((item) => String(item.id) === String(keeperId)) || suggestKeeper(group);
  const metadataWinner = [...group].sort((a, b) => metadataScore(b) - metadataScore(a))[0] || keeper;
  const personalWinner = [...group].sort((a, b) => personalScore(b) - personalScore(a))[0] || keeper;

  const merged = {
    ...keeper,
    ...metadataWinner,

    id: keeper.id,

    // Prefer official metadata title, but keep user's personal fields.
    title: metadataWinner.officialTitle || metadataWinner.title || keeper.title,
    officialTitle: metadataWinner.officialTitle || keeper.officialTitle || metadataWinner.title || keeper.title,
    japaneseTitle: metadataWinner.japaneseTitle || keeper.japaneseTitle || '',
    titleSynonyms: metadataWinner.titleSynonyms?.length ? metadataWinner.titleSynonyms : keeper.titleSynonyms || [],
    malId: metadataWinner.malId || keeper.malId || '',
    cover: metadataWinner.cover || keeper.cover || '',
    synopsis: metadataWinner.synopsis || keeper.synopsis || '',
    studio: metadataWinner.studio || keeper.studio || '',
    year: metadataWinner.year || keeper.year || '',
    episodeCount: metadataWinner.episodeCount || metadataWinner.episodes || keeper.episodeCount || keeper.episodes || 0,
    episodes: metadataWinner.episodes || metadataWinner.episodeCount || keeper.episodes || keeper.episodeCount || 0,
    communityScore: metadataWinner.communityScore || metadataWinner.malScore || keeper.communityScore || keeper.malScore || '',
    malScore: metadataWinner.malScore || metadataWinner.communityScore || keeper.malScore || keeper.communityScore || '',
    genres: metadataWinner.genres?.length ? metadataWinner.genres : keeper.genres || [],
    trailerUrl: metadataWinner.trailerUrl || keeper.trailerUrl || '',

    joeScore: personalWinner.joeScore ?? keeper.joeScore,
    finalRank: personalWinner.finalRank ?? keeper.finalRank,
    status: personalWinner.status || keeper.status || metadataWinner.status || '',
    favorite: Boolean(group.some((item) => item.favorite)),
    rewatches: Math.max(...group.map((item) => Number(item.rewatches || 0))),
    notes: group.map((item) => item.notes).filter(Boolean)[0] || keeper.notes || '',
    mergedFrom: group.map((item) => item.title).join(' / '),
    metadataUpdatedAt: new Date().toISOString()
  };

  return {
    keeper,
    merged,
    removeIds: group.filter((item) => String(item.id) !== String(keeper.id)).map((item) => item.id)
  };
}
