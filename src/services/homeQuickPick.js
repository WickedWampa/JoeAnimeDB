export const QUICK_PICK_INTENTS = Object.freeze([
  { id: 'quick', label: 'Quick', prompt: 'recommend a short anime under 14 episodes I can start right now' },
  { id: 'movie', label: 'Movie', prompt: 'recommend an anime movie for tonight' },
  { id: 'binge', label: 'Binge', prompt: 'recommend a bingeable finished anime' },
  { id: 'dark', label: 'Dark', prompt: 'recommend something dark' },
  { id: 'comfort', label: 'Comfort', prompt: 'recommend a comforting wholesome anime' },
  { id: 'different', label: 'Different', prompt: 'recommend something outside my usual taste' },
  { id: 'surprise', label: 'Surprise Me', prompt: 'surprise me with an unexpected anime recommendation' }
]);
const EMPTY_JOEAI_STATE = Object.freeze({});
export const QUICK_PICK_POOL_CACHE_KEY = 'joeanime-home-quick-pick-pools-v1';
export const QUICK_PICK_POOL_CACHE_SCHEMA = 1;
export const QUICK_PICK_ALGORITHM_VERSION = 'beta22-intent-pools-v2';
const QUICK_PICK_POOL_FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const PERSISTED_SCORE_FIELDS = Object.freeze([
  'metadataReady', 'rawScore', 'match', 'matchLabel', 'reasons', 'warnings',
  'genomeTraits', 'genomeTier', 'confidenceReceipt'
]);

export function quickPickIntent(intentId) {
  return QUICK_PICK_INTENTS.find((intent) => intent.id === intentId) || null;
}

export function quickPickItemKey(item = {}) {
  const identity = item.kitsuId || item.id || item.slug || item.officialTitle || item.title || '';
  return String(identity).trim().toLowerCase();
}

const quickPickPoolCache = new WeakMap();

function clockNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function hashText(text = '') {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function fingerprintItem(item = {}, libraryItem = false) {
  return [
    quickPickItemKey(item), item.malId || item.mal_id || '', item.title || '',
    item.officialTitle || '', item.type || item.format || '', item.year || item.startYear || '',
    item.episodeCount || item.episodes || '', item.airingStatus || item.releaseStatus || '',
    item.communityScore || item.malScore || item.rating || '',
    item.cover || item.poster || item.posterUrl || item.image || item.imageUrl || '',
    libraryItem ? (item.status || '') : '', libraryItem ? (item.score || item.joeScore || '') : '',
    libraryItem ? Number(Boolean(item.favorite)) : '', libraryItem ? (item.rewatches || '') : '',
    (item.genres || []).join(','), (item.themes || []).join(','), (item.studios || []).join(','),
    item.synopsis || item.description || ''
  ].join('\u001f');
}

export function quickPickPoolFingerprint(context, joeAIState = EMPTY_JOEAI_STATE) {
  if (!context) return '';
  const library = Array.isArray(context.library) ? context.library : [];
  const catalog = Array.isArray(context.catalog) ? context.catalog : [];
  const payload = [
    QUICK_PICK_ALGORITHM_VERSION,
    context.safetyMode || 'unrestricted',
    ...library.map((item) => `l:${fingerprintItem(item, true)}`),
    ...catalog.map((item) => `c:${fingerprintItem(item, false)}`),
    `j:${JSON.stringify(joeAIState || {})}`
  ].join('\u001e');
  return `${library.length}-${catalog.length}-${hashText(payload)}`;
}

function persistedCandidate(candidate = {}) {
  const score = {};
  for (const field of PERSISTED_SCORE_FIELDS) {
    if (candidate[field] !== undefined) score[field] = candidate[field];
  }
  return { key: quickPickItemKey(candidate), score };
}

function hydrationIndex(context) {
  const index = new Map();
  for (const item of [...(context?.catalog || []), ...(context?.library || [])]) {
    const key = quickPickItemKey(item);
    if (key && !index.has(key)) index.set(key, item);
  }
  return index;
}

export function readPersistedQuickPickPools(context, joeAIState = EMPTY_JOEAI_STATE) {
  const empty = { pools: {}, fingerprint: quickPickPoolFingerprint(context, joeAIState), stale: true, createdAt: 0 };
  if (!context || typeof localStorage === 'undefined') return empty;

  try {
    const parsed = JSON.parse(localStorage.getItem(QUICK_PICK_POOL_CACHE_KEY) || 'null');
    if (!parsed || parsed.schema !== QUICK_PICK_POOL_CACHE_SCHEMA
      || parsed.algorithmVersion !== QUICK_PICK_ALGORITHM_VERSION
      || parsed.fingerprint !== empty.fingerprint
      || !parsed.pools || typeof parsed.pools !== 'object') return empty;

    const sourceIndex = hydrationIndex(context);
    const pools = {};
    for (const intent of QUICK_PICK_INTENTS) {
      const storedPool = parsed.pools[intent.id];
      if (!Array.isArray(storedPool)) continue;
      const hydrated = storedPool.map((stored) => {
        const source = sourceIndex.get(String(stored?.key || ''));
        return source ? { ...source, ...(stored.score || {}) } : null;
      }).filter(Boolean);
      if (hydrated.length === storedPool.length) pools[intent.id] = hydrated;
    }

    return {
      pools,
      fingerprint: empty.fingerprint,
      stale: Date.now() - Number(parsed.createdAt || 0) > QUICK_PICK_POOL_FRESH_MS,
      createdAt: Number(parsed.createdAt || 0)
    };
  } catch {
    try { localStorage.removeItem(QUICK_PICK_POOL_CACHE_KEY); } catch {}
    return empty;
  }
}

export function persistQuickPickPools(context, pools = {}, joeAIState = EMPTY_JOEAI_STATE) {
  if (!context || typeof localStorage === 'undefined') return false;
  const storedPools = {};
  for (const intent of QUICK_PICK_INTENTS) {
    const pool = pools[intent.id];
    if (Array.isArray(pool)) storedPools[intent.id] = pool.map(persistedCandidate);
  }
  if (!Object.keys(storedPools).length) return false;

  try {
    localStorage.setItem(QUICK_PICK_POOL_CACHE_KEY, JSON.stringify({
      schema: QUICK_PICK_POOL_CACHE_SCHEMA,
      algorithmVersion: QUICK_PICK_ALGORITHM_VERSION,
      fingerprint: quickPickPoolFingerprint(context, joeAIState),
      createdAt: Date.now(),
      pools: storedPools
    }));
    return true;
  } catch {
    return false;
  }
}

function cacheFor(context, joeAIState) {
  const cached = quickPickPoolCache.get(context);
  if (cached?.joeAIState === joeAIState) return cached.pools;
  const pools = new Map();
  quickPickPoolCache.set(context, { joeAIState, pools });
  return pools;
}

export function getCachedQuickPickPool(context, intentId, joeAIState = EMPTY_JOEAI_STATE) {
  if (!context || !quickPickIntent(intentId)) return null;
  return cacheFor(context, joeAIState).get(intentId) || null;
}

export function primeQuickPickPoolCache(context, pools = {}, joeAIState = EMPTY_JOEAI_STATE) {
  if (!context) return;
  const cache = cacheFor(context, joeAIState);
  for (const intent of QUICK_PICK_INTENTS) {
    if (Array.isArray(pools[intent.id])) cache.set(intent.id, pools[intent.id]);
  }
}

export function buildQuickPickPool(context, intentId, {
  joeAIState = EMPTY_JOEAI_STATE,
  onTiming
} = {}) {
  const intent = quickPickIntent(intentId);
  if (!intent || !context?.brain) return [];

  const cache = cacheFor(context, joeAIState);
  const cached = cache.get(intent.id);
  if (cached) {
    onTiming?.({ intent: intent.id, cacheHit: true, totalMs: 0, poolSize: cached.length });
    return cached;
  }

  const startedAt = clockNow();
  let engineTiming = {};
  const pool = context.brain.recommendations(intent.id === 'surprise' ? 18 : 12, {
    prompt: intent.prompt,
    joeAIState,
    onTiming: (timing) => { engineTiming = timing || {}; }
  });
  cache.set(intent.id, pool);
  onTiming?.({
    intent: intent.id,
    cacheHit: false,
    totalMs: clockNow() - startedAt,
    poolSize: pool.length,
    ...engineTiming
  });
  return pool;
}

export function buildQuickPickPools(context, {
  joeAIState = EMPTY_JOEAI_STATE,
  onTiming
} = {}) {
  const pools = {};
  for (const intent of QUICK_PICK_INTENTS) {
    pools[intent.id] = buildQuickPickPool(context, intent.id, { joeAIState, onTiming });
  }
  return pools;
}

function intentSeed(intentId = '') {
  return [...String(intentId)].reduce((seed, character) => ((seed * 31) + character.charCodeAt(0)) >>> 0, 2166136261);
}

function seededRoll(seed = 0) {
  let value = Number(seed) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 4294967296;
}

export function selectQuickPickFromPool(
  pool,
  intentId,
  {
    daySeed = 0,
    surpriseNonce = 0,
    selectionNonce = surpriseNonce,
    joeAIState = {},
    excludeKeys = [],
    currentKey = ''
  } = {}
) {
  const intent = quickPickIntent(intentId);
  if (!intent || !Array.isArray(pool) || !pool.length) return null;

  const isSurprise = intent.id === 'surprise';
  const selectionStartedAt = clockNow();

  const excluded = new Set((excludeKeys || []).map((key) => String(key || '').trim().toLowerCase()).filter(Boolean));
  const diversePool = excluded.size
    ? pool.filter((candidate) => !excluded.has(quickPickItemKey(candidate)))
    : pool;
  const resetCycle = diversePool.length === 0 && pool.length > 0;
  const normalizedCurrentKey = String(currentKey || '').trim().toLowerCase();
  const resetPool = resetCycle && pool.length > 1 && normalizedCurrentKey
    ? pool.filter((candidate) => quickPickItemKey(candidate) !== normalizedCurrentKey)
    : pool;
  const availablePool = diversePool.length ? diversePool : (resetPool.length ? resetPool : pool);

  const nonce = Math.max(0, Number(selectionNonce || 0));
  const roll = seededRoll(Number(daySeed || 0) + intentSeed(intent.id) + (nonce * 2654435761));
  const weightedRoll = isSurprise ? roll : Math.pow(roll, 1.45);
  const index = nonce === 0 ? 0 : Math.min(availablePool.length - 1, Math.floor(weightedRoll * availablePool.length));
  const item = availablePool[index];

  return {
    item,
    confidence: item.match,
    reasons: Array.isArray(item.reasons) ? item.reasons : [],
    confidenceReceipt: item.confidenceReceipt,
    intent,
    poolSize: pool.length,
    resetCycle,
    selectionMs: clockNow() - selectionStartedAt
  };
}

export function selectQuickPickRecommendation(context, intentId, options = {}) {
  const pool = buildQuickPickPool(context, intentId, {
    joeAIState: options.joeAIState || EMPTY_JOEAI_STATE
  });
  return selectQuickPickFromPool(pool, intentId, options);
}
