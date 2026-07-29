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

function statusIsCompleted(item = {}) {
  return String(item.status || '').toLowerCase().replace(/\s+/g, '') === 'completed';
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
    (statusIsCompleted(item) ? 5 : 0) +
    Math.min(Number(item.episodeCount || item.episodes || 0), 500) / 25
  );
}

function signalStrength({ share, scoreLift, favoriteRate, rewatchRate }) {
  return Math.max(1, Math.min(100, Math.round(
    share * 45 +
    Math.max(0, scoreLift) * 8 +
    favoriteRate * 24 +
    rewatchRate * 18
  )));
}

export function explainGenreDNA({ genre = '', anime = [] } = {}) {
  const requestedKey = normalizeKey(genre);
  const canonicalGenre = anime
    .flatMap(genresOf)
    .find((name) => normalizeKey(name) === requestedKey) || normalizeName(genre);

  const matching = anime.filter((item) =>
    genresOf(item).some((name) => normalizeKey(name) === requestedKey)
  );

  if (!matching.length) {
    return {
      type: 'genreDNAExplanation',
      genre: canonicalGenre || genre || 'This genre',
      empty: true,
      title: `${canonicalGenre || genre || 'This genre'} is not measurable yet`,
      summary: `JoeAI could not find any library titles tagged ${canonicalGenre || genre || 'with that genre'}. Metadata refresh may be needed.`,
      metrics: [],
      contributors: [],
      companions: [],
      reasons: [],
      bottomLine: 'Once titles with this genre are in the library, JoeAI can explain the signal automatically.'
    };
  }

  const libraryRated = anime.map(scoreOf).filter(Boolean);
  const matchingRated = matching.map(scoreOf).filter(Boolean);
  const libraryAverage = libraryRated.length
    ? libraryRated.reduce((sum, value) => sum + value, 0) / libraryRated.length
    : 0;
  const genreAverage = matchingRated.length
    ? matchingRated.reduce((sum, value) => sum + value, 0) / matchingRated.length
    : 0;

  const completed = matching.filter(statusIsCompleted).length;
  const favorites = matching.filter((item) => item.favorite).length;
  const rewatches = matching.reduce((sum, item) => sum + Number(item.rewatches || 0), 0);
  const episodes = matching.reduce(
    (sum, item) => sum + Number(item.episodeCount || item.episodes || 0),
    0
  );
  const share = matching.length / Math.max(1, anime.length);
  const favoriteRate = favorites / matching.length;
  const rewatchRate = Math.min(1, rewatches / Math.max(1, matching.length * 2));
  const scoreLift = genreAverage && libraryAverage ? genreAverage - libraryAverage : 0;
  const strength = signalStrength({ share, scoreLift, favoriteRate, rewatchRate });

  const contributors = [...matching]
    .sort((a, b) => contributorWeight(b) - contributorWeight(a))
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      title: titleOf(item),
      score: scoreOf(item),
      rewatches: Number(item.rewatches || 0),
      favorite: Boolean(item.favorite),
      episodes: Number(item.episodeCount || item.episodes || 0),
      status: item.status || ''
    }));

  const companions = countBy(
    matching.flatMap((item) =>
      genresOf(item).filter((name) => normalizeKey(name) !== requestedKey)
    )
  ).slice(0, 5).map((entry) => ({
    ...entry,
    percent: Math.round((entry.count / matching.length) * 100)
  }));

  const reasons = [];
  reasons.push(`${matching.length} of ${anime.length} library titles carry this genre signal.`);
  if (genreAverage) {
    reasons.push(`Your average score here is ${genreAverage.toFixed(2)}${libraryAverage ? ` versus ${libraryAverage.toFixed(2)} across the library` : ''}.`);
  }
  if (favorites) reasons.push(`${favorites} favorite${favorites === 1 ? '' : 's'} reinforce it as more than a volume-only pattern.`);
  if (rewatches) reasons.push(`${rewatches} logged rewatch${rewatches === 1 ? '' : 'es'} show repeat attachment.`);
  if (episodes) reasons.push(`${episodes.toLocaleString()} episodes create meaningful time investment in this genre.`);
  if (companions.length) reasons.push(`It most often works for you beside ${companions.slice(0, 3).map((item) => item.name).join(', ')}.`);

  const strongestNames = contributors.slice(0, 3).map((item) => item.title);
  const bottomLine = [
    `${canonicalGenre} is a ${strength >= 80 ? 'core' : strength >= 60 ? 'strong' : 'developing'} Anime DNA signal.`,
    strongestNames.length ? `${strongestNames.join(', ')} provide the clearest personal evidence.` : '',
    companions.length ? `The genre lands best when paired with ${companions.slice(0, 3).map((item) => item.name.toLowerCase()).join(', ')}.` : ''
  ].filter(Boolean).join(' ');

  return {
    type: 'genreDNAExplanation',
    genre: canonicalGenre,
    title: `Why ${canonicalGenre} is part of your Anime DNA`,
    summary: `${canonicalGenre} appears in ${matching.length} title${matching.length === 1 ? '' : 's'} and has a ${strength}% JoeAI signal strength.`,
    strength,
    metrics: [
      { label: 'Titles', value: matching.length },
      { label: 'Completed', value: completed },
      { label: 'Average Score', value: genreAverage ? genreAverage.toFixed(2) : '—' },
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
