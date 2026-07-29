import { sameAnimeIdentity } from './titleIdentity';

function metadataScore(item = {}) {
  return [
    item.malId || item.mal_id,
    item.cover || item.imageUrl,
    item.synopsis,
    item.studio,
    item.studios?.length,
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
    Number.isFinite(Number(item.joeScore)),
    Number.isFinite(Number(item.finalRank)),
    item.status,
    item.favorite,
    Number(item.rewatches || 0) > 0,
    item.notes
  ].filter(Boolean).length;
}

export function findDuplicateGroups(anime = []) {
  const groups = [];
  const used = new Set();

  for (let i = 0; i < anime.length; i += 1) {
    if (used.has(String(anime[i].id))) continue;
    const group = [anime[i]];

    for (let j = i + 1; j < anime.length; j += 1) {
      if (used.has(String(anime[j].id))) continue;
      if (group.some((item) => sameAnimeIdentity(item, anime[j]))) group.push(anime[j]);
    }

    if (group.length > 1) {
      group.forEach((item) => used.add(String(item.id)));
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
    return String(a.title || '').localeCompare(String(b.title || ''));
  })[0];
}

function firstUseful(group, field, fallback = '') {
  return group.map((item) => item?.[field]).find((value) => Array.isArray(value) ? value.length : Boolean(value)) ?? fallback;
}

export function mergeDuplicateGroup(group = [], keeperId) {
  const keeper = group.find((item) => String(item.id) === String(keeperId)) || suggestKeeper(group);
  const metadataWinner = [...group].sort((a, b) => metadataScore(b) - metadataScore(a))[0] || keeper;
  const personalWinner = [...group].sort((a, b) => personalScore(b) - personalScore(a))[0] || keeper;

  const notes = [...new Set(group.map((item) => String(item.notes || '').trim()).filter(Boolean))].join('\n\n');
  const synonyms = [...new Set(group.flatMap((item) => item.titleSynonyms || []).filter(Boolean))];
  const genres = [...new Set(group.flatMap((item) => item.genres || []).filter(Boolean))];
  const studios = [...new Set(group.flatMap((item) => item.studios || []).filter(Boolean))];

  const merged = {
    ...keeper,
    ...metadataWinner,
    id: keeper.id,
    title: metadataWinner.officialTitle || metadataWinner.title || keeper.title,
    officialTitle: metadataWinner.officialTitle || keeper.officialTitle || metadataWinner.title || keeper.title,
    japaneseTitle: firstUseful(group, 'japaneseTitle', ''),
    titleSynonyms: synonyms,
    malId: firstUseful(group, 'malId', firstUseful(group, 'mal_id', '')),
    cover: firstUseful(group, 'cover', firstUseful(group, 'imageUrl', '')),
    synopsis: firstUseful(group, 'synopsis', ''),
    studio: firstUseful(group, 'studio', ''),
    studios,
    year: firstUseful(group, 'year', ''),
    episodeCount: firstUseful(group, 'episodeCount', firstUseful(group, 'episodes', 0)),
    episodes: firstUseful(group, 'episodes', firstUseful(group, 'episodeCount', 0)),
    communityScore: firstUseful(group, 'communityScore', firstUseful(group, 'malScore', '')),
    malScore: firstUseful(group, 'malScore', firstUseful(group, 'communityScore', '')),
    genres,
    trailerUrl: firstUseful(group, 'trailerUrl', ''),
    joeScore: personalWinner.joeScore ?? keeper.joeScore,
    finalRank: personalWinner.finalRank ?? keeper.finalRank,
    status: personalWinner.status || keeper.status || metadataWinner.status || '',
    favorite: group.some((item) => Boolean(item.favorite)),
    rewatches: Math.max(...group.map((item) => Number(item.rewatches || 0))),
    notes,
    followed: group.some((item) => Boolean(item.followed)),
    mergedFrom: group.map((item) => item.title).filter(Boolean).join(' / '),
    metadataUpdatedAt: new Date().toISOString()
  };

  return {
    keeper,
    merged,
    removeIds: group.filter((item) => String(item.id) !== String(keeper.id)).map((item) => item.id)
  };
}

export function scanLibraryIntegrity(anime = []) {
  const duplicates = findDuplicateGroups(anime);
  const missingArtwork = anime.filter((item) => !String(item.cover || item.imageUrl || '').trim());
  const missingStudios = anime.filter((item) => !String(item.studio || '').trim() && !(item.studios || []).length);
  const missingGenres = anime.filter((item) => !(item.genres || []).length);
  const missingEpisodes = anime.filter((item) => !Number(item.episodeCount || item.episodes || 0));
  const missingScores = anime.filter((item) => !Number(item.communityScore || item.malScore || 0));
  const missingMalIds = anime.filter((item) => !(item.malId || item.mal_id));

  return {
    duplicates,
    duplicateEntries: duplicates.reduce((sum, group) => sum + group.length - 1, 0),
    missingArtwork,
    missingStudios,
    missingGenres,
    missingEpisodes,
    missingScores,
    missingMalIds,
    issueCount: duplicates.length + missingArtwork.length + missingStudios.length + missingGenres.length + missingEpisodes.length + missingScores.length
  };
}
