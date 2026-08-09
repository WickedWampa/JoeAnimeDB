const MATCH_TTL_SECONDS = 60 * 60 * 24 * 30;
const PROVIDER_TTL_SECONDS = 60 * 60 * 24 * 7;
const REVIEW_TTL_SECONDS = 60 * 60 * 24;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'X-Content-Type-Options': 'nosniff'
};

function json(payload, status = 200, cacheControl = 'no-store') {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl
    }
  });
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

async function watchmodeJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Watchmode request failed with status ${response.status}.`);
  return response.json();
}

async function findTitleMatch(context, identity, apiKey, forceReview = false) {
  const key = await cacheKey('match', {
    title: identity.names[0],
    aliases: identity.names.slice(1).join('|'),
    year: identity.year || '',
    type: identity.types.join(',')
  });
  if (!forceReview) {
    const cached = await readCache(context, key);
    if (cached) return { payload: cached.payload, cache: cached.source };
  }

  const url = new URL('https://api.watchmode.com/v1/search/');
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('search_field', 'name');
  url.searchParams.set('search_value', identity.searchTitle);

  const result = await watchmodeJson(url);
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
  if (cached) return { providers: cached.payload.providers || [], cache: cached.source };

  const url = new URL(`https://api.watchmode.com/v1/title/${watchmodeId}/sources/`);
  url.searchParams.set('apiKey', apiKey);
  url.searchParams.set('regions', region);

  const sources = await watchmodeJson(url);
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

  await writeCache(context, key, { providers }, PROVIDER_TTL_SECONDS);
  return { providers, cache: 'MISS' };
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
      types: requestedTypeFamily(requestedType)
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
      cache: {
        match: matchCache,
        providers: providerResult.cache
      }
    });
  } catch (error) {
    console.error('Watchmode proxy failed:', error);
    return json({ error: 'Where to Watch is temporarily unavailable.' }, 502);
  }
}
