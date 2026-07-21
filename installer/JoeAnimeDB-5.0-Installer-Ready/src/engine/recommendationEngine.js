import { generateAnimeDNA } from './animeDNA';
import { getScore, normalizeText } from './statistics';

const SERIES_STOP_WORDS = new Set([
  'the', 'a', 'an', 'season', 'part', 'final', 'arc', 'episode', 'episodes',
  'ova', 'ona', 'movie', 'movies', 'tv', 'special', 'specials', 'cour',
  'chapter', 'chapters', 'saga', 'series', 'ii', 'iii', 'iv', 'v', '2', '3', '4', '5'
]);

const TITLE_ALIASES = {
  bleachtybw: 'bleachthousandyearbloodwar',
  aot: 'attackontitan',
  snk: 'attackontitan',
  hxh: 'hunterxhunter',
  jjk: 'jujutsukaisen',
  opm: 'onepunchman',
  fmab: 'fullmetalalchemistbrotherhood',
  fma: 'fullmetalalchemist',
  sao: 'swordartonline',
  rezero: 'rezerostartinglifeinanotherworld',
  tensura: 'thattimeigotreincarnatedasaslime',
  slime: 'thattimeigotreincarnatedasaslime',
  danmachi: 'isitwrongtotrytopickupgirlsinadungeon',
  demonslayer: 'kimetsunoyaiba',
  kimetsunoyaiba: 'demonslayerkimetsunoyaiba'
};

function norm(value) {
  return normalizeText(value).toLowerCase();
}

function titleKey(title = '') {
  const raw = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '');
  return TITLE_ALIASES[raw] || raw;
}

function titleTokens(title = '') {
  return String(title)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !SERIES_STOP_WORDS.has(token));
}

function tokenOverlapRatio(aTokens = [], bTokens = []) {
  if (!aTokens.length || !bTokens.length) return 0;
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  const overlap = [...a].filter((token) => b.has(token)).length;
  return overlap / Math.min(a.size, b.size);
}

function hasSameMalId(candidate, libraryItem) {
  const candidateId = candidate?.malId || candidate?.mal_id;
  const libraryId = libraryItem?.malId || libraryItem?.mal_id;
  return Boolean(candidateId && libraryId && String(candidateId) === String(libraryId));
}

function isLikelyWatched(candidate, libraryItem) {
  if (!candidate?.title || !libraryItem?.title) return false;
  if (hasSameMalId(candidate, libraryItem)) return true;

  const candidateKey = titleKey(candidate.title);
  const libraryKey = titleKey(libraryItem.title);

  if (!candidateKey || !libraryKey) return false;
  if (candidateKey === libraryKey) return true;

  if (candidateKey.includes(libraryKey) || libraryKey.includes(candidateKey)) {
    return Math.min(candidateKey.length, libraryKey.length) >= 6;
  }

  const candidateTokens = titleTokens(candidate.title);
  const libraryTokens = titleTokens(libraryItem.title);
  const overlap = tokenOverlapRatio(candidateTokens, libraryTokens);

  if (overlap >= 0.75 && Math.min(candidateTokens.length, libraryTokens.length) >= 2) return true;

  const sameFirstToken = candidateTokens[0] && candidateTokens[0] === libraryTokens[0];
  const hasSharedDistinctiveToken = candidateTokens.some((token) => token.length >= 6 && libraryTokens.includes(token));

  return Boolean(sameFirstToken && hasSharedDistinctiveToken);
}

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function scoreMap(entries = []) {
  const map = new Map();
  for (const entry of entries) map.set(norm(entry.name), Number(entry.value || 0));
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

function getYear(item) {
  return Number(item?.year || 0);
}

function getEra(year) {
  if (!year) return '';
  if (year < 1990) return 'classic';
  if (year < 2000) return '90s';
  if (year < 2010) return '2000s';
  if (year < 2020) return '2010s';
  return 'modern';
}

function hasMetadata(item) {
  return Boolean(
    item?.studio ||
    item?.year ||
    item?.synopsis ||
    getEpisodes(item) ||
    getCommunityScore(item) ||
    asList(item?.genres).length
  );
}

function favoriteWeight(item) {
  const baseScore = getScore(item);
  const rewatches = Number(item?.rewatches || 0);
  return baseScore + rewatches * 1.2 + (item?.favorite ? 2.5 : 0);
}

function getStrongTasteAnchors(library = []) {
  return [...asList(library)]
    .filter((item) => getScore(item) >= 8.5 || Number(item?.rewatches || 0) > 0 || item?.favorite)
    .sort((a, b) => favoriteWeight(b) - favoriteWeight(a))
    .slice(0, 18);
}

function overlapGenres(a = [], b = []) {
  const bSet = new Set(asList(b).map(norm));
  return asList(a).filter((genre) => bSet.has(norm(genre)));
}

function findClosestAnchor(candidate, anchors = []) {
  let best = null;

  for (const anchor of anchors) {
    const sharedGenres = overlapGenres(anchor.genres, candidate.genres);
    const sameStudio = norm(anchor.studio) && norm(anchor.studio) === norm(candidate.studio);
    const episodeDistance = Math.abs(getEpisodes(anchor) - getEpisodes(candidate));
    const episodeFit = getEpisodes(anchor) && getEpisodes(candidate)
      ? Math.max(0, 1 - episodeDistance / Math.max(getEpisodes(anchor), getEpisodes(candidate)))
      : 0;
    const sameEra = getEra(getYear(anchor)) && getEra(getYear(anchor)) === getEra(getYear(candidate));

    const closeness =
      sharedGenres.length * 8 +
      (sameStudio ? 10 : 0) +
      episodeFit * 5 +
      (sameEra ? 3 : 0) +
      favoriteWeight(anchor) * 0.6;

    if (!best || closeness > best.closeness) {
      best = { anchor, closeness, sharedGenres, sameStudio, episodeFit, sameEra };
    }
  }

  return best?.closeness > 8 ? best : null;
}

function preferredEra(library = []) {
  const counts = new Map();

  for (const item of asList(library)) {
    const era = getEra(getYear(item));
    if (!era) continue;
    const value = (counts.get(era) || 0) + Math.max(1, favoriteWeight(item) / 4);
    counts.set(era, value);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

function averagePreferredEpisodes(library = []) {
  const scored = asList(library)
    .filter((item) => getEpisodes(item) > 0 && getScore(item) > 0)
    .map((item) => ({ episodes: getEpisodes(item), weight: Math.max(1, favoriteWeight(item) / 3) }));

  const totalWeight = scored.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;

  return scored.reduce((sum, item) => sum + item.episodes * item.weight, 0) / totalWeight;
}

function matchBand(rawScore, metadataReady) {
  if (!metadataReady) return Math.max(35, Math.min(62, Math.round(rawScore)));

  const percent = 40 + (rawScore / (rawScore + 46)) * 58;
  return Math.max(50, Math.min(96, Math.round(percent)));
}

function matchLabel(match) {
  if (match >= 92) return 'Elite Match';
  if (match >= 84) return 'Strong Match';
  if (match >= 74) return 'Good Match';
  if (match >= 64) return 'Possible Match';
  return 'Catalog Match';
}

export function getUnseenCatalog(library = [], catalog = []) {
  const anime = asList(library);
  const seenCatalogKeys = new Set();

  return asList(catalog).filter((item) => {
    const key = titleKey(item.title);
    if (!key || seenCatalogKeys.has(key)) return false;

    const alreadyWatched = anime.some((libraryItem) => isLikelyWatched(item, libraryItem));
    if (alreadyWatched) return false;

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
  const preferredEpisodes = averagePreferredEpisodes(anime) || Number(dna.averages?.episodes || 0);
  const anchors = getStrongTasteAnchors(anime);
  const era = preferredEra(anime);

  return candidates
    .map((candidate) => {
      const metadataReady = hasMetadata(candidate);
      let rawScore = metadataReady ? 0 : 20;
      const reasons = [];
      const debug = [];

      if (!metadataReady) {
        reasons.push('metadata is still pending, so this is an early catalog pick');
        debug.push('+20 pending metadata starter pick');
      }

      for (const genre of asList(candidate.genres)) {
        const genreStrength = strength(genreScores.get(norm(genre)), maxGenre);
        if (genreStrength > 0) {
          const points = genreStrength * 16;
          rawScore += points;
          reasons.push(`${genre} is already part of your Anime DNA`);
          debug.push(`+${points.toFixed(1)} ${genre} genre signal`);
        }
      }

      const studioStrength = strength(studioScores.get(norm(candidate.studio)), maxStudio);
      if (studioStrength > 0) {
        const points = studioStrength * 14;
        rawScore += points;
        reasons.push(`${candidate.studio} connects to your studio history`);
        debug.push(`+${points.toFixed(1)} studio signal`);
      }

      const communityScore = getCommunityScore(candidate);
      if (communityScore > 0) {
        const points = Math.max(0, communityScore - 6.5) * 3.5;
        rawScore += points;
        debug.push(`+${points.toFixed(1)} community score`);
      }

      const candidateEpisodes = getEpisodes(candidate);
      if (preferredEpisodes > 0 && candidateEpisodes > 0) {
        const distance = Math.abs(preferredEpisodes - candidateEpisodes);
        const lengthFit = Math.max(0, 1 - distance / Math.max(preferredEpisodes, candidateEpisodes));
        const points = lengthFit * 7;
        rawScore += points;
        debug.push(`+${points.toFixed(1)} episode fit`);

        if (lengthFit > 0.72) {
          reasons.push('episode count fits your usual comfort zone');
        }
      }

      const candidateEra = getEra(getYear(candidate));
      if (era && candidateEra && era === candidateEra) {
        rawScore += 4;
        reasons.push(`${candidateEra} anime line up with your watch history`);
        debug.push('+4 era fit');
      }

      const closest = findClosestAnchor(candidate, anchors);
      if (closest) {
        const anchorScore = getScore(closest.anchor).toFixed(1);
        const points = Math.min(14, closest.closeness / 2.5);
        rawScore += points;
        debug.push(`+${points.toFixed(1)} closest anchor ${closest.anchor.title}`);

        if (closest.sharedGenres.length >= 2) {
          reasons.push(`shares ${closest.sharedGenres.slice(0, 2).join(' and ')} DNA with ${closest.anchor.title}`);
        } else if (closest.sameStudio) {
          reasons.push(`connects to ${closest.anchor.title}, one of your strong ${closest.anchor.studio} picks`);
        } else {
          reasons.push(`similar taste signal to ${closest.anchor.title} (${anchorScore})`);
        }
      }

      if (Number(candidate.rewatches || 0) > 0) {
        rawScore += Number(candidate.rewatches) * 2;
      }

      if (candidate.cover) rawScore += 1;
      if (candidate.synopsis) rawScore += 1.5;
      if (candidate.year) rawScore += 1;

      const match = matchBand(rawScore, metadataReady);

      return {
        ...candidate,
        metadataReady,
        rawScore: Math.round(rawScore * 10) / 10,
        match,
        matchLabel: matchLabel(match),
        reasons: [...new Set(reasons)].slice(0, 3),
        debug
      };
    })
    .filter((candidate) => candidate.match > 1)
    .sort((a, b) => {
      if (b.metadataReady !== a.metadataReady) return Number(b.metadataReady) - Number(a.metadataReady);
      if (b.match !== a.match) return b.match - a.match;
      return getCommunityScore(b) - getCommunityScore(a);
    })
    .slice(0, limit);
}

export function getRecommendationDiagnostics(library = [], catalog = []) {
  const unseen = getUnseenCatalog(library, catalog);
  return {
    libraryTotal: asList(library).length,
    catalogTotal: asList(catalog).length,
    unseenTotal: unseen.length,
    enrichedTotal: unseen.filter(hasMetadata).length
  };
}

export function formatRecommendationAnswer(recommendations = []) {
  if (!recommendations.length) {
    return 'I need catalog entries before I can recommend unseen anime. Hit Update Database to build the recommendation catalog.';
  }

  return recommendations
    .map((item, index) => {
      const meta = [
        `${item.match}%`,
        item.matchLabel,
        item.year || null,
        item.episodes ? `${item.episodes} eps` : null,
        item.metadataReady ? null : 'metadata pending'
      ].filter(Boolean).join(' · ');

      const reasons = item.reasons?.length
        ? `\nWhy I picked it:\n${item.reasons.map((reason) => `• ${reason}`).join('\n')}`
        : '';

      return `${index + 1}. ${item.title}\n${meta}${reasons}`;
    })
    .join('\n\n────────────────────\n\n');
}
