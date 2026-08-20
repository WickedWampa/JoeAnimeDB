const DEFAULT_PROXY_URL = 'https://joeanimedb.com/api/watchmode';
const MATCH_CACHE_KEY = 'joeanime-watchmode-title-matches-v1';
const REGION_KEY = 'joeanime-watchmode-region-v1';
export const STREAMING_APPS_KEY = 'joeanime-streaming-apps-v1';

export const STREAMING_APP_OPTIONS = [
  { id: 'crunchyroll', label: 'Crunchyroll', description: 'Anime streaming', aliases: ['crunchyroll'] },
  { id: 'netflix', label: 'Netflix', description: 'Netflix subscription', aliases: ['netflix'] },
  { id: 'hulu', label: 'Hulu', description: 'Hulu subscription', aliases: ['hulu'] },
  { id: 'hidive', label: 'HIDIVE', description: 'Anime streaming', aliases: ['hidive', 'hi dive'] },
  { id: 'prime', label: 'Prime Video', description: 'Amazon Prime Video', aliases: ['amazon prime video', 'prime video', 'amazon video'] },
  { id: 'disney', label: 'Disney+', description: 'Disney+ subscription', aliases: ['disney+', 'disney plus'] },
  { id: 'max', label: 'Max', description: 'Max / HBO Max', aliases: ['max', 'hbo max'] },
  { id: 'peacock', label: 'Peacock', description: 'Peacock subscription', aliases: ['peacock', 'peacock premium'] },
  { id: 'apple', label: 'Apple TV+', description: 'Apple TV+ subscription', aliases: ['apple tv+', 'apple tv plus', 'apple tv'] },
  { id: 'paramount', label: 'Paramount+', description: 'Paramount+ subscription', aliases: ['paramount+', 'paramount plus'] },
  { id: 'tubi', label: 'Tubi', description: 'Free streaming', aliases: ['tubi', 'tubi tv'] },
  { id: 'retrocrush', label: 'RetroCrush', description: 'Classic anime streaming', aliases: ['retrocrush', 'retro crush'] },
  { id: 'pluto', label: 'Pluto TV', description: 'Free streaming', aliases: ['pluto tv', 'pluto'] },
  { id: 'youtube', label: 'YouTube', description: 'YouTube / Premium', aliases: ['youtube', 'youtube premium'] }
];

const STREAMING_APP_IDS = new Set(STREAMING_APP_OPTIONS.map((item) => item.id));

function normalizeStreamingProviderName(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[+]/g, ' plus ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function getSavedStreamingApps() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STREAMING_APPS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map((value) => String(value || '').trim()).filter((id) => STREAMING_APP_IDS.has(id)))];
  } catch {
    return [];
  }
}

export function saveStreamingApps(appIds = []) {
  const requested = new Set(
    (Array.isArray(appIds) ? appIds : [])
      .map((value) => String(value || '').trim())
      .filter((id) => STREAMING_APP_IDS.has(id))
  );

  const normalized = STREAMING_APP_OPTIONS
    .map((item) => item.id)
    .filter((id) => requested.has(id));

  try {
    localStorage.setItem(STREAMING_APPS_KEY, JSON.stringify(normalized));
  } catch {}

  try {
    window.dispatchEvent(new CustomEvent('joeanime:streaming-apps-changed', { detail: normalized }));
  } catch {}

  return normalized;
}

function providerMatchesStreamingApp(provider, app) {
  const providerName = normalizeStreamingProviderName(provider?.name || '');
  if (!providerName || !app) return false;

  return (app.aliases || []).some((alias) => {
    const normalizedAlias = normalizeStreamingProviderName(alias);
    return providerName === normalizedAlias
      || providerName.startsWith(`${normalizedAlias} `)
      || providerName.endsWith(` ${normalizedAlias}`);
  });
}

export function groupWatchProvidersByPreference(providers = [], selectedAppIds = getSavedStreamingApps()) {
  const selected = new Set(Array.isArray(selectedAppIds) ? selectedAppIds : []);
  const preferred = [];
  const other = [];

  for (const provider of Array.isArray(providers) ? providers : []) {
    const matchedApp = STREAMING_APP_OPTIONS.find(
      (app) => selected.has(app.id) && providerMatchesStreamingApp(provider, app)
    );

    (matchedApp ? preferred : other).push({
      ...provider,
      preferredAppId: matchedApp?.id || ''
    });
  }

  return { preferred, other };
}

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
