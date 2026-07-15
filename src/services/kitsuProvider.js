const KITSU_API_BASE = 'https://kitsu.io/api/edge';
const REQUEST_TIMEOUT_MS = 12000;

function withTimeout(promise, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    run: promise(controller.signal).finally(() => clearTimeout(timeout))
  };
}

function cleanArray(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function posterFromAttributes(attributes = {}) {
  return attributes.posterImage?.original ||
    attributes.posterImage?.large ||
    attributes.posterImage?.medium ||
    attributes.posterImage?.small ||
    '';
}

function yearFromDate(value = '') {
  const match = String(value).match(/^(\d{4})/);
  return match ? Number(match[1]) : '';
}

function scoreFromRating(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Number((numeric / 10).toFixed(2)) : '';
}

export function normalizeKitsuAnime(resource = {}, base = {}) {
  const attributes = resource.attributes || {};
  const canonicalTitle = attributes.canonicalTitle || attributes.titles?.en || attributes.titles?.en_jp || base.title || '';
  const englishTitle = attributes.titles?.en || canonicalTitle;
  const synonyms = cleanArray([
    attributes.titles?.en_jp,
    attributes.titles?.ja_jp,
    ...(attributes.abbreviatedTitles || [])
  ]).filter((title) => title !== englishTitle);

  return {
    ...base,
    id: base.id || `kitsu-${resource.id}`,
    kitsuId: resource.id,
    title: englishTitle,
    officialTitle: englishTitle,
    japaneseTitle: attributes.titles?.ja_jp || '',
    titleSynonyms: synonyms,
    cover: posterFromAttributes(attributes) || base.cover || '',
    synopsis: attributes.synopsis || attributes.description || base.synopsis || '',
    description: attributes.description || attributes.synopsis || base.description || '',
    type: attributes.subtype || attributes.showType || base.type || 'TV',
    year: yearFromDate(attributes.startDate) || base.year || '',
    episodeCount: Number(attributes.episodeCount || 0) || base.episodeCount || 0,
    episodes: Number(attributes.episodeCount || 0) || base.episodes || base.episodeCount || 0,
    communityScore: scoreFromRating(attributes.averageRating) || base.communityScore || '',
    malScore: scoreFromRating(attributes.averageRating) || base.malScore || '',
    ageRating: attributes.ageRating || base.ageRating || '',
    status: base.status || attributes.status || 'Watching',
    metadataSource: 'kitsu',
    metadataNeedsRefresh: true,
    metadataUpdatedAt: new Date().toISOString(),
    syncStatus: {
      ...(base.syncStatus || {}),
      metadata: true,
      metadataSource: 'kitsu',
      dirty: true,
      lastMetadataSync: new Date().toISOString()
    }
  };
}

async function fetchKitsu(path) {
  const request = withTimeout((signal) => fetch(`${KITSU_API_BASE}${path}`, {
    signal,
    headers: {
      Accept: 'application/vnd.api+json'
    }
  }));

  let response;
  try {
    response = await request.run;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Kitsu request timed out');
    throw error;
  }

  if (!response.ok) throw new Error(`Kitsu ${response.status}`);
  return response.json();
}

export async function searchKitsuAnime(title, { limit = 8 } = {}) {
  const query = encodeURIComponent(String(title || '').trim());
  if (!query) return [];

  const payload = await fetchKitsu(`/anime?filter[text]=${query}&page[limit]=${Math.min(Math.max(limit, 1), 20)}`);
  return (payload.data || []).map((resource) => normalizeKitsuAnime(resource));
}

export async function fetchKitsuMetadata(item = {}) {
  const results = await searchKitsuAnime(item.title || item.officialTitle || '', { limit: 8 });
  if (!results.length) throw new Error('Kitsu returned no matches');

  const normalizedWanted = String(item.title || item.officialTitle || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const match = results.find((candidate) => [
    candidate.title,
    candidate.officialTitle,
    ...(candidate.titleSynonyms || [])
  ].some((title) => String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '') === normalizedWanted)) || results[0];

  return normalizeKitsuAnime({ id: match.kitsuId, attributes: {
    canonicalTitle: match.title,
    titles: {
      en: match.officialTitle,
      ja_jp: match.japaneseTitle
    },
    abbreviatedTitles: match.titleSynonyms,
    posterImage: { original: match.cover },
    synopsis: match.synopsis,
    description: match.description,
    subtype: match.type,
    startDate: match.year ? `${match.year}-01-01` : null,
    episodeCount: match.episodeCount,
    averageRating: match.communityScore ? Number(match.communityScore) * 10 : null,
    ageRating: match.ageRating,
    status: match.status
  } }, item);
}


function discoverStatus(attributes = {}) {
  return String(attributes.status || '').toLowerCase();
}

function discoverStartDate(attributes = {}) {
  return String(attributes.startDate || '');
}

function normalizeKitsuCatalogAnime(resource = {}, bucket = '') {
  const attributes = resource.attributes || {};
  const normalized = normalizeKitsuAnime(resource, {
    status: attributes.status || '',
    metadataNeedsRefresh: true
  });

  const startDate = discoverStartDate(attributes);
  const endDate = String(attributes.endDate || '');

  return {
    ...normalized,
    id: `catalog-kitsu-${resource.id}`,
    kitsuId: resource.id,
    status: attributes.status || '',
    startDate,
    airedFrom: startDate,
    airedTo: endDate,
    discoverBucket: bucket || undefined,
    discoverSource: bucket ? `Kitsu ${bucket === 'current' ? 'Current' : 'Upcoming'} Feed` : 'Kitsu Catalog',
    discoverSyncedAt: bucket ? new Date().toISOString() : undefined,
    catalogSource: bucket ? `Kitsu ${bucket === 'current' ? 'Current' : 'Upcoming'} Feed` : 'Kitsu Catalog',
    metadataSource: 'kitsu',
    metadataNeedsRefresh: true
  };
}

async function fetchKitsuAnimeCollection(path) {
  const payload = await fetchKitsu(path);
  return Array.isArray(payload?.data) ? payload.data : [];
}

export async function fetchKitsuCatalogPage({ page = 1, limit = 25 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit || 25), 1), 20);
  const safePage = Math.max(Number(page || 1), 1);
  const offset = (safePage - 1) * safeLimit;
  const rows = await fetchKitsuAnimeCollection(
    `/anime?sort=-userCount&page[limit]=${safeLimit}&page[offset]=${offset}`
  );

  return {
    rows: rows.map((resource) => normalizeKitsuCatalogAnime(resource)),
    page: safePage,
    nextPage: rows.length < safeLimit ? 1 : safePage + 1,
    received: rows.length,
    source: 'kitsu'
  };
}

async function fetchFirstWorkingKitsuCollection(paths = []) {
  let lastError = null;

  for (const path of paths) {
    try {
      const rows = await fetchKitsuAnimeCollection(path);
      if (rows.length) return rows;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return [];
}

export async function fetchKitsuLiveDiscoverFeeds({ limit = 20 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit || 20), 1), 20);
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);

  const currentResources = await fetchFirstWorkingKitsuCollection([
    `/anime?filter[status]=current&sort=-userCount&page[limit]=${safeLimit}`,
    `/anime?filter[status]=current&page[limit]=${safeLimit}`
  ]);

  const upcomingResources = await fetchFirstWorkingKitsuCollection([
    `/anime?filter[status]=tba&sort=-userCount&page[limit]=${safeLimit}`,
    `/anime?filter[status]=unreleased&sort=-userCount&page[limit]=${safeLimit}`,
    `/anime?filter[status]=upcoming&sort=-userCount&page[limit]=${safeLimit}`,
    `/anime?sort=startDate&page[limit]=${safeLimit}`
  ]);

  const current = currentResources
    .filter((resource) => {
      const attributes = resource.attributes || {};
      const status = discoverStatus(attributes);
      const start = discoverStartDate(attributes);
      const end = String(attributes.endDate || '');
      return status === 'current' || (start && start <= todayKey && (!end || end >= todayKey));
    })
    .slice(0, safeLimit)
    .map((resource) => normalizeKitsuCatalogAnime(resource, 'current'));

  const upcoming = upcomingResources
    .filter((resource) => {
      const attributes = resource.attributes || {};
      const status = discoverStatus(attributes);
      const start = discoverStartDate(attributes);
      return ['tba', 'unreleased', 'upcoming'].includes(status) || (start && start > todayKey);
    })
    .slice(0, safeLimit)
    .map((resource) => normalizeKitsuCatalogAnime(resource, 'upcoming'));

  return { current, upcoming, source: 'kitsu' };
}
