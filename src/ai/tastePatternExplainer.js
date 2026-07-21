function normalizeName(value = '') {
  if (value && typeof value === 'object') {
    return String(value.name || value.title || value.label || '').trim();
  }
  return String(value || '').trim();
}

function normalizeKey(value = '') {
  return normalizeName(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function titleOf(item = {}) {
  return item.officialTitle || item.title || 'Unknown title';
}

function scoreOf(item = {}) {
  const value = Number(item.joeScore ?? item.rating ?? item.finalScore ?? item.score ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function episodeCountOf(item = {}) {
  const value = Number(item.episodeCount ?? item.episodes ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function genresOf(item = {}) {
  const values = Array.isArray(item.genres)
    ? item.genres
    : String(item.genres || '').split(',');

  const seen = new Set();
  return values
    .map(normalizeName)
    .filter(Boolean)
    .filter((name) => {
      const key = normalizeKey(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function completed(item = {}) {
  return String(item.status || '').toLowerCase().replace(/\s+/g, '') === 'completed';
}

function titleCase(value = '') {
  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function countBy(values = []) {
  const map = new Map();
  values.forEach((value) => {
    const name = normalizeName(value);
    const key = normalizeKey(name);
    if (!key) return;
    const current = map.get(key) || { name, count: 0 };
    current.count += 1;
    map.set(key, current);
  });
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function contributorWeight(item = {}) {
  return (
    scoreOf(item) * 8 +
    Number(item.rewatches || 0) * 14 +
    (item.favorite ? 18 : 0) +
    (completed(item) ? 5 : 0) +
    Math.min(episodeCountOf(item), 500) / 18
  );
}

function phraseProfile(pattern = '', anime = []) {
  const lower = String(pattern || '').toLowerCase().trim();
  const libraryGenres = [...new Map(
    anime.flatMap(genresOf).map((genre) => [normalizeKey(genre), genre])
  ).entries()];

  const requestedGenreKeys = libraryGenres
    .filter(([key, name]) => {
      const words = String(name).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      return lower.includes(String(name).toLowerCase()) || words.every((word) => lower.includes(word));
    })
    .map(([key]) => key);

  // Natural phrases often use plurals that do not exactly match metadata labels.
  const aliases = [
    ['adventure', ['adventure', 'adventures']],
    ['fantasy', ['fantasy']],
    ['action', ['action']],
    ['comedy', ['comedy', 'funny', 'humor', 'humour']],
    ['romance', ['romance', 'romantic']],
    ['drama', ['drama', 'dramatic']],
    ['horror', ['horror', 'scary', 'creepy']],
    ['mystery', ['mystery', 'mysteries']],
    ['psychological', ['psychological', 'mind games']],
    ['sports', ['sports', 'competition']],
    ['mecha', ['mecha', 'robots']],
    ['sliceoflife', ['slice of life', 'sol']],
    ['scifi', ['sci fi', 'sci-fi', 'science fiction']],
    ['supernatural', ['supernatural']],
    ['isekai', ['isekai']]
  ];

  aliases.forEach(([genreKey, phrases]) => {
    if (phrases.some((phrase) => lower.includes(phrase))) requestedGenreKeys.push(genreKey);
  });

  const uniqueGenreKeys = [...new Set(requestedGenreKeys)];
  const wantsLong = /\b(long|long-form|long form|long-running|long running|epic|extended)\b/.test(lower);
  const wantsShort = /\b(short|quick|bite-sized|bite sized)\b/.test(lower);
  const wantsDark = /\b(dark|grim|gritty|brutal)\b/.test(lower);
  const wantsComfort = /\b(comfort|cozy|wholesome|familiar)\b/.test(lower);

  return { lower, uniqueGenreKeys, wantsLong, wantsShort, wantsDark, wantsComfort };
}

function itemMatchesProfile(item, profile, { relaxed = false } = {}) {
  const genreKeys = genresOf(item).map(normalizeKey);
  const genreMatches = profile.uniqueGenreKeys.filter((key) => genreKeys.includes(key)).length;

  if (profile.uniqueGenreKeys.length) {
    if (!relaxed && genreMatches !== profile.uniqueGenreKeys.length) return false;
    if (relaxed && genreMatches < 1) return false;
  }

  const episodes = episodeCountOf(item);
  if (profile.wantsLong && episodes && episodes < 24 && !relaxed) return false;
  if (profile.wantsShort && episodes > 24 && !relaxed) return false;

  const searchable = [
    item.synopsis,
    item.description,
    item.notes,
    ...(item.themes || []),
    ...(item.tags || []),
    ...(item.genomeTraits || [])
  ].filter(Boolean).join(' ').toLowerCase();

  if (profile.wantsDark && !relaxed) {
    const darkSignal = /dark|grim|horror|violent|brutal|psychological|traged/.test(searchable) ||
      genreKeys.some((key) => ['horror', 'psychological', 'thriller'].includes(key));
    if (!darkSignal) return false;
  }

  if (profile.wantsComfort && !relaxed) {
    const comfortSignal = Boolean(item.favorite) || Number(item.rewatches || 0) > 0 ||
      /comfort|cozy|wholesome|family|friendship/.test(searchable);
    if (!comfortSignal) return false;
  }

  return true;
}

export function explainTastePattern({ pattern = '', anime = [] } = {}) {
  const cleanPattern = String(pattern || '').trim().replace(/[?.!]+$/g, '');
  const label = titleCase(cleanPattern || 'This Pattern');
  const profile = phraseProfile(cleanPattern, anime);

  let matching = anime.filter((item) => itemMatchesProfile(item, profile));
  let relaxed = false;

  if (!matching.length) {
    matching = anime.filter((item) => itemMatchesProfile(item, profile, { relaxed: true }));
    relaxed = true;
  }

  if (!matching.length) {
    return {
      type: 'genreDNAExplanation',
      genre: label,
      empty: true,
      title: `Why ${label} connects to your Anime DNA`,
      summary: `JoeAI could not find enough matching metadata for “${cleanPattern}” yet.`,
      metrics: [],
      contributors: [],
      companions: [],
      reasons: [
        'This is a taste-pattern question, not an anime title lookup.',
        'A metadata refresh or more rated titles may give JoeAI enough evidence to explain it.'
      ],
      bottomLine: `JoeAI understands “${cleanPattern}” as a taste pattern, but the current library does not provide enough measurable evidence yet.`
    };
  }

  const libraryRated = anime.map(scoreOf).filter(Boolean);
  const matchingRated = matching.map(scoreOf).filter(Boolean);
  const libraryAverage = libraryRated.length
    ? libraryRated.reduce((sum, value) => sum + value, 0) / libraryRated.length
    : 0;
  const patternAverage = matchingRated.length
    ? matchingRated.reduce((sum, value) => sum + value, 0) / matchingRated.length
    : 0;

  const completedCount = matching.filter(completed).length;
  const favorites = matching.filter((item) => item.favorite).length;
  const rewatches = matching.reduce((sum, item) => sum + Number(item.rewatches || 0), 0);
  const episodes = matching.reduce((sum, item) => sum + episodeCountOf(item), 0);
  const share = matching.length / Math.max(1, anime.length);
  const scoreLift = patternAverage && libraryAverage ? patternAverage - libraryAverage : 0;
  const strength = Math.max(1, Math.min(100, Math.round(
    share * 42 +
    Math.max(0, scoreLift) * 9 +
    (favorites / matching.length) * 25 +
    Math.min(1, rewatches / Math.max(1, matching.length * 2)) * 20 +
    (profile.wantsLong ? Math.min(12, episodes / 400) : 0)
  )));

  const contributors = [...matching]
    .sort((a, b) => contributorWeight(b) - contributorWeight(a))
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      title: titleOf(item),
      score: scoreOf(item),
      rewatches: Number(item.rewatches || 0),
      favorite: Boolean(item.favorite),
      episodes: episodeCountOf(item),
      status: item.status || ''
    }));

  const matchedGenreKeys = new Set(profile.uniqueGenreKeys);
  const companions = countBy(
    matching.flatMap((item) => genresOf(item).filter((genre) => !matchedGenreKeys.has(normalizeKey(genre))))
  ).slice(0, 5).map((entry) => ({
    ...entry,
    percent: Math.round((entry.count / matching.length) * 100)
  }));

  const reasons = [
    `${matching.length} library title${matching.length === 1 ? '' : 's'} match the “${cleanPattern}” pattern${relaxed ? ' when JoeAI broadens the match slightly' : ''}.`
  ];

  if (patternAverage) {
    reasons.push(`Your average score for these titles is ${patternAverage.toFixed(2)}${libraryAverage ? ` versus ${libraryAverage.toFixed(2)} across the full library` : ''}.`);
  }
  if (favorites) reasons.push(`${favorites} favorite${favorites === 1 ? '' : 's'} make this a preference signal, not just something you happen to watch.`);
  if (rewatches) reasons.push(`${rewatches} rewatch${rewatches === 1 ? '' : 'es'} show repeat attachment to this type of experience.`);
  if (episodes) reasons.push(`${episodes.toLocaleString()} episodes represent substantial time investment.`);
  if (profile.wantsLong) reasons.push('Long-running titles are weighted more heavily because sustained commitment is one of the clearest personal signals.');
  if (companions.length) reasons.push(`This pattern most often overlaps with ${companions.slice(0, 3).map((item) => item.name).join(', ')} in your library.`);

  const strongest = contributors.slice(0, 3).map((item) => item.title);
  const bottomLine = [
    `${label} is a ${strength >= 80 ? 'core' : strength >= 60 ? 'strong' : 'developing'} taste pattern for you.`,
    strongest.length ? `${strongest.join(', ')} provide the clearest evidence.` : '',
    profile.wantsLong ? 'Your library shows that time spent inside an expanding world matters almost as much as genre itself.' : '',
    companions.length ? `It lands best when paired with ${companions.slice(0, 3).map((item) => item.name.toLowerCase()).join(', ')}.` : ''
  ].filter(Boolean).join(' ');

  return {
    type: 'genreDNAExplanation',
    genre: label,
    title: `Why you like ${label}`,
    summary: `${matching.length} titles produce a ${strength}% JoeAI signal for this pattern.`,
    strength,
    metrics: [
      { label: 'Titles', value: matching.length },
      { label: 'Completed', value: completedCount },
      { label: 'Average Score', value: patternAverage ? patternAverage.toFixed(2) : '—' },
      { label: 'Favorites', value: favorites },
      { label: 'Rewatches', value: rewatches },
      { label: 'Episodes', value: episodes.toLocaleString() }
    ],
    contributors,
    companions,
    reasons,
    bottomLine
  };
}
