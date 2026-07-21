export function normalizeAnimeTitle(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[:'"’“.!?()[\]{}]/g, ' ')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugAnimeTitle(value = '') {
  return normalizeAnimeTitle(value).replace(/\s+/g, '-');
}

export const TITLE_ALIASES = {
  'blue eye samurai': 'blue-eye-samurai',
  'blue-eye samurai': 'blue-eye-samurai',
  'blue-eye-samurai': 'blue-eye-samurai',
  bes: 'blue-eye-samurai',

  arcane: 'arcane',
  'arcane league of legends': 'arcane',

  castlevania: 'castlevania',
  'netflix castlevania': 'castlevania',
  'castlevania nocturne': 'castlevania-nocturne',

  'lord of mysteries': 'lord-of-mysteries',
  'guimi zhi zhu xiaochou pian': 'lord-of-mysteries',
  lom: 'lord-of-mysteries',

  'seven deadly sins': 'the-seven-deadly-sins',
  'the seven deadly sins': 'the-seven-deadly-sins',
  '7ds': 'the-seven-deadly-sins',

  'jujutsu kaisen': 'jujutsu-kaisen',
  jjk: 'jujutsu-kaisen',

  'demon slayer': 'demon-slayer',
  kimetsu: 'demon-slayer',

  frieren: 'frieren-beyond-journeys-end',
  'frieren beyond journeys end': 'frieren-beyond-journeys-end',

  'made in abyss': 'made-in-abyss',
  mia: 'made-in-abyss'
};

export function canonicalAnimeId(value = '') {
  const normalized = normalizeAnimeTitle(value);
  return TITLE_ALIASES[normalized] || slugAnimeTitle(normalized);
}

export function titleCandidates(value = '') {
  const normalized = normalizeAnimeTitle(value);
  const slug = slugAnimeTitle(value);
  const canonical = canonicalAnimeId(value);

  return [...new Set([
    String(value || '').trim(),
    normalized,
    slug,
    canonical,
    normalized.replace(/^the\s+/, ''),
    slug.replace(/^the-/, '')
  ].filter(Boolean))];
}

export function cardAliases(card = {}) {
  return [...new Set([
    card.id,
    ...(card.titles || []),
    card.title,
    card.officialTitle,
    card.titleEnglish,
    ...(card.aliases || [])
  ].filter(Boolean))];
}

export function cardMatchesTitle(card = {}, query = '') {
  const queryKeys = new Set(titleCandidates(query).map(normalizeAnimeTitle));
  const queryIds = new Set(titleCandidates(query).map(canonicalAnimeId));

  for (const alias of cardAliases(card)) {
    const aliasNorm = normalizeAnimeTitle(alias);
    const aliasId = canonicalAnimeId(alias);

    if (queryKeys.has(aliasNorm) || queryIds.has(aliasId)) return true;
    if (queryIds.has(slugAnimeTitle(alias))) return true;
  }

  return false;
}

export function buildAliasIndex(cards = []) {
  const index = new Map();

  // Registry order is priority order:
  // Gold packs come first, then Core/Enhanced/Generated packs.
  // Do not let lower-priority packs overwrite an alias that a Gold card
  // already claimed. This fixes bare title lookups like "slime" and
  // "re zero" returning short enhanced/core cards while
  // "recommend slime" correctly returns the Gold card.
  function claim(key, card) {
    if (!key) return;
    if (!index.has(key)) {
      index.set(key, card);
    }
  }

  for (const card of cards) {
    for (const alias of cardAliases(card)) {
      for (const candidate of titleCandidates(alias)) {
        claim(normalizeAnimeTitle(candidate), card);
        claim(canonicalAnimeId(candidate), card);
      }
    }
  }

  return index;
}
