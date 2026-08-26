const MATCH_TTL_SECONDS = 60 * 60 * 24 * 30;
const PROVIDER_TTL_SECONDS = 60 * 60 * 24 * 28;
const PROVIDER_STALE_TTL_SECONDS = 60 * 60 * 24 * 30;
const REVIEW_TTL_SECONDS = 60 * 60 * 24;
const DEFAULT_MONTHLY_CREDIT_LIMIT = 2000;
const MAX_FREE_PLAN_CREDIT_LIMIT = 2400;
const QUOTA_KEY_PREFIX = 'watchmode:quota:v1';
const UPSTREAM_PAUSE_KEY = 'watchmode:quota:v1:upstream-pause';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'X-Content-Type-Options': 'nosniff'
};

function json(payload, status = 200, cacheControl = 'no-store', extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
      ...extraHeaders
    }
  });
}

class WatchmodePolicyError extends Error {
  constructor(message, { code, status, retryAfterSeconds = 0 } = {}) {
    super(message);
    this.name = 'WatchmodePolicyError';
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function fold(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function numericYear(value) {
  const match = String(value || '').match(/(?:19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}

function candidateYear(candidate = {}) {
  return numericYear(candidate.year || candidate.release_date || candidate.first_air_date);
}

function requestedTypeFamily(value = '') {
  const type = fold(value);
  if (!type) return [];
  if (/movie|film/.test(type)) return ['movie', 'tv_movie', 'short_film'];
  if (/special/.test(type)) return ['tv_special'];
  if (/ova|ona/.test(type)) return ['tv_series', 'tv_special', 'tv_miniseries'];
  if (/tv|series/.test(type)) return ['tv_series', 'tv_miniseries'];
  return [];
}

function scoreCandidate(candidate, identity) {
  const name = fold(candidate.name || candidate.title);
  const exactName = identity.names.includes(name);
  const requestedYear = identity.year;
  const year = candidateYear(candidate);
  const yearDifference = requestedYear && year ? Math.abs(requestedYear - year) : null;
  const type = String(candidate.type || candidate.tmdb_type || '').toLowerCase();
  const typeExpected = identity.types.length > 0;
  const typeExact = !typeExpected || identity.types.includes(type);

  let score = exactName ? 60 : 0;
  if (!exactName && identity.names.some((alias) => alias.includes(name) || name.includes(alias))) score += 30;

  if (requestedYear && year) {
    if (yearDifference === 0) score += 25;
    else if (yearDifference === 1) score += 10;
    else score -= 45;
  } else if (!requestedYear) {
    score += 5;
  }

  if (typeExpected) score += typeExact ? 15 : -25;

  return {
    id: Number(candidate.id),
    name: String(candidate.name || candidate.title || '').trim(),
    year,
    type,
    score,
    exactName,
    yearExact: Boolean(requestedYear && year && requestedYear === year),
    typeExact
  };
}

function publicCandidate(candidate) {
  return {
    id: candidate.id,
    name: candidate.name,
    year: candidate.year,
    type: candidate.type,
    confidence: Math.max(0, Math.min(100, candidate.score))
  };
}

async function cacheKey(kind, values) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => params.set(key, String(value || '')));
  const input = new TextEncoder().encode(`${kind}:${params.toString()}`);
  const digest = await crypto.subtle.digest('SHA-256', input);
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `watchmode:v1:${kind}:${hash}`;
}

function edgeCacheRequest(key) {
  return new Request(`https://joeanimedb-watchmode-cache.invalid/${key}`, { method: 'GET' });
}

function sharedCacheBackend(context) {
  const namespace = context.env.WATCHMODE_CACHE;
  return namespace?.get && namespace?.put ? 'KV' : 'EDGE';
}

function monthlyCreditLimit(env = {}) {
  const configured = Number(env.WATCHMODE_MONTHLY_CREDIT_LIMIT);
  if (!Number.isFinite(configured)) return DEFAULT_MONTHLY_CREDIT_LIMIT;
  return Math.max(0, Math.min(MAX_FREE_PLAN_CREDIT_LIMIT, Math.floor(configured)));
}

function quotaWindow(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const resetAt = new Date(Date.UTC(year, month + 1, 1));
  return {
    key: `${QUOTA_KEY_PREFIX}:${year}-${String(month + 1).padStart(2, '0')}`,
    resetAt,
    retryAfterSeconds: Math.max(60, Math.ceil((resetAt.getTime() - now.getTime()) / 1000))
  };
}

async function reserveUpstreamCredit(context) {
  const namespace = context.env.WATCHMODE_CACHE;
  if (!namespace?.get || !namespace?.put) {
    throw new WatchmodePolicyError(
      'Where to Watch needs its shared cache before a fresh lookup can run.',
      { code: 'shared_cache_required', status: 503, retryAfterSeconds: 3600 }
    );
  }

  const limit = monthlyCreditLimit(context.env);
  const window = quotaWindow();
  let current;
  try {
    const pause = await namespace.get(UPSTREAM_PAUSE_KEY, { type: 'json' });
    const pausedUntil = Number(pause?.pausedUntil || 0);
    if (pausedUntil > Date.now()) {
      throw new WatchmodePolicyError(
        'Watchmode temporarily rate-limited fresh lookups. Cached results are still available.',
        {
          code: 'upstream_paused',
          status: 429,
          retryAfterSeconds: Math.max(60, Math.ceil((pausedUntil - Date.now()) / 1000))
        }
      );
    }
    current = await namespace.get(window.key, { type: 'json' });
  } catch (error) {
    if (error instanceof WatchmodePolicyError) throw error;
    throw new WatchmodePolicyError(
      'Where to Watch could not verify the free monthly request budget.',
      { code: 'quota_unavailable', status: 503, retryAfterSeconds: 3600 }
    );
  }

  const providerQuota = Math.max(0, Number(current?.providerQuota || 0));
  const effectiveLimit = providerQuota > 0 ? Math.min(limit, providerQuota) : limit;
  const used = Math.max(0, Number(current?.used || 0));
  if (used >= effectiveLimit) {
    throw new WatchmodePolicyError(
      'The free monthly Where to Watch lookup budget is exhausted. Cached results are still available.',
      { code: 'quota_exhausted', status: 429, retryAfterSeconds: window.retryAfterSeconds }
    );
  }

  const next = {
    used: used + 1,
    limit,
    effectiveLimit,
    providerQuota: providerQuota || null,
    accounting: current?.accounting || 'estimated-upstream-call',
    mode: 'zero-dollar',
    updatedAt: new Date().toISOString(),
    resetsAt: window.resetAt.toISOString()
  };
  try {
    await namespace.put(window.key, JSON.stringify(next), {
      expirationTtl: window.retryAfterSeconds + (24 * 60 * 60)
    });
  } catch {
    throw new WatchmodePolicyError(
      'Where to Watch could not reserve a free monthly request credit.',
      { code: 'quota_unavailable', status: 503, retryAfterSeconds: 3600 }
    );
  }

  return next;
}

function quotaHeader(response, name) {
  const value = String(response?.headers?.get?.(name) || '').trim();
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function reconcileUpstreamQuota(context, response, reservation) {
  const authoritativeUsed = quotaHeader(response, 'X-Account-Quota-Used');
  const providerQuota = quotaHeader(response, 'X-Account-Quota');
  if (authoritativeUsed === null && providerQuota === null) return reservation;

  const namespace = context.env.WATCHMODE_CACHE;
  const window = quotaWindow();
  const configuredLimit = monthlyCreditLimit(context.env);
  let current;
  try {
    current = await namespace.get(window.key, { type: 'json' });
  } catch {
    throw new WatchmodePolicyError(
      'Where to Watch could not reconcile the authoritative monthly request budget.',
      { code: 'quota_unavailable', status: 503, retryAfterSeconds: 3600 }
    );
  }

  const savedProviderQuota = Math.max(0, Number(current?.providerQuota || 0)) || null;
  const confirmedProviderQuota = providerQuota ?? savedProviderQuota;
  const effectiveLimit = confirmedProviderQuota
    ? Math.min(configuredLimit, confirmedProviderQuota)
    : configuredLimit;
  const reconciled = {
    ...reservation,
    used: Math.max(
      Number(reservation?.used || 0),
      Number(current?.used || 0),
      authoritativeUsed ?? 0
    ),
    limit: configuredLimit,
    effectiveLimit,
    providerQuota: confirmedProviderQuota,
    authoritativeUsed: authoritativeUsed ?? current?.authoritativeUsed ?? null,
    accounting: authoritativeUsed === null ? 'estimated-upstream-call' : 'watchmode-account-header',
    updatedAt: new Date().toISOString(),
    resetsAt: window.resetAt.toISOString()
  };

  try {
    await namespace.put(window.key, JSON.stringify(reconciled), {
      expirationTtl: window.retryAfterSeconds + (24 * 60 * 60)
    });
  } catch {
    throw new WatchmodePolicyError(
      'Where to Watch could not save the authoritative monthly request budget.',
      { code: 'quota_unavailable', status: 503, retryAfterSeconds: 3600 }
    );
  }

  return reconciled;
}

async function pauseUpstream(context, retryAfterSeconds) {
  const namespace = context.env.WATCHMODE_CACHE;
  if (!namespace?.put) return;
  const seconds = Math.max(60, Number(retryAfterSeconds || 0) || (15 * 60));
  try {
    await namespace.put(UPSTREAM_PAUSE_KEY, JSON.stringify({
      pausedUntil: Date.now() + (seconds * 1000),
      reason: 'rate_limited',
      updatedAt: new Date().toISOString()
    }), { expirationTtl: seconds });
  } catch (error) {
    console.warn('Could not persist the Watchmode rate-limit pause.', error);
  }
}

async function readCache(context, key) {
  const namespace = context.env.WATCHMODE_CACHE;
  if (namespace?.get) {
    try {
      const payload = await namespace.get(key, { type: 'json', cacheTtl: 60 });
      if (payload) return { payload, source: 'KV' };
    } catch (error) {
      console.warn('Watchmode KV read failed; trying the edge cache.', error);
    }
  }

  if (typeof caches !== 'undefined' && caches.default) {
    try {
      const response = await caches.default.match(edgeCacheRequest(key));
      if (response) return { payload: await response.json(), source: 'EDGE' };
    } catch (error) {
      console.warn('Watchmode edge cache read failed.', error);
    }
  }

  return null;
}

async function writeCache(context, key, payload, ttl) {
  const writes = [];
  const namespace = context.env.WATCHMODE_CACHE;

  if (namespace?.put) {
    writes.push(namespace.put(key, JSON.stringify(payload), { expirationTtl: ttl }));
  }

  if (typeof caches !== 'undefined' && caches.default) {
    const response = json(payload, 200, `public, max-age=${ttl}`);
    writes.push(caches.default.put(edgeCacheRequest(key), response));
  }

  if (!writes.length) return;
  const operation = Promise.allSettled(writes);
  if (context.waitUntil) context.waitUntil(operation);
  else await operation;
}

async function watchmodeJson(context, url) {
  const reservation = await reserveUpstreamCredit(context);
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  await reconcileUpstreamQuota(context, response, reservation);
  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = Math.max(60, Number(response.headers.get('retry-after') || 0) || (15 * 60));
      await pauseUpstream(context, retryAfter);
      throw new WatchmodePolicyError(
        'Watchmode temporarily rate-limited fresh lookups. Cached results are still available.',
        { code: 'upstream_rate_limited', status: 429, retryAfterSeconds: retryAfter }
      );
    }
    throw new Error(`Watchmode request failed with status ${response.status}.`);
  }
  return response.json();
}

async function findTitleMatch(context, identity, apiKey, forceReview = false) {
  const key = await cacheKey('match', {
    title: identity.names[0],
    aliases: identity.names.slice(1).join('|'),
    year: identity.year || '',
    type: identity.types.join(','),
    region: identity.region
  });
  if (!forceReview) {
    const cached = await readCache(context, key);
    if (cached) return { payload: cached.payload, cache: cached.source };
  }

  const url = new URL('https://api.watchmode.com/v1/search/');
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('search_field', 'name');
  url.searchParams.set('search_value', identity.searchTitle);

  const result = await watchmodeJson(context, url);
  const candidates = (Array.isArray(result.title_results) ? result.title_results : [])
    .map((candidate) => scoreCandidate(candidate, identity))
    .filter((candidate) => Number.isInteger(candidate.id) && candidate.id > 0 && candidate.name)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  const best = candidates[0];
  const runnerUp = candidates[1];
  const highConfidence = Boolean(
    best &&
    best.exactName &&
    best.yearExact &&
    best.typeExact &&
    best.score >= 90 &&
    (!runnerUp || best.score - runnerUp.score >= 12)
  );

  const payload = highConfidence && !forceReview
    ? { status: 'matched', match: publicCandidate(best) }
    : candidates.length
      ? { status: 'needs_review', candidates: candidates.slice(0, 3).map(publicCandidate) }
      : { status: 'not_found', candidates: [] };

  if (forceReview) {
    const reviewPayload = candidates.length
      ? { status: 'needs_review', candidates: candidates.slice(0, 3).map(publicCandidate) }
      : { status: 'not_found', candidates: [] };
    return { payload: reviewPayload, cache: 'BYPASS' };
  }

  const ttl = highConfidence ? MATCH_TTL_SECONDS : REVIEW_TTL_SECONDS;
  await writeCache(context, key, payload, ttl);
  return { payload, cache: 'MISS' };
}

async function fetchProviders(context, watchmodeId, region, apiKey) {
  const key = await cacheKey('providers', { watchmodeId, region });
  const cached = await readCache(context, key);
  const cachedProviders = Array.isArray(cached?.payload?.providers) ? cached.payload.providers : null;
  const freshUntil = Number(cached?.payload?.freshUntil || 0);
  const isFresh = Boolean(cachedProviders && (!freshUntil || freshUntil > Date.now()));
  if (isFresh) return { providers: cachedProviders, cache: cached.source, stale: false };

  const url = new URL(`https://api.watchmode.com/v1/title/${watchmodeId}/sources/`);
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('regions', region);

  let sources;
  try {
    sources = await watchmodeJson(context, url);
  } catch (error) {
    const mayUseStale = error instanceof WatchmodePolicyError
      && ['quota_exhausted', 'quota_unavailable', 'shared_cache_required', 'upstream_paused', 'upstream_rate_limited'].includes(error.code);
    if (cachedProviders?.length && mayUseStale) {
      return { providers: cachedProviders, cache: `${cached.source}_STALE`, stale: true };
    }
    throw error;
  }
  const seen = new Set();
  const providers = (Array.isArray(sources) ? sources : [])
    .filter((source) => source.type === 'sub')
    .map((source) => ({
      name: String(source.name || '').trim(),
      url: String(source.web_url || '').trim(),
      format: String(source.format || '').trim(),
      region
    }))
    .filter((source) => source.name && /^https:\/\//i.test(source.url))
    .filter((source) => {
      const identity = source.name.toLowerCase();
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  const hasProviders = providers.length > 0;
  const freshnessTtl = hasProviders ? PROVIDER_TTL_SECONDS : REVIEW_TTL_SECONDS;
  const storageTtl = hasProviders ? PROVIDER_STALE_TTL_SECONDS : REVIEW_TTL_SECONDS;
  await writeCache(context, key, {
    providers,
    freshUntil: Date.now() + (freshnessTtl * 1000)
  }, storageTtl);
  return { providers, cache: 'MISS', stale: false };
}

function allowedRegions(env) {
  return String(env.WATCHMODE_REGIONS || 'US,CA,GB')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^[A-Z]{2}$/.test(value))
    .slice(0, 3);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  try {
    const apiKey = String(context.env.WATCHMODE_API_KEY || '').trim();
    if (!apiKey) return json({ error: 'Where to Watch is not configured.' }, 503);

    const requestUrl = new URL(context.request.url);
    const cacheBackend = sharedCacheBackend(context);
    const requestMode = String(requestUrl.searchParams.get('requestMode') || 'interactive').toLowerCase();
    if (requestMode !== 'interactive') {
      return json({
        status: 'disabled',
        error: 'Automatic Watchmode catalog indexing is disabled in zero-dollar mode.',
        zeroDollarMode: true,
        cacheBackend
      }, 403);
    }
    const title = String(requestUrl.searchParams.get('title') || '').trim().slice(0, 180);
    const region = String(requestUrl.searchParams.get('region') || '').toUpperCase();
    const regions = allowedRegions(context.env);

    if (!title) return json({ error: 'A title is required.' }, 400);
    if (!regions.includes(region)) return json({ error: 'That streaming region is not supported.' }, 400);

    const requestedId = Number(requestUrl.searchParams.get('watchmodeId'));
    const forceReview = requestUrl.searchParams.get('forceReview') === '1';
    const year = numericYear(requestUrl.searchParams.get('year'));
    const requestedType = String(requestUrl.searchParams.get('type') || '').slice(0, 40);
    const aliases = String(requestUrl.searchParams.get('aliases') || '')
      .split('|')
      .map((value) => fold(value))
      .filter(Boolean)
      .slice(0, 6);
    const primaryName = fold(title);
    const identity = {
      searchTitle: title,
      names: [...new Set([primaryName, ...aliases])],
      year,
      types: requestedTypeFamily(requestedType),
      region
    };

    let match;
    let matchCache;
    if (Number.isInteger(requestedId) && requestedId > 0) {
      match = { id: requestedId, name: title, year, type: requestedType, confirmed: true };
      matchCache = 'CONFIRMED';
    } else {
      const result = await findTitleMatch(context, identity, apiKey, forceReview);
      if (result.payload.status !== 'matched') {
        return json({
          ...result.payload,
          zeroDollarMode: true,
          cacheBackend,
          cache: { match: result.cache }
        });
      }
      match = result.payload.match;
      matchCache = result.cache;
    }

    const providerResult = await fetchProviders(context, match.id, region, apiKey);
    return json({
      status: 'ready',
      match,
      region,
      providers: providerResult.providers,
      stale: Boolean(providerResult.stale),
      zeroDollarMode: true,
      monthlyCreditLimit: monthlyCreditLimit(context.env),
      cacheBackend,
      cache: {
        match: matchCache,
        providers: providerResult.cache
      }
    });
  } catch (error) {
    if (error instanceof WatchmodePolicyError) {
      return json({
        status: error.code,
        error: error.message,
        zeroDollarMode: true
      }, error.status || 503, 'no-store', error.retryAfterSeconds ? {
        'Retry-After': String(error.retryAfterSeconds)
      } : {});
    }
    console.error('Watchmode proxy failed:', error);
    return json({ error: 'Where to Watch is temporarily unavailable.' }, 502);
  }
}
