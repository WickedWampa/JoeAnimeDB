const NUMBER_WORDS = new Map([
  ['first', '1'], ['second', '2'], ['third', '3'], ['fourth', '4'],
  ['fifth', '5'], ['sixth', '6'], ['seventh', '7'], ['eighth', '8'],
  ['ninth', '9'], ['tenth', '10']
]);

function foldText(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSeasonWords(value = '') {
  let text = ` ${foldText(value)} `;

  for (const [word, number] of NUMBER_WORDS.entries()) {
    text = text.replace(new RegExp(`\\b${word}\\s+season\\b`, 'g'), ` season ${number} `);
  }

  text = text
    .replace(/\bseason\s+(\d+)\b/g, ' season $1 ')
    .replace(/\b(\d+)(?:st|nd|rd|th)\s+season\b/g, ' season $1 ')
    .replace(/\bs\s*(\d+)\b/g, ' season $1 ')
    .replace(/\bpart\s+(\d+)\b/g, ' part $1 ')
    .replace(/\bcour\s+(\d+)\b/g, ' cour $1 ')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

export function parseTitleIdentity(value = '') {
  const normalized = normalizeSeasonWords(value);
  const seasonMatch = normalized.match(/\bseason\s+(\d+)\b/);
  const partMatch = normalized.match(/\bpart\s+(\d+)\b/);
  const courMatch = normalized.match(/\bcour\s+(\d+)\b/);

  let base = normalized;
  if (seasonMatch) base = base.slice(0, seasonMatch.index).trim();
  else if (partMatch) base = base.slice(0, partMatch.index).trim();
  else if (courMatch) base = base.slice(0, courMatch.index).trim();

  // Subtitles following an explicit season label are aliases, not distinct identity.
  base = base.replace(/\b(tv|ona|ova|movie|special)\b$/g, '').trim();

  return {
    normalized,
    base,
    season: seasonMatch ? Number(seasonMatch[1]) : null,
    part: partMatch ? Number(partMatch[1]) : null,
    cour: courMatch ? Number(courMatch[1]) : null,
    key: [base, seasonMatch ? `s${seasonMatch[1]}` : '', partMatch ? `p${partMatch[1]}` : '', courMatch ? `c${courMatch[1]}` : '']
      .filter(Boolean)
      .join('|')
  };
}

export function titleAliases(item = {}) {
  return [
    item.title,
    item.officialTitle,
    item.englishTitle,
    item.romajiTitle,
    item.japaneseTitle,
    ...(Array.isArray(item.titleSynonyms) ? item.titleSynonyms : [])
  ].filter(Boolean);
}

export function animeIdentityKeys(item = {}) {
  const keys = new Set();
  if (item.kitsuId) keys.add(`kitsu:${item.kitsuId}`);
  const malId = item.malId || item.mal_id;
  if (malId) keys.add(`mal:${malId}`);

  titleAliases(item).forEach((title) => {
    const identity = parseTitleIdentity(title);
    if (identity.key) keys.add(`title:${identity.key}`);
    if (identity.normalized) keys.add(`exact:${identity.normalized}`);
  });

  return keys;
}

export function sameAnimeIdentity(a = {}, b = {}) {
  if (a.kitsuId && b.kitsuId) {
    return String(a.kitsuId) === String(b.kitsuId);
  }

  const aMal = a.malId || a.mal_id;
  const bMal = b.malId || b.mal_id;
  if (aMal && bMal) return String(aMal) === String(bMal);

  const aTitles = titleAliases(a).map(parseTitleIdentity);
  const bTitles = titleAliases(b).map(parseTitleIdentity);

  for (const left of aTitles) {
    for (const right of bTitles) {
      if (!left.base || !right.base) continue;
      if (left.normalized === right.normalized) return true;
      if (left.base !== right.base) continue;

      // A known season must not merge with a different known season.
      if (left.season && right.season && left.season !== right.season) continue;
      if (left.part && right.part && left.part !== right.part) continue;
      if (left.cour && right.cour && left.cour !== right.cour) continue;

      // If one title explicitly names a season and the other does not, only merge
      // when metadata independently agrees (year/episode count) or a MAL id exists.
      const oneSeasonMissing = Boolean(left.season) !== Boolean(right.season);
      if (oneSeasonMissing) {
        const sameYear = a.year && b.year && String(a.year) === String(b.year);
        const aEpisodes = Number(a.episodeCount || a.episodes || 0);
        const bEpisodes = Number(b.episodeCount || b.episodes || 0);
        const sameEpisodes = aEpisodes && bEpisodes && aEpisodes === bEpisodes;
        if (!sameYear && !sameEpisodes) continue;
      }

      return true;
    }
  }

  return false;
}
