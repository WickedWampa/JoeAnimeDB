import { getManualMetadata, normalizeManualMetadataKey } from '../data/manualMetadataOverrides';

const KNOWN_BAD_JIKAN_MATCHES = {
  arcane: ['La storia della Arcana Famiglia', 'Arcana Famiglia'],
  'blue eye samurai': ['The Third', 'The Third: Aoi Hitomi no Shoujo'],
  castlevania: []
};

function norm(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[:'"’“.!?]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titleBag(candidate = {}) {
  return [
    candidate.title,
    candidate.title_english,
    candidate.title_japanese,
    ...(candidate.title_synonyms || [])
  ].filter(Boolean);
}

function knownBadMatch(query, candidate) {
  const q = norm(query);
  const bad = KNOWN_BAD_JIKAN_MATCHES[q] || [];
  const titles = titleBag(candidate).map(norm);
  return bad.some((badTitle) => titles.includes(norm(badTitle)));
}

export function shouldPreferManualMetadata(title = '') {
  return Boolean(getManualMetadata(title));
}

export function manualMetadataToAnime(item = {}, manual = {}) {
  return {
    ...item,
    ...manual,
    id: item.id || manual.id || normalizeManualMetadataKey(manual.title || item.title).replace(/\s+/g, '-'),
    title: manual.title || item.title,
    officialTitle: manual.officialTitle || manual.title || item.officialTitle,
    description: manual.description || manual.synopsis || item.description || '',
    synopsis: manual.synopsis || manual.description || item.synopsis || '',
    metadataUpdatedAt: new Date().toISOString(),
    syncStatus: {
      ...(item.syncStatus || {}),
      metadata: true,
      manualOverride: true,
      dirty: false,
      lastMetadataSync: new Date().toISOString()
    }
  };
}

export function scoreJikanCandidate(query, candidate = {}) {
  let points = 0;
  const q = norm(query);
  const titles = titleBag(candidate).map(norm);

  if (titles.some((title) => title === q)) points += 80;
  else if (titles.some((title) => title.includes(q) || q.includes(title))) points += 25;

  if (candidate.title_english && norm(candidate.title_english) === q) points += 35;
  if (candidate.score) points += Math.min(10, Number(candidate.score));
  if (knownBadMatch(query, candidate)) points -= 100;
  if (getManualMetadata(query)) points -= 50;

  return points;
}
