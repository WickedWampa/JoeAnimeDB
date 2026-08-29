import { kitsuIdOf } from './kitsuRelationshipService';

const KITSU_API_BASE = 'https://kitsu.io/api/edge';
const BATCH_SIZE = 20;
const REQUEST_TIMEOUT_MS = 9000;

export function malIdOf(item = {}) {
  const value = item.malId ?? item.mal_id ?? item.myanimelistId ??
    item.externalIds?.mal ?? item.externalIds?.myanimelist ?? '';
  const normalized = String(value || '').trim();
  return /^\d+$/.test(normalized) ? normalized : '';
}

function isMalAnimeMapping(mapping = {}) {
  const site = String(mapping.attributes?.externalSite || '').trim().toLowerCase();
  return site === 'myanimelist/anime';
}

function mappingMalId(mapping = {}) {
  const value = String(mapping.attributes?.externalId || '').trim();
  return isMalAnimeMapping(mapping) && /^\d+$/.test(value) ? value : '';
}

function chunk(items = [], size = BATCH_SIZE) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

async function fetchJson(url, fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/vnd.api+json' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Kitsu mappings returned HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchMalMappingsForKitsuIds(kitsuIds = [], fetchImpl = fetch) {
  const uniqueIds = [...new Set(kitsuIds.map((value) => String(value || '').trim()).filter(Boolean))];
  const results = new Map();

  for (const ids of chunk(uniqueIds)) {
    const url = `${KITSU_API_BASE}/anime?filter[id]=${encodeURIComponent(ids.join(','))}` +
      `&include=mappings&page[limit]=${BATCH_SIZE}`;
    const payload = await fetchJson(url, fetchImpl);
    const includedById = new Map(
      (Array.isArray(payload?.included) ? payload.included : [])
        .filter((entry) => entry?.type === 'mappings')
        .map((entry) => [String(entry.id), entry])
    );

    for (const anime of Array.isArray(payload?.data) ? payload.data : []) {
      const relationshipIds = anime?.relationships?.mappings?.data || [];
      const malId = relationshipIds
        .map((reference) => includedById.get(String(reference?.id || '')))
        .map(mappingMalId)
        .find(Boolean) || '';
      results.set(String(anime.id), malId);
    }
  }

  return results;
}

function defaultYieldControl() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function malCollision(library = [], proposedMalId, currentIndex) {
  const wanted = String(proposedMalId || '').trim();
  if (!wanted) return null;
  return library.find((candidate, candidateIndex) =>
    candidateIndex !== currentIndex && malIdOf(candidate) === wanted
  ) || null;
}

/**
 * Adds MAL IDs only when Kitsu publishes an official myanimelist/anime mapping.
 * It never title-searches, overwrites an existing MAL ID, or changes user data.
 */
export async function repairLibraryMalLinkages({
  library = [],
  fetchMappings = fetchMalMappingsForKitsuIds,
  onProgress,
  yieldControl = defaultYieldControl
} = {}) {
  const nextLibrary = [...library];
  const linkedBefore = library.filter((item) => Boolean(malIdOf(item))).length;
  const eligible = library.filter((item) =>
    !malIdOf(item) && kitsuIdOf(item) && !item.identityNeedsReview
  );
  let mappings = new Map();
  let requestFailed = false;

  if (eligible.length) {
    try {
      mappings = await fetchMappings(eligible.map((item) => kitsuIdOf(item)));
    } catch {
      requestFailed = true;
    }
  }

  const summary = {
    scanned: library.length,
    eligible: eligible.length,
    skippedLinked: 0,
    skippedNoKitsu: 0,
    skippedReview: 0,
    repaired: 0,
    unresolved: 0,
    collisions: 0,
    requestFailed,
    linkedBefore,
    linkedAfter: linkedBefore,
    changed: 0,
    updates: []
  };

  for (let index = 0; index < nextLibrary.length; index += 1) {
    const item = nextLibrary[index] || {};
    const title = String(item.officialTitle || item.title || `Library title ${index + 1}`).trim();
    onProgress?.({ index: index + 1, total: nextLibrary.length, title, summary: { ...summary } });

    if (malIdOf(item)) {
      summary.skippedLinked += 1;
    } else if (item.identityNeedsReview) {
      summary.skippedReview += 1;
    } else if (!kitsuIdOf(item)) {
      summary.skippedNoKitsu += 1;
    } else {
      const proposedMalId = String(mappings.get(String(kitsuIdOf(item))) || '').trim();
      if (!proposedMalId) {
        summary.unresolved += 1;
      } else {
        const collision = malCollision(nextLibrary, proposedMalId, index);
        if (collision) {
          summary.collisions += 1;
          summary.unresolved += 1;
        } else {
          nextLibrary[index] = {
            ...item,
            malId: Number(proposedMalId),
            malIdentityLinkageSource: 'kitsu-official-mapping',
            malIdentityLinkageUpdatedAt: new Date().toISOString()
          };
          summary.repaired += 1;
          summary.changed += 1;
          summary.updates.push({ kind: 'repaired', item: nextLibrary[index] });
        }
      }
    }

    if ((index + 1) % 20 === 0) await yieldControl();
  }

  summary.linkedAfter = nextLibrary.filter((item) => Boolean(malIdOf(item))).length;
  return { library: nextLibrary, ...summary };
}
