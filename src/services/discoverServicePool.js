import {
  getCachedWhereToWatch,
  groupWatchProvidersByPreference
} from './watchmodeService';

function titleOf(item = {}) {
  return String(item.officialTitle || item.title || '').trim();
}

function identityKey(item = {}) {
  if (item.kitsuId) return `kitsu:${item.kitsuId}`;
  if (item.malId) return `mal:${item.malId}`;
  return titleOf(item).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function catalogScore(item = {}) {
  return Number(item.communityScore ?? item.malScore ?? item.score ?? 0) || 0;
}

export function buildCachedServiceDiscoverPool(
  candidates = [],
  selectedApps = [],
  region = 'US',
  cacheSnapshot = {}
) {
  if (!Array.isArray(selectedApps) || !selectedApps.length) return [];

  const seen = new Set();
  const matches = [];

  for (const item of Array.isArray(candidates) ? candidates : []) {
    const key = identityKey(item);
    if (!key || seen.has(key)) continue;

    const payload = getCachedWhereToWatch(item, {
      region,
      allowStale: true,
      cacheSnapshot
    });
    if (payload?.status !== 'ready') continue;

    const { preferred } = groupWatchProvidersByPreference(payload.providers, selectedApps);
    if (!preferred.length) continue;

    seen.add(key);
    matches.push({
      ...item,
      discoverPreferredProvider: preferred[0],
      discoverServiceProviders: preferred,
      discoverServiceLabel: preferred.map((provider) => provider.name).filter(Boolean).join(' + ')
    });
  }

  return matches.sort((left, right) => (
    catalogScore(right) - catalogScore(left)
    || titleOf(left).localeCompare(titleOf(right))
  ));
}
