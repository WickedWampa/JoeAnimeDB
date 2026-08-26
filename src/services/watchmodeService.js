const DEFAULT_PROXY_URL = 'https://joeanimedb.com/api/watchmode';
const MATCH_CACHE_KEY = 'joeanime-watchmode-title-matches-v1';
const PROVIDER_CACHE_KEY = 'joeanime-watchmode-provider-results-v1';
const PROVIDER_READY_CACHE_TTL_MS = 28 * 24 * 60 * 60 * 1000;
const PROVIDER_STALE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PROVIDER_TERMINAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MATCH_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
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

function providerCacheKey(item = {}, region = getSavedWatchRegion()) {
  return `${String(region || 'US').toUpperCase()}|${identityKey(item)}`;
}

function matchCacheKey(item = {}, region = getSavedWatchRegion()) {
  return `${String(region || 'US').toUpperCase()}|${identityKey(item)}`;
}

function readProviderCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROVIDER_CACHE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getWatchmodeProviderCacheSnapshot() {
  return readProviderCache();
}

function writeProviderCache(cache) {
  try {
    localStorage.setItem(PROVIDER_CACHE_KEY, JSON.stringify(cache));
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent('joeanime:watchmode-cache-changed'));
  } catch {}
}

function saveProviderResult(item, region, payload, savedAt = Date.now()) {
  const status = String(payload?.status || '');
  if (!['ready', 'needs_review', 'not_found'].includes(status)) return;
  if (status === 'ready' && !Array.isArray(payload.providers)) return;

  const cachedPayload = status === 'ready'
    ? payload
    : { status };

  const cache = readProviderCache();
  cache[providerCacheKey(item, region)] = {
    savedAt,
    payload: cachedPayload
  };
  writeProviderCache(cache);
}

export function getCachedWhereToWatch(item, { region, allowStale = false, cacheSnapshot } = {}) {
  const cache = cacheSnapshot && typeof cacheSnapshot === 'object'
    ? cacheSnapshot
    : readProviderCache();
  const entry = cache[providerCacheKey(item, region)];
  if (!entry?.payload) return null;

  const age = Date.now() - Number(entry.savedAt || 0);
  const readyWithProviders = entry.payload.status === 'ready' && entry.payload.providers?.length > 0;
  const ttl = readyWithProviders ? PROVIDER_READY_CACHE_TTL_MS : PROVIDER_TERMINAL_CACHE_TTL_MS;
  const maxTtl = readyWithProviders ? PROVIDER_STALE_CACHE_TTL_MS : PROVIDER_TERMINAL_CACHE_TTL_MS;
  if (age > maxTtl) return null;
  if (!allowStale && age > ttl) return null;
  return age > ttl ? { ...entry.payload, stale: true } : entry.payload;
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
  try {
    window.dispatchEvent(new CustomEvent('joeanime:watch-region-changed', {
      detail: normalized
    }));
  } catch {}
}

export function forgetWatchmodeMatch(item) {
  const cache = readMatchCache();
  const identity = identityKey(item);
  Object.keys(cache).forEach((key) => {
    if (key === identity || key.endsWith(`|${identity}`)) delete cache[key];
  });
  writeMatchCache(cache);

  const providerCache = readProviderCache();
  Object.keys(providerCache).forEach((key) => {
    if (key.endsWith(`|${identity}`)) delete providerCache[key];
  });
  writeProviderCache(providerCache);
}

function saveWatchmodeMatch(item, id, region = getSavedWatchRegion()) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) return;

  const cache = readMatchCache();
  cache[matchCacheKey(item, region)] = {
    id: numericId,
    savedAt: Date.now()
  };
  writeMatchCache(cache);
}

function readWatchmodeMatch(item, region = getSavedWatchRegion()) {
  const cache = readMatchCache();
  const entry = cache[matchCacheKey(item, region)];
  const numericId = Number(entry?.id ?? entry);
  const savedAt = Number(entry?.savedAt || 0);
  if (savedAt && Date.now() - savedAt > MATCH_CACHE_TTL_MS) return null;
  if (Number.isInteger(numericId) && numericId > 0) return numericId;

  // One-time migration for pre-region match entries. Provider results remain
  // region-scoped and the migrated match receives a fresh 30-day timestamp.
  const legacyId = Number(cache[identityKey(item)]);
  if (!Number.isInteger(legacyId) || legacyId <= 0) return null;
  cache[matchCacheKey(item, region)] = {
    id: legacyId,
    savedAt: Date.now()
  };
  delete cache[identityKey(item)];
  writeMatchCache(cache);
  return legacyId;
}

async function requestWhereToWatch(item, {
  region,
  watchmodeId,
  forceReview = false,
  requestMode = 'interactive'
} = {}) {
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
  const normalizedRequestMode = ['interactive', 'cache-only', 'background'].includes(requestMode)
    ? requestMode
    : 'interactive';
  query.set('requestMode', normalizedRequestMode);

  const response = await fetch(`${proxyUrl()}?${query.toString()}`, {
    headers: { Accept: 'application/json' }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'Where to Watch is temporarily unavailable.');
    error.status = response.status;
    error.code = String(payload.status || '');
    const retryAfter = Number(response.headers?.get?.('retry-after') || 0);
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      error.retryAfterMs = retryAfter * 1000;
    }
    throw error;
  }

  if (!['ready', 'needs_review', 'not_found', 'cache_miss'].includes(payload.status)) {
    throw new Error('Where to Watch is not deployed or configured yet.');
  }

  return payload;
}

export async function fetchWhereToWatch(item, {
  region,
  forceReview = false,
  requestMode = 'interactive'
} = {}) {
  const normalizedRegion = region || getSavedWatchRegion();
  const rememberedId = forceReview ? null : readWatchmodeMatch(item, normalizedRegion);
  let payload;
  try {
    payload = await requestWhereToWatch(item, {
      region: normalizedRegion,
      watchmodeId: rememberedId,
      forceReview,
      requestMode
    });
  } catch (error) {
    const stale = getCachedWhereToWatch(item, {
      region: normalizedRegion,
      allowStale: true
    });
    const staleEligible = Number(error?.status || 0) === 429
      || ['quota_exhausted', 'upstream_paused', 'upstream_rate_limited'].includes(String(error?.code || ''));
    if (stale?.status === 'ready' && staleEligible) {
      return { ...stale, stale: true, cacheFallback: String(error.code || 'rate_limited') };
    }
    throw error;
  }

  if (payload.match?.id && payload.status === 'ready') {
    saveWatchmodeMatch(item, payload.match.id, normalizedRegion);
  }
  if (payload.status !== 'cache_miss' && (!payload.stale || requestMode === 'cache-only')) {
    const savedAt = payload.stale
      ? Date.now() - PROVIDER_READY_CACHE_TTL_MS - 1
      : Date.now();
    saveProviderResult(item, normalizedRegion, payload, savedAt);
  }

  return payload;
}

export async function confirmWatchmodeMatch(item, candidateId, { region } = {}) {
  const normalizedRegion = region || getSavedWatchRegion();
  saveWatchmodeMatch(item, candidateId, normalizedRegion);

  try {
    const payload = await requestWhereToWatch(item, {
      region: normalizedRegion,
      watchmodeId: candidateId
    });
    saveProviderResult(item, normalizedRegion, payload);
    return payload;
  } catch (error) {
    forgetWatchmodeMatch(item);
    throw error;
  }
}
