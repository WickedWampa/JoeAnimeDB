import { normalizeKitsuAnime } from './kitsuProvider';
import { sameAnimeIdentity } from './titleIdentity';
import { resolveAnimeTitleCandidates } from './titleResolver';

const KITSU_API_BASE = 'https://kitsu.io/api/edge';
const CACHE_KEY = 'joeanime-kitsu-continuations-v2';
const LEGACY_CACHE_KEY = 'joeanime-kitsu-continuations-v1';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMPTY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_SOURCE_TITLES = 60;
const MAX_CONCURRENT_REQUESTS = 4;
const MAX_PAGES_PER_TITLE = 3;
const RECENT_RELEASE_WINDOW_MS = 183 * 24 * 60 * 60 * 1000;

function normalizeStatus(value = '') {
  return String(value || '').toLowerCase().replace(/[\s_-]+/g, '');
}

function titleOf(item = {}) {
  return item.officialTitle || item.title || 'Unknown title';
}

export function kitsuIdOf(item = {}) {
  const direct = item.kitsuId ?? item.kitsu_id ?? item.externalIds?.kitsu ?? '';
  const value = String(direct).trim();
  if (/^\d+$/.test(value)) return value;

  const embedded = String(item.id || '').match(/(?:anime-kitsu|catalog-kitsu|kitsu)[-_]?(\d+)$/i);
  return embedded?.[1] || '';
}

function sameTitle(a = {}, b = {}) {
  const aKitsu = kitsuIdOf(a);
  const bKitsu = kitsuIdOf(b);
  if (aKitsu && bKitsu) return aKitsu === bKitsu;

  return titleOf(a).toLowerCase().replace(/[^a-z0-9]+/g, '')
    === titleOf(b).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function readCacheKey(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function readCache() {
  return readCacheKey(CACHE_KEY);
}

function writeCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

function readContinuationCaches() {
  return {
    current: readCache(),
    legacy: readCacheKey(LEGACY_CACHE_KEY)
  };
}

function cachedForSource(sourceId, { allowStale = false, cacheSnapshot } = {}) {
  const caches = cacheSnapshot || readContinuationCaches();
  const currentEntry = caches.current[sourceId];
  const legacyEntry = caches.legacy[sourceId];
  // Migrate useful v1 relationship payloads, but never preserve an old empty
  // lookup that could suppress real sequels on one origin for another week.
  const entry = currentEntry || (legacyEntry?.items?.length ? legacyEntry : null);
  if (!entry || !Array.isArray(entry.items)) return null;
  const ttl = entry.items.length ? CACHE_TTL_MS : EMPTY_CACHE_TTL_MS;
  if (!allowStale && Date.now() - Number(entry.savedAt || 0) > ttl) return null;
  return entry.items;
}

function saveForSource(sourceId, items) {
  const cache = readCache();
  cache[sourceId] = { savedAt: Date.now(), items };
  writeCache(cache);
}

function uniqueKitsuCandidates(candidates = []) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const kitsuId = kitsuIdOf(candidate);
    if (!kitsuId || seen.has(kitsuId)) return false;
    seen.add(kitsuId);
    return true;
  });
}

export function findVerifiedCatalogKitsuMatch(item, catalog = []) {
  if (!item || kitsuIdOf(item) || item.identityNeedsReview) return null;

  const candidates = uniqueKitsuCandidates(
    catalog.filter((candidate) => kitsuIdOf(candidate) && sameAnimeIdentity(item, candidate))
  );
  if (!candidates.length) return null;

  const itemMalId = String(item.malId || item.mal_id || '').trim();
  const exactMalMatches = itemMalId
    ? candidates.filter((candidate) =>
        String(candidate.malId || candidate.mal_id || '').trim() === itemMalId
      )
    : [];

  if (exactMalMatches.length === 1) {
    return {
      candidate: exactMalMatches[0],
      confidence: 100,
      reason: 'Exact MAL identity match.'
    };
  }
  if (exactMalMatches.length > 1) return null;

  const resolution = resolveAnimeTitleCandidates({
    query: titleOf(item),
    candidates,
    hints: {
      year: item.year || item.startYear || item.releaseYear || '',
      type: item.type || item.subtype || item.format || item.showType || ''
    }
  });

  if (!resolution.autoAct || !kitsuIdOf(resolution.candidate)) return null;
  return {
    candidate: resolution.candidate,
    confidence: Number(resolution.candidate.resolutionConfidence || 0),
    reason: resolution.reason
  };
}

function recoverCatalogKitsuId(item, catalog = []) {
  if (kitsuIdOf(item)) return item;
  const verified = findVerifiedCatalogKitsuMatch(item, catalog);
  const match = verified?.candidate;
  if (!match) return item;
  return {
    ...item,
    kitsuId: kitsuIdOf(match),
    relationshipKitsuIdRecovered: true,
    relationshipKitsuMatch: match,
    relationshipKitsuConfidence: verified.confidence,
    relationshipKitsuReason: verified.reason
  };
}

export function buildVerifiedCatalogLinkageRepairs(library = [], catalog = []) {
  return continuationSourceCandidates(library, catalog)
    .filter((item) => item.relationshipKitsuIdRecovered)
    .map((item) => ({
      libraryId: item.id,
      kitsuId: kitsuIdOf(item),
      confidence: item.relationshipKitsuConfidence,
      reason: item.relationshipKitsuReason,
      source: 'verified-catalog-identity',
      libraryItem: library.find((candidate) => String(candidate.id) === String(item.id)) || item
    }));
}

export function applyVerifiedCatalogLinkageRepair(item = {}, repair = {}) {
  if (
    !item ||
    !repair.kitsuId ||
    item.kitsuId ||
    item.kitsu_id ||
    item.identityNeedsReview ||
    String(item.id) !== String(repair.libraryId)
  ) return item;

  return {
    ...item,
    kitsuId: String(repair.kitsuId),
    identityResolutionStatus: 'verified',
    identityLinkageSource: repair.source || 'verified-catalog-identity',
    identityLinkageConfidence: Number(repair.confidence || 0),
    identityLinkageUpdatedAt: new Date().toISOString()
  };
}

export function continuationSourceCandidates(library = [], catalog = []) {
  return library
    .map((item) => recoverCatalogKitsuId(item, catalog))
    .filter((item) => kitsuIdOf(item) && ['completed', 'watched', 'watching'].includes(normalizeStatus(item.status)))
    .sort((a, b) => {
      const favoriteDelta = Number(Boolean(b.favorite)) - Number(Boolean(a.favorite));
      if (favoriteDelta) return favoriteDelta;
      const rewatchDelta = Number(b.rewatches || 0) - Number(a.rewatches || 0);
      if (rewatchDelta) return rewatchDelta;
      const scoreDelta = Number(b.joeScore || b.score || b.rating || 0) - Number(a.joeScore || a.score || a.rating || 0);
      if (scoreDelta) return scoreDelta;
      return normalizeStatus(a.status) === 'completed' ? -1 : 1;
    })
    .slice(0, MAX_SOURCE_TITLES);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.api+json' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Kitsu ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function isUsefulContinuation(item = {}) {
  const type = String(item.type || '').toLowerCase();
  return !['special', 'ova', 'music', 'pv'].includes(type);
}

async function fetchDirectContinuations(source) {
  const sourceId = kitsuIdOf(source);
  let nextUrl = `${KITSU_API_BASE}/anime/${sourceId}/media-relationships?include=destination,source&page[limit]=20`;
  let page = 0;
  const relationships = [];
  const included = new Map();

  while (nextUrl && page < MAX_PAGES_PER_TITLE) {
    const payload = await fetchJson(nextUrl);
    relationships.push(...(Array.isArray(payload.data) ? payload.data : []));
    for (const resource of Array.isArray(payload.included) ? payload.included : []) {
      included.set(`${resource.type}:${resource.id}`, resource);
    }
    nextUrl = payload.links?.next || '';
    page += 1;
  }

  const items = relationships
    .filter((relationship) => {
      const role = String(relationship.attributes?.role || '').toLowerCase();
      const relationshipSource = relationship.relationships?.source?.data;
      const destination = relationship.relationships?.destination?.data;
      return role === 'sequel'
        && relationshipSource?.type === 'anime'
        && String(relationshipSource?.id || '') === sourceId
        && destination?.type === 'anime';
    })
    .map((relationship) => {
      const destination = relationship.relationships.destination.data;
      const resource = included.get(`anime:${destination.id}`);
      if (!resource) return null;

      const item = normalizeKitsuAnime(resource, { status: '' });
      if (!isUsefulContinuation(item)) return null;

      return {
        ...item,
        id: `catalog-kitsu-${resource.id}`,
        status: '',
        returningFromId: source.id,
        returningFromKitsuId: sourceId,
        returningFromTitle: titleOf(source),
        returningFromStatus: normalizeStatus(source.status),
        returningConfidence: 'high',
        relationshipRole: 'sequel',
        continuationAiringStatus: item.airingStatus || item.releaseStatus || '',
        continuationStartDate: item.startDate || item.airedFrom || '',
        continuationEndDate: item.endDate || item.airedTo || '',
        returningReason: normalizeStatus(source.status) === 'completed'
          ? `You completed ${titleOf(source)}. This is its direct sequel.`
          : `You are watching ${titleOf(source)}. This is the next direct continuation.`
      };
    })
    .filter(Boolean);

  saveForSource(sourceId, items);
  return items;
}

function withSourceContext(item, source) {
  return {
    ...item,
    returningFromId: item.returningFromId || source.id,
    returningFromKitsuId: item.returningFromKitsuId || kitsuIdOf(source),
    returningFromTitle: item.returningFromTitle || titleOf(source),
    returningFromStatus: normalizeStatus(item.returningFromStatus || source.status),
    continuationAiringStatus: item.continuationAiringStatus || item.airingStatus || item.releaseStatus || '',
    continuationStartDate: item.continuationStartDate || item.startDate || item.airedFrom || '',
    continuationEndDate: item.continuationEndDate || item.endDate || item.airedTo || ''
  };
}

function firstArtwork(...values) {
  return values.find((value) => typeof value === 'string' && value.trim()) || '';
}

export function mergeContinuationCatalogItem(item, catalog = []) {
  const existing = catalog.find((candidate) => sameTitle(candidate, item));
  if (!existing) return item;

  return {
    ...item,
    ...existing,
    cover: firstArtwork(existing.cover, existing.poster, existing.posterUrl, existing.image, existing.imageUrl, item.cover, item.poster, item.posterUrl, item.image, item.imageUrl),
    poster: firstArtwork(existing.poster, existing.cover, item.poster, item.cover),
    returningFromId: item.returningFromId,
    returningFromKitsuId: item.returningFromKitsuId,
    returningFromTitle: item.returningFromTitle,
    returningFromStatus: item.returningFromStatus,
    returningConfidence: item.returningConfidence,
    relationshipRole: item.relationshipRole,
    continuationAiringStatus: item.continuationAiringStatus,
    continuationStartDate: item.continuationStartDate,
    continuationEndDate: item.continuationEndDate,
    returningReason: item.returningReason
  };
}

function parseDate(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? time : 0;
}

export function classifyContinuation(item = {}, now = Date.now()) {
  const status = normalizeStatus(item.continuationAiringStatus || item.airingStatus || item.releaseStatus);
  const startTime = parseDate(item.continuationStartDate || item.startDate || item.airedFrom);
  const endTime = parseDate(item.continuationEndDate || item.endDate || item.airedTo);
  const sourceStatus = normalizeStatus(item.returningFromStatus);
  const isUpcoming = ['upcoming', 'unreleased', 'tba', 'notyetreleased'].includes(status)
    || (startTime > now);
  const isCurrent = ['current', 'airing', 'currentlyairing', 'ongoing', 'releasing'].includes(status)
    || (startTime && startTime <= now && endTime > now);
  const releaseTime = endTime || startTime;
  const isRecent = !isUpcoming && !isCurrent && releaseTime > 0
    && (now - releaseTime) <= RECENT_RELEASE_WINDOW_MS;

  if (isUpcoming) return { bucket: 'returning', timing: 'upcoming' };
  if (isCurrent) return { bucket: 'returning', timing: 'current' };
  if (isRecent) return { bucket: 'returning', timing: 'recent' };
  if (['completed', 'watched'].includes(sourceStatus)) return { bucket: 'missed', timing: 'released' };
  return null;
}

function continuationReason(item, classification) {
  const sourceTitle = item.returningFromTitle || 'a title in your library';
  if (classification.bucket === 'missed') {
    return `You completed ${sourceTitle}. This released direct sequel is not in your library.`;
  }
  if (classification.timing === 'upcoming') return `The direct sequel to ${sourceTitle} is coming up.`;
  if (classification.timing === 'current') return `The direct sequel to ${sourceTitle} is airing now.`;
  return `A recent direct sequel to ${sourceTitle} is available.`;
}

export function finalizeContinuationTitles(items, library = [], catalog = [], { limit = 12, now = Date.now() } = {}) {
  const seen = new Set();
  return items
    .filter((item) => !library.some((existing) => sameTitle(existing, item)))
    .map((item) => mergeContinuationCatalogItem(item, catalog))
    .map((item) => {
      const classification = classifyContinuation(item, now);
      return classification ? {
        ...item,
        continuationBucket: classification.bucket,
        continuationTiming: classification.timing,
        returningReason: continuationReason(item, classification)
      } : null;
    })
    .filter(Boolean)
    .filter((item) => {
      const key = kitsuIdOf(item) || titleOf(item).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      if (a.continuationBucket !== b.continuationBucket) return a.continuationBucket === 'returning' ? -1 : 1;
      return String(b.continuationStartDate || b.startDate || '').localeCompare(String(a.continuationStartDate || a.startDate || ''));
    })
    .slice(0, limit);
}

export function partitionContinuations(items = [], { returningLimit = 6, missedLimit = 6 } = {}) {
  return {
    returning: items.filter((item) => item.continuationBucket === 'returning').slice(0, returningLimit),
    missedSequels: items.filter((item) => item.continuationBucket === 'missed').slice(0, missedLimit)
  };
}

export function getCachedContinuationTitles(library = [], catalog = [], { limit = 12, allowStale = false } = {}) {
  const cacheSnapshot = readContinuationCaches();
  const items = continuationSourceCandidates(library, catalog).flatMap((source) => {
    const cached = cachedForSource(kitsuIdOf(source), { allowStale, cacheSnapshot });
    return (cached || []).map((item) => withSourceContext(item, source));
  });
  return finalizeContinuationTitles(items, library, catalog, { limit });
}

export async function fetchContinuationTitles(
  library = [],
  catalog = [],
  { limit = 12, onTrace, onLinkageRepairs } = {}
) {
  const results = [];
  const sources = continuationSourceCandidates(library, catalog);
  const linkageRepairs = sources
    .filter((item) => item.relationshipKitsuIdRecovered)
    .map((item) => ({
      libraryId: item.id,
      kitsuId: kitsuIdOf(item),
      confidence: item.relationshipKitsuConfidence,
      reason: item.relationshipKitsuReason,
      source: 'verified-catalog-identity',
      libraryItem: library.find((candidate) => String(candidate.id) === String(item.id)) || item
    }));
  const cacheSnapshot = readContinuationCaches();
  let cacheHitSourceCount = 0;
  let networkSourceCount = 0;
  let failedSourceCount = 0;
  let safelyRepairedKitsuIdCount = 0;

  for (let index = 0; index < sources.length; index += MAX_CONCURRENT_REQUESTS) {
    const batch = sources.slice(index, index + MAX_CONCURRENT_REQUESTS);
    const batchResults = await Promise.all(batch.map(async (source) => {
      const sourceId = kitsuIdOf(source);
      const fresh = cachedForSource(sourceId, { cacheSnapshot });
      if (fresh) {
        cacheHitSourceCount += 1;
        return fresh.map((item) => withSourceContext(item, source));
      }

      try {
        networkSourceCount += 1;
        return (await fetchDirectContinuations(source)).map((item) => withSourceContext(item, source));
      } catch (error) {
        failedSourceCount += 1;
        console.warn(`Could not load Kitsu continuations for ${titleOf(source)}:`, error);
        return (cachedForSource(sourceId, { allowStale: true, cacheSnapshot }) || []).map((item) => withSourceContext(item, source));
      }
    }));
    results.push(...batchResults.flat());
  }

  const finalized = finalizeContinuationTitles(results, library, catalog, { limit });
  const shelves = partitionContinuations(finalized);

  if (linkageRepairs.length && onLinkageRepairs) {
    try {
      safelyRepairedKitsuIdCount = Number(await onLinkageRepairs(linkageRepairs)) || 0;
    } catch (error) {
      console.warn('Could not persist verified Kitsu linkage repairs:', error);
    }
  }

  onTrace?.({
    cacheKey: CACHE_KEY,
    libraryTitleCount: library.length,
    watchingCount: library.filter((item) => normalizeStatus(item.status) === 'watching').length,
    kitsuLinkedTitleCount: library.filter((item) => Boolean(kitsuIdOf(item))).length,
    catalogRecoveredKitsuIdCount: sources.filter((item) => item.relationshipKitsuIdRecovered).length,
    safelyRepairedKitsuIdCount,
    relationshipSourceCount: sources.length,
    relationshipSourceTitles: sources.map((item) => ({ title: titleOf(item), kitsuId: kitsuIdOf(item) })),
    directSequelCandidateCount: results.length,
    returningCandidateCount: shelves.returning.length,
    missedSequelCandidateCount: shelves.missedSequels.length,
    cacheHitSourceCount,
    networkSourceCount,
    failedSourceCount
  });
  return finalized;
}

export function getCachedReturningTitles(library = [], catalog = [], options = {}) {
  return partitionContinuations(getCachedContinuationTitles(library, catalog, { ...options, limit: Math.max(12, options.limit || 0) }), {
    returningLimit: options.limit || 6
  }).returning;
}

export async function fetchReturningTitles(library = [], catalog = [], options = {}) {
  return partitionContinuations(await fetchContinuationTitles(library, catalog, { ...options, limit: Math.max(12, options.limit || 0) }), {
    returningLimit: options.limit || 6
  }).returning;
}
