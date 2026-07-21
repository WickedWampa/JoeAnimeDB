const clean = (value = '') => String(value).trim();
const lower = (value = '') => clean(value).toLowerCase();
const scoreOf = (item = {}) => Number(item.joeScore ?? item.rating ?? item.finalScore ?? 0) || 0;
const communityScore = (item = {}) => Number(item.communityScore ?? item.malScore ?? item.score ?? 0) || 0;
const membersOf = (item = {}) => Number(item.members ?? item.memberCount ?? item.popularityMembers ?? 0) || 0;
const titleOf = (item = {}) => item.officialTitle || item.title || 'Unknown title';

function values(item = {}, fields = []) {
  return fields.flatMap((field) => {
    const value = item?.[field];
    if (Array.isArray(value)) {
      return value.map((entry) => typeof entry === 'string' ? entry : entry?.name || entry?.title).filter(Boolean);
    }
    return value ? [typeof value === 'string' ? value : value?.name || value?.title] : [];
  }).map(clean).filter(Boolean);
}

function studiosOf(item = {}) {
  return [...new Set([
    ...values(item, ['studio']),
    ...values(item, ['studios'])
  ].flatMap((value) => value.split(/\s*\/\s*|\s*,\s*/)).map(clean).filter(Boolean))];
}

function tagsOf(item = {}) {
  return [...new Set(values(item, ['genres', 'themes', 'tags', 'demographics']))];
}

const TRAITS = [
  { name: 'Kingdom Building', words: ['kingdom', 'nation building', 'civilization', 'territory', 'political fantasy', 'empire'] },
  { name: 'Strategic Battles', words: ['strategy', 'strategic', 'tactical', 'war', 'military', 'mind games'] },
  { name: 'Power Progression', words: ['leveling', 'training', 'power progression', 'weak to strong', 'cultivation'] },
  { name: 'Overpowered Protagonist', words: ['overpowered', 'op protagonist', 'demon lord', 'strongest'] },
  { name: 'Found Family', words: ['found family', 'companionship', 'family', 'guild'] },
  { name: 'Huge Worldbuilding', words: ['world building', 'worldbuilding', 'adventure', 'fantasy world', 'isekai'] },
  { name: 'Long Journey', words: ['journey', 'adventure', 'quest', 'long-running'] },
  { name: 'Psychological Pressure', words: ['psychological', 'thriller', 'suspense', 'mind game'] },
  { name: 'Emotional Payoff', words: ['drama', 'tragedy', 'emotional', 'romance', 'award winning'] },
  { name: 'Ensemble Cast', words: ['ensemble cast', 'team', 'guild', 'squad', 'group'] },
  { name: 'Dark Fantasy', words: ['dark fantasy', 'gore', 'horror', 'demons', 'survival'] },
  { name: 'Comfort Adventure', words: ['slice of life', 'comedy', 'healing', 'slow life', 'food'] }
];

function traitsOf(item = {}) {
  const haystack = lower([
    titleOf(item),
    item.synopsis,
    item.description,
    ...tagsOf(item)
  ].filter(Boolean).join(' '));

  return TRAITS
    .filter((trait) => trait.words.some((word) => haystack.includes(word)))
    .map((trait) => trait.name);
}

function addWeight(map, key, amount) {
  if (!key || !Number.isFinite(amount) || amount === 0) return;
  map.set(key, (map.get(key) || 0) + amount);
}

function signalWeight(item = {}) {
  const personal = scoreOf(item);
  const status = lower(item.status);
  let weight = 0.6;

  if (personal >= 9.5) weight += 7;
  else if (personal >= 9) weight += 5.5;
  else if (personal >= 8) weight += 3.5;
  else if (personal >= 7) weight += 1.5;
  else if (personal > 0 && personal <= 5) weight -= 5;
  else if (personal > 0 && personal < 7) weight -= 1.5;

  if (item.favorite) weight += 5;
  weight += Math.min(5, Number(item.rewatches || 0) * 2.25);
  if (status.includes('completed')) weight += 1;
  if (status.includes('dropped') || item.ignored) weight -= 7;
  if (status.includes('on hold')) weight -= 1;

  return weight;
}

export function buildTasteProfile(library = []) {
  const genres = new Map();
  const studios = new Map();
  const traits = new Map();
  const anchors = [];
  let weightedScoreTotal = 0;
  let weightedScoreMass = 0;

  library.forEach((item) => {
    const weight = signalWeight(item);
    tagsOf(item).forEach((tag) => addWeight(genres, lower(tag), weight));
    studiosOf(item).forEach((studio) => addWeight(studios, lower(studio), weight));
    traitsOf(item).forEach((trait) => addWeight(traits, trait, weight));

    const personal = scoreOf(item);
    if (personal > 0 && weight > 0) {
      weightedScoreTotal += personal * weight;
      weightedScoreMass += weight;
    }

    if (weight >= 5) anchors.push({ item, weight });
  });

  anchors.sort((a, b) => b.weight - a.weight || scoreOf(b.item) - scoreOf(a.item));

  const top = (map, limit = 8) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);

  return {
    genres,
    studios,
    traits,
    topGenres: top(genres),
    topStudios: top(studios),
    topTraits: top(traits),
    anchors: anchors.slice(0, 10),
    libraryAverage: weightedScoreMass ? weightedScoreTotal / weightedScoreMass : 0
  };
}

function reasonLabel(value = '') {
  return clean(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function scoreCandidate(item, profile) {
  let score = communityScore(item) * 2.4;
  const reasons = [];
  const warnings = [];

  const matchedGenres = tagsOf(item)
    .map((tag) => [tag, profile.genres.get(lower(tag)) || 0])
    .filter(([, value]) => value !== 0)
    .sort((a, b) => b[1] - a[1]);

  matchedGenres.forEach(([, value]) => { score += value * 1.7; });
  const positiveGenres = matchedGenres.filter(([, value]) => value > 1.5).slice(0, 2);
  const negativeGenres = matchedGenres.filter(([, value]) => value < -1.5).slice(0, 2);

  if (positiveGenres.length) {
    reasons.push(`${positiveGenres.map(([name]) => reasonLabel(name)).join(' + ')} matches your strongest taste signals`);
  }
  if (negativeGenres.length) {
    warnings.push(`Includes ${negativeGenres.map(([name]) => reasonLabel(name)).join(' / ')}, which you often rate lower`);
  }

  const matchedStudios = studiosOf(item)
    .map((studio) => [studio, profile.studios.get(lower(studio)) || 0])
    .sort((a, b) => b[1] - a[1]);

  matchedStudios.forEach(([, value]) => { score += value * 1.25; });
  if (matchedStudios[0]?.[1] > 2) reasons.push(`From ${matchedStudios[0][0]}, one of your strongest studio signals`);

  const matchedTraits = traitsOf(item)
    .map((trait) => [trait, profile.traits.get(trait) || 0])
    .sort((a, b) => b[1] - a[1]);

  matchedTraits.forEach(([, value]) => { score += value * 2.25; });
  matchedTraits.filter(([, value]) => value > 1.5).slice(0, 2).forEach(([trait]) => reasons.push(trait));

  const episodeCount = Number(item.episodeCount || item.episodes || 0);
  if (episodeCount >= 24 && profile.topTraits.some(([trait]) => trait === 'Long Journey')) score += 5;

  const metadataFields = [item.cover || item.imageUrl, item.synopsis, tagsOf(item).length, studiosOf(item).length, item.year];
  const metadataCompleteness = metadataFields.filter(Boolean).length / metadataFields.length;
  score -= (1 - metadataCompleteness) * 12;

  const confidence = Math.max(50, Math.min(98, Math.round(57 + score / 9)));

  return {
    item,
    score,
    confidence,
    reasons: [...new Set(reasons)].slice(0, 3),
    warnings: [...new Set(warnings)].slice(0, 2),
    traits: matchedTraits.map(([trait]) => trait)
  };
}

function identity(item = {}) {
  return String(item.malId || item.mal_id || item.id || lower(titleOf(item)).replace(/[^a-z0-9]+/g, ''));
}

function franchise(item = {}) {
  return lower(titleOf(item))
    .replace(/\b(season|part|cour|movie|film|ova|ona|special|final)\b\s*\d*/g, ' ')
    .replace(/\b\d+(st|nd|rd|th)?\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => !['the', 'a', 'an', 'of', 'and'].includes(word))
    .slice(0, 4)
    .join('|');
}

export function buildDiscoverPlan({ library = [], candidates = [], daySeed = 0 } = {}) {
  const profile = buildTasteProfile(library);
  const ranked = candidates.map((item) => scoreCandidate(item, profile)).sort((a, b) => b.score - a.score);
  const used = new Set();
  const usedFranchises = new Set();

  const take = (predicate, limit = 24, options = {}) => {
    const result = [];
    for (const entry of ranked) {
      if (!predicate(entry)) continue;
      const key = identity(entry.item);
      const family = franchise(entry.item);
      if (used.has(key)) continue;
      if (!options.allowFranchiseRepeat && usedFranchises.has(family)) continue;
      used.add(key);
      usedFranchises.add(family);
      result.push(entry.item);
      if (result.length >= limit) break;
    }
    return result;
  };

  const topPool = ranked.slice(0, Math.min(12, ranked.length));
  const daily = topPool.length ? topPool[Math.abs(daySeed) % topPool.length] : null;
  if (daily) {
    used.add(identity(daily.item));
    usedFranchises.add(franchise(daily.item));
  }

  const genreSet = (entry) => new Set(tagsOf(entry.item).map(lower));
  const isMovie = (entry) => lower(entry.item.type).includes('movie');
  const isCurrent = (entry) => entry.item.discoverBucket === 'current';
  const isUpcoming = (entry) => entry.item.discoverBucket === 'upcoming';
  const isHidden = (entry) => {
    const members = membersOf(entry.item);
    const popularity = Number(entry.item.popularity || 0);
    return communityScore(entry.item) >= 7.2 && ((members > 0 && members < 80000) || (members <= 0 && popularity >= 1500));
  };

  const topStudio = profile.topStudios[0]?.[0];
  const anchor = profile.anchors[0]?.item || null;
  const anchorTags = new Set(tagsOf(anchor || {}).map(lower));

  return {
    profile,
    ranked,
    dailyPick: daily,
    airingNow: take(isCurrent),
    comingSoon: take(isUpcoming),
    bestMatches: take(() => true),
    highestRated: take((entry) => communityScore(entry.item) > 0),
    becauseYouLoved: anchor ? take((entry) => tagsOf(entry.item).some((tag) => anchorTags.has(lower(tag))) || studiosOf(entry.item).some((studio) => studiosOf(anchor).map(lower).includes(lower(studio)))) : [],
    studioSpotlight: topStudio ? take((entry) => studiosOf(entry.item).map(lower).includes(topStudio)) : [],
    hiddenGems: take(isHidden),
    mindBenders: take((entry) => [...genreSet(entry)].some((genre) => ['psychological', 'mystery', 'sci-fi', 'suspense', 'supernatural'].includes(genre))),
    emotionalDamage: take((entry) => {
      const genres = genreSet(entry);
      return genres.has('drama') && (genres.has('romance') || genres.has('award winning') || genres.has('slice of life'));
    }),
    movieNight: take(isMovie),
    anchor,
    topStudio
  };
}
