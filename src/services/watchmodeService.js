const DEFAULT_PROXY_URL = 'https://joeanimedb.com/api/watchmode';
const MATCH_CACHE_KEY = 'joeanime-watchmode-title-matches-v1';
const REGION_KEY = 'joeanime-watchmode-region-v1';

const REGION_LABELS = {
  US: 'United States',
  CA: 'Canada',
  GB: 'United Kingdom',
  AU: 'Australia',
  NZ: 'New Zealand'
};

function configuredRegionCodes() {
  const raw = String(import.meta.env.VITE_WATCHMODE_REGIONS || 'US,CA,GB');
  const codes = raw
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^[A-Z]{2}$/.test(value));

  return [...new Set(codes)].slice(0, 3);
}

export const WATCHMODE_REGIONS = configuredRegionCodes().map((code) => ({
  code,
  label: REGION_LABELS[code] || code
}));

function proxyUrl() {
  return String(import.meta.env.VITE_WATCHMODE_PROXY_URL || DEFAULT_PROXY_URL).replace(/\/$/, '');
}

function titleOf(item = {}) {
  return String(item.officialTitle || item.title || '').trim();
}

function aliasesOf(item = {}) {
  return [
    item.title,
    item.officialTitle,
    item.englishTitle,
    item.romajiTitle,
    item.japaneseTitle,
    ...(Array.isArray(item.titleSynonyms) ? item.titleSynonyms : [])
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 6);
}

function identityKey(item = {}) {
  return [titleOf(item).toLowerCase(), item.year || '', String(item.type || '').toLowerCase()].join('|');
}

function readMatchCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MATCH_CACHE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMatchCache(cache) {
  try {
    localStorage.setItem(MATCH_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

export function getSavedWatchRegion() {
  const allowed = WATCHMODE_REGIONS.map((item) => item.code);

  try {
    const saved = String(localStorage.getItem(REGION_KEY) || '').toUpperCase();
    if (allowed.includes(saved)) return saved;
  } catch {}

  const localeRegion = String(navigator.language || '').split('-')[1]?.toUpperCase();
  return allowed.includes(localeRegion) ? localeRegion : (allowed[0] || 'US');
}

export function saveWatchRegion(region) {
  const normalized = String(region || '').toUpperCase();
  if (!WATCHMODE_REGIONS.some((item) => item.code === normalized)) return;
  try {
    localStorage.setItem(REGION_KEY, normalized);
  } catch {}
}

export function forgetWatchmodeMatch(item) {
  const cache = readMatchCache();
  delete cache[identityKey(item)];
  writeMatchCache(cache);
}

function saveWatchmodeMatch(item, id) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) return;

  const cache = readMatchCache();
  cache[identityKey(item)] = numericId;
  writeMatchCache(cache);
}

function readWatchmodeMatch(item) {
  const numericId = Number(readMatchCache()[identityKey(item)]);
  return Number.isInteger(numericId) && numericId > 0 ? numericId : null;
}

async function requestWhereToWatch(item, { region, watchmodeId, forceReview = false } = {}) {
  const title = titleOf(item);
  if (!title) throw new Error('This title does not have enough identity information.');

  const query = new URLSearchParams({
    title,
    region: String(region || getSavedWatchRegion()).toUpperCase()
  });

  if (item.year) query.set('year', String(item.year));
  if (item.type) query.set('type', String(item.type));

  const aliases = aliasesOf(item).filter((alias) => alias !== title);
  if (aliases.length) query.set('aliases', aliases.join('|'));
  if (watchmodeId) query.set('watchmodeId', String(watchmodeId));
  if (forceReview) query.set('forceReview', '1');

  const response = await fetch(`${proxyUrl()}?${query.toString()}`, {
    headers: { Accept: 'application/json' }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Where to Watch is temporarily unavailable.');
  }

  if (!['ready', 'needs_review', 'not_found'].includes(payload.status)) {
    throw new Error('Where to Watch is not deployed or configured yet.');
  }

  return payload;
}

export async function fetchWhereToWatch(item, { region, forceReview = false } = {}) {
  const rememberedId = forceReview ? null : readWatchmodeMatch(item);
  const payload = await requestWhereToWatch(item, {
    region,
    watchmodeId: rememberedId,
    forceReview
  });

  if (payload.match?.id && payload.status === 'ready') {
    saveWatchmodeMatch(item, payload.match.id);
  }

  return payload;
}

export async function confirmWatchmodeMatch(item, candidateId, { region } = {}) {
  saveWatchmodeMatch(item, candidateId);

  try {
    return await requestWhereToWatch(item, {
      region,
      watchmodeId: candidateId
    });
  } catch (error) {
    forgetWatchmodeMatch(item);
    throw error;
  }
}
