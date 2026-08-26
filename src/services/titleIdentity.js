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

function subtitleAcronymAlias(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const split = raw.match(/^(.{3,}?)\s*[:：]\s*(.+)$/);
  if (!split) return '';

  const base = split[1].trim();
  const subtitle = split[2].trim();
  const stopWords = new Set(['a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'the', 'to', 'with']);
  const initials = subtitle
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !stopWords.has(word.toLowerCase()))
    .map((word) => word[0])
    .join('')
    .toUpperCase();

  if (initials.length < 2 || initials.length > 8) return '';
  return `${base} ${initials}`;
}

function uniqueTitleAliases(values = []) {
  const seen = new Set();
  return values.filter(Boolean).filter((value) => {
    const key = foldText(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function titleAliases(item = {}) {
  const direct = [
    item.title,
    item.officialTitle,
    item.englishTitle,
    item.canonicalTitle,
    item.romajiTitle,
    item.japaneseTitle,
    item.shortTitle,
    item.name,
    ...(Array.isArray(item.titleSynonyms) ? item.titleSynonyms : []),
    ...(Array.isArray(item.synonyms) ? item.synonyms : []),
    ...(Array.isArray(item.aliases) ? item.aliases : [])
  ].filter(Boolean);

  // Generic subtitle-acronym aliases let identity matching connect local shorthand
  // such as "Bleach TYBW" with metadata titles such as
  // "BLEACH: Thousand-Year Blood War" without hard-coding one franchise.
  const acronymAliases = direct.map(subtitleAcronymAlias).filter(Boolean);
  return uniqueTitleAliases([...direct, ...acronymAliases]);
}

export function animeIdentityKeys(item = {}) {
  const keys = new Set();
  const kitsuId = item.kitsuId || item.kitsu_id;
  if (kitsuId) keys.add(`kitsu:${kitsuId}`);
  const malId = item.malId || item.mal_id;
  if (malId) keys.add(`mal:${malId}`);

  titleAliases(item).forEach((title) => {
    const identity = parseTitleIdentity(title);
    if (identity.key) keys.add(`title:${identity.key}`);
    if (identity.normalized) keys.add(`exact:${identity.normalized}`);
  });

  return keys;
}

function providerId(item = {}, ...fields) {
  const value = fields.map((field) => item[field]).find((candidate) => candidate != null && String(candidate).trim());
  return value == null ? '' : String(value).trim();
}

function isExplicitContinuationSource(left = {}, right = {}) {
  const leftId = providerId(left, 'id');
  const rightId = providerId(right, 'id');
  const leftKitsu = providerId(left, 'kitsuId', 'kitsu_id');
  const rightKitsu = providerId(right, 'kitsuId', 'kitsu_id');
  const leftSourceId = providerId(left, 'returningFromId');
  const rightSourceId = providerId(right, 'returningFromId');
  const leftSourceKitsu = providerId(left, 'returningFromKitsuId');
  const rightSourceKitsu = providerId(right, 'returningFromKitsuId');

  return Boolean(
    (leftSourceId && rightId && leftSourceId === rightId)
    || (rightSourceId && leftId && rightSourceId === leftId)
    || (leftSourceKitsu && rightKitsu && leftSourceKitsu === rightKitsu)
    || (rightSourceKitsu && leftKitsu && rightSourceKitsu === leftKitsu)
  );
}

function primaryTitleIdentity(item = {}) {
  return parseTitleIdentity(item.officialTitle || item.title || item.englishTitle || item.romajiTitle || '');
}

function isNestedFranchiseTitle(left = {}, right = {}) {
  const leftIdentity = primaryTitleIdentity(left);
  const rightIdentity = primaryTitleIdentity(right);
  if (!leftIdentity.base || !rightIdentity.base || leftIdentity.base === rightIdentity.base) return false;

  const leftTokens = new Set(leftIdentity.base.split(' ').filter(Boolean));
  const rightTokens = new Set(rightIdentity.base.split(' ').filter(Boolean));
  const smaller = leftTokens.size <= rightTokens.size ? leftTokens : rightTokens;
  const larger = smaller === leftTokens ? rightTokens : leftTokens;
  const nested = smaller.size > 0 && [...smaller].every((token) => larger.has(token));
  if (!nested) return false;

  const sameYear = left.year && right.year && String(left.year) === String(right.year);
  const leftEpisodes = Number(left.episodeCount || left.episodes || 0);
  const rightEpisodes = Number(right.episodeCount || right.episodes || 0);
  const sameEpisodes = leftEpisodes && rightEpisodes && leftEpisodes === rightEpisodes;
  return !sameYear && !sameEpisodes;
}

export function sameAnimeIdentity(a = {}, b = {}) {
  const aKitsu = a.kitsuId || a.kitsu_id;
  const bKitsu = b.kitsuId || b.kitsu_id;
  if (aKitsu && bKitsu) {
    return String(aKitsu) === String(bKitsu);
  }

  const aMal = a.malId || a.mal_id;
  const bMal = b.malId || b.mal_id;
  if (aMal && bMal) return String(aMal) === String(bMal);

  // A discovered continuation must never collapse into the prerequisite that
  // produced it, even when a broad provider synonym contains the franchise's
  // base title (for example BLEACH and BLEACH: TYBW Part 2).
  if (isExplicitContinuationSource(a, b)) return false;

  // Provider synonym lists often include an ambiguous franchise-only alias.
  // Do not let that generic alias merge a distinct sequel, arc, or adaptation
  // into the shorter legacy library title unless year/episode metadata agrees.
  if (isNestedFranchiseTitle(a, b)) return false;

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

      const onePartMissing = Boolean(left.part) !== Boolean(right.part);
      const oneCourMissing = Boolean(left.cour) !== Boolean(right.cour);
      if (onePartMissing || oneCourMissing) {
        const sameYear = a.year && b.year && String(a.year) === String(b.year);
        const aEpisodes = Number(a.episodeCount || a.episodes || 0);
        const bEpisodes = Number(b.episodeCount || b.episodes || 0);
        const sameEpisodes = aEpisodes && bEpisodes && aEpisodes === bEpisodes;
        if (!sameYear || !sameEpisodes) continue;
      }

      return true;
    }
  }

  return false;
}
