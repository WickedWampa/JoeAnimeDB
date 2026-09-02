import {
  buildTitleSearchQueries,
  compactTitleKey,
  normalizeTitleWords,
  romanToArabicTitleTokens,
  stripEditionNoise
} from '../utils/titleAliases';
const KITSU_API_BASE = 'https://kitsu.io/api/edge';

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

function extractSeasonNumber(value = '') {
  const title = romanToArabicTitleTokens(value);

  const patterns = [
    /\bseason\s*(\d+)\b/i,
    /\b(\d+)(?:st|nd|rd|th)\s+season\b/i,
    /\bpart\s*(\d+)\b/i,
    /\bcour\s*(\d+)\b/i,
    /\bs\s*(\d+)\b/i,
    /\b(\d+)\s*$/i
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) return Number(match[1]) || 0;
  }

  return 0;
}

function stripEditionNoiseForKitsu(value = '') {
  return normalizeTitleWords(stripEditionNoise(value))
    .replace(/\bseason\s+\d+\b/g, ' ')
    .replace(/\bpart\s+\d+\b/g, ' ')
    .replace(/\b(?:movie|film|special|ova|ona|recap)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitleKey(value = '') {
  return compactTitleKey(value);
}

function franchiseTitleKey(value = '') {
  const title = stripEditionNoiseForKitsu(value);

  if (/^re\s*zero\b/.test(title)) {
    return 'rezero';
  }

  if (/\breincarnated as a slime\b/.test(title)) {
    return 'reincarnatedasaslime';
  }

  return title
    .replace(/\bstarting life in another world\b/g, ' ')
    .replace(/\barise from the shadow\b/g, ' ')
    .replace(/\bmoonlit fantasy\b/g, ' moonlit fantasy ')
    .replace(/\s+/g, '')
    .trim();
}

function titleTokenSimilarity(left = '', right = '') {
  const leftTokens = new Set(normalizeTitleWords(left).split(' ').filter(Boolean));
  const rightTokens = new Set(normalizeTitleWords(right).split(' ').filter(Boolean));

  if (!leftTokens.size || !rightTokens.size) return 0;

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
}

function titleSimilarity(left = '', right = '') {
  const a = normalizeTitleKey(left);
  const b = normalizeTitleKey(right);

  if (!a || !b) return 0;
  if (a === b) return 1;

  const franchiseA = franchiseTitleKey(left);
  const franchiseB = franchiseTitleKey(right);

  if (franchiseA && franchiseA === franchiseB) {
    const seasonA = extractSeasonNumber(left);
    const seasonB = extractSeasonNumber(right);

    if (!seasonA || !seasonB || seasonA === seasonB) return 0.96;
    return 0.76;
  }

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;

  const containment = longer.includes(shorter)
    ? shorter.length / Math.max(longer.length, 1)
    : 0;

  return Math.max(containment, titleTokenSimilarity(left, right));
}

function scoreKitsuCandidate(candidate = {}, wantedItem = {}) {
  const wantedTitle =
    wantedItem.title ||
    wantedItem.officialTitle ||
    '';

  const names = [
    candidate.title,
    candidate.officialTitle,
    candidate.japaneseTitle,
    ...(candidate.titleSynonyms || [])
  ].filter(Boolean);

  const normalizedWanted = normalizeTitleKey(wantedTitle);
  const wantedSeason = extractSeasonNumber(wantedTitle);
  const wantedYear = Number(wantedItem.year || 0);
  const wantedEpisodes = Number(
    wantedItem.episodeCount ||
    wantedItem.episodes ||
    0
  );

  let score = 0;
  let bestSimilarity = 0;

  for (const name of names) {
    const normalizedName = normalizeTitleKey(name);
    const similarity = titleSimilarity(name, wantedTitle);
    bestSimilarity = Math.max(bestSimilarity, similarity);

    if (normalizedName && normalizedName === normalizedWanted) {
      score = Math.max(score, 100);
    } else if (franchiseTitleKey(name) === franchiseTitleKey(wantedTitle)) {
      score = Math.max(score, 88);
    } else {
      score = Math.max(score, Math.round(similarity * 82));
    }
  }

  const candidateSeason = Math.max(
    0,
    ...names.map(extractSeasonNumber)
  );

  if (wantedSeason && candidateSeason) {
    if (wantedSeason === candidateSeason) score += 14;
    else score -= 18;
  }

  const candidateYear = Number(candidate.year || 0);
  if (wantedYear && candidateYear) {
    const difference = Math.abs(wantedYear - candidateYear);
    if (difference === 0) score += 10;
    else if (difference === 1) score += 5;
    else if (difference >= 4) score -= 8;
  }

  const candidateEpisodes = Number(
    candidate.episodeCount ||
    candidate.episodes ||
    0
  );

  if (wantedEpisodes && candidateEpisodes) {
    const difference = Math.abs(wantedEpisodes - candidateEpisodes);
    if (difference === 0) score += 8;
    else if (difference <= 2) score += 4;
    else if (difference >= 8) score -= 6;
  }

  const type = String(candidate.type || '').toLowerCase();
  const wantedType = String(wantedItem.type || '').toLowerCase();

  if (wantedType && type === wantedType) score += 8;
  if (wantedType === 'movie' && type && type !== 'movie') score -= 20;
  if (type === 'tv') score += 4;
  if (/special|ova|ona/.test(type) && !/special|ova|ona/i.test(wantedItem.type || '')) {
    score -= 10;
  }

  return {
    candidate,
    score: Math.max(0, Math.min(120, score)),
    similarity: bestSimilarity
  };
}

function bestKitsuMatch(results = [], wantedItem = {}) {
  const ranked = results
    .map((candidate) => scoreKitsuCandidate(candidate, wantedItem))
    .sort((a, b) =>
      b.score - a.score ||
      b.similarity - a.similarity
    );

  const best = ranked[0];

  // Accept exact/strong franchise matches even when punctuation, subtitle, or
  // season formatting differs. Lower scores remain review-only.
  return best && best.score >= 78
    ? best.candidate
    : null;
}

async function fetchKitsuCategories(kitsuId) {
  if (!kitsuId) return [];

  try {
    const payload = await fetchKitsu(
      `/anime/${encodeURIComponent(kitsuId)}/categories?page[limit]=20`
    );

    return cleanArray(
      (payload.data || []).map((resource) => (
        resource?.attributes?.title ||
        resource?.attributes?.name ||
        resource?.attributes?.slug
      ))
    );
  } catch (error) {
    console.warn('Kitsu category lookup failed:', kitsuId, error);
    return [];
  }
}

function includedResourceIndex(included = []) {
  return new Map(
    (included || [])
      .filter((resource) => resource?.type && resource?.id)
      .map((resource) => [`${resource.type}:${resource.id}`, resource])
  );
}

function producerName(resource = {}) {
  return (
    resource?.attributes?.name ||
    resource?.attributes?.title ||
    resource?.attributes?.canonicalName ||
    resource?.attributes?.slug ||
    ''
  );
}

async function fetchKitsuStudios(kitsuId) {
  if (!kitsuId) return [];

  try {
    const payload = await fetchKitsuWithTimeout(
      `/anime/${encodeURIComponent(kitsuId)}/anime-productions?include=producer&page[limit]=20`,
      6000
    );

    const included = includedResourceIndex(payload.included || []);

    const studios = cleanArray(
      (payload.data || []).flatMap((production) => {
        const role = String(production?.attributes?.role || '').toLowerCase();
        if (role && !/studio|animation/.test(role)) return [];

        const link = production?.relationships?.producer?.data;
        const producer = link
          ? included.get(`${link.type}:${link.id}`)
          : null;

        const name = producerName(producer);
        return name ? [name] : [];
      })
    );

    return studios;
  } catch (error) {
    console.warn('[Kitsu Studios] lookup failed:', kitsuId, error);
    return [];
  }
}

export function normalizeKitsuAnime(resource = {}, base = {}) {
  const attributes = resource.attributes || {};
  const canonicalTitle = attributes.canonicalTitle || attributes.titles?.en || attributes.titles?.en_jp || base.title || '';
  const englishTitle = attributes.titles?.en || canonicalTitle;
  const synonyms = cleanArray([
    attributes.canonicalTitle,
    attributes.titles?.en,
    attributes.titles?.en_us,
    attributes.titles?.en_jp,
    attributes.titles?.ja_jp,
    ...(attributes.abbreviatedTitles || [])
  ]).filter((title) => title && title !== englishTitle);

  return {
    ...base,
    id: base.id || `kitsu-${resource.id}`,
    kitsuId: resource.id,
    title: englishTitle,
    officialTitle: englishTitle,
    englishTitle,
    canonicalTitle,
    japaneseTitle: attributes.titles?.ja_jp || '',
    titleSynonyms: synonyms,
    cover: posterFromAttributes(attributes) || base.cover || '',
    synopsis: attributes.synopsis || attributes.description || base.synopsis || '',
    description: attributes.description || attributes.synopsis || base.description || '',
    type: attributes.subtype || attributes.showType || base.type || 'TV',
    year: yearFromDate(attributes.startDate) || base.year || '',
    startDate: attributes.startDate || base.startDate || base.airedFrom || '',
    airedFrom: attributes.startDate || base.airedFrom || base.startDate || '',
    airedTo: attributes.endDate || base.airedTo || '',
    episodeCount: Number(attributes.episodeCount || 0) || base.episodeCount || 0,
    episodes: Number(attributes.episodeCount || 0) || base.episodes || base.episodeCount || 0,
    communityScore: scoreFromRating(attributes.averageRating) || base.communityScore || '',
    malScore: scoreFromRating(attributes.averageRating) || base.malScore || '',
    members: Number(attributes.userCount || 0) || base.members || 0,
    popularity: Number(attributes.popularityRank || 0) || base.popularity || '',
    rank: Number(attributes.ratingRank || 0) || base.rank || '',
    trailerUrl: attributes.youtubeVideoId
      ? `https://www.youtube.com/watch?v=${attributes.youtubeVideoId}`
      : base.trailerUrl || '',
    ageRating: attributes.ageRating || base.ageRating || '',
    ageRatingGuide: attributes.ageRatingGuide || base.ageRatingGuide || '',
    nsfw: typeof attributes.nsfw === 'boolean'
      ? attributes.nsfw
      : Boolean(base.nsfw),
    contentRatingCheckedAt: new Date().toISOString(),
    airingStatus: attributes.status || base.airingStatus || base.releaseStatus || '',
    status: base.status || attributes.status || 'Watching',
    metadataSource: 'kitsu',
    metadataReady: Boolean(
      (posterFromAttributes(attributes) || base.cover) &&
      (attributes.synopsis || attributes.description || base.synopsis || base.description)
    ),
    metadataNeedsRefresh: !(Array.isArray(base.genres) && base.genres.length),
    metadataUpdatedAt: new Date().toISOString(),
    syncStatus: {
      ...(base.syncStatus || {}),
      metadata: true,
      metadataSource: 'kitsu',
      dirty: !(Array.isArray(base.genres) && base.genres.length),
      lastMetadataSync: new Date().toISOString()
    }
  };
}

const KITSU_REQUEST_TIMEOUT_MS = 9000;

async function fetchKitsuWithTimeout(path, timeoutMs = KITSU_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${KITSU_API_BASE}${path}`, {
      headers: {
        Accept: 'application/vnd.api+json'
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const error = new Error(
        response.status === 429
          ? 'Kitsu is rate-limiting requests. Saved data is still available; try again later.'
          : `Kitsu returned HTTP ${response.status}. Saved data is still available.`
      );
      error.status = response.status;
      error.code = response.status === 429 ? 'KITSU_RATE_LIMITED' : 'KITSU_HTTP_ERROR';
      const retryAfter = Number(response.headers?.get?.('retry-after') || 0);
      if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterMs = retryAfter * 1000;
      throw error;
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      const malformedError = new Error('Kitsu returned an invalid response. Saved data is still available.');
      malformedError.code = 'KITSU_INVALID_RESPONSE';
      throw malformedError;
    }
    if (!payload || typeof payload !== 'object') {
      const malformedError = new Error('Kitsu returned an empty response. Saved data is still available.');
      malformedError.code = 'KITSU_INVALID_RESPONSE';
      throw malformedError;
    }
    return payload;
  } catch (error) {
    if (timedOut && error?.name === 'AbortError') {
      const timeoutError = new Error(`Kitsu timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
      timeoutError.code = 'KITSU_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchKitsu(path) {
  return fetchKitsuWithTimeout(path);
}


async function searchKitsuAnimeOnce(title, { limit = 8 } = {}) {
  const query = encodeURIComponent(String(title || '').trim());
  if (!query) return [];

  const payload = await fetchKitsu(
    `/anime?filter[text]=${query}&page[limit]=${Math.min(Math.max(limit, 1), 20)}`
  );

  return (payload.data || []).map((resource) => normalizeKitsuAnime(resource));
}

export async function searchKitsuAnime(title, { limit = 8 } = {}) {
  const queries = buildTitleSearchQueries(title);
  if (!queries.length) return [];

  const byId = new Map();

  for (const query of queries) {
    try {
      const rows = await searchKitsuAnimeOnce(query, { limit });

      rows.forEach((row) => {
        const key = String(row.kitsuId || row.id || '');
        if (!key || byId.has(key)) return;
        byId.set(key, row);
      });

      const exactFound = [...byId.values()].some((row) => {
        const names = [
          row.title,
          row.officialTitle,
          row.canonicalTitle,
          row.englishTitle,
          ...(row.titleSynonyms || [])
        ].filter(Boolean);

        return names.some(
          (name) => normalizeTitleKey(name) === normalizeTitleKey(title)
        );
      });

      if (exactFound) break;
    } catch (error) {
      // A timeout affects the provider, not just one spelling. Stop immediately
      // instead of waiting another nine seconds and logging every variant.
      if (error?.code === 'KITSU_TIMEOUT' || error?.name === 'AbortError') throw error;
      console.warn('Kitsu search variant failed:', query, error);
    }
  }

  const results = [...byId.values()];

  return results;
}

export async function fetchKitsuMetadata(item = {}) {
  const wantedTitle = item.officialTitle || item.title || '';
  let directMatch = null;

  if (item.kitsuId) {
    try {
      const payload = await fetchKitsu(`/anime/${encodeURIComponent(item.kitsuId)}`);
      if (payload?.data) directMatch = normalizeKitsuAnime(payload.data);
    } catch (error) {
      console.warn('[Kitsu Metadata] direct ID lookup failed; trying title search:', item.kitsuId, error);
    }
  }

  const results = directMatch
    ? [directMatch]
    : await searchKitsuAnime(wantedTitle, { limit: 8 });
  if (!results.length) throw new Error('Kitsu returned no matches');

  const match = directMatch || bestKitsuMatch(results, {
    ...item,
    title: wantedTitle
  });
  if (!match) {
    throw new Error(`Kitsu returned no confident title match for ${wantedTitle}`);
  }

  const [genres, studios] = await Promise.all([
    fetchKitsuCategories(match.kitsuId),
    fetchKitsuStudios(match.kitsuId)
  ]);

  return {
    ...item,
    ...match,
    id: item.id || match.id,
    title: item.title || match.title,
    officialTitle: match.officialTitle || match.title || item.officialTitle || wantedTitle,
    status: item.status || match.status || 'Watching',
    airingStatus: match.airingStatus || item.airingStatus || item.releaseStatus || '',
    favorite: Boolean(item.favorite),
    rewatches: Number(item.rewatches || 0),
    notes: item.notes || match.notes || '',
    genres: genres.length
      ? cleanArray([...(item.genres || []), ...genres]).slice(0, 12)
      : item.genres || [],
    studio: studios.length
      ? studios.join(' / ')
      : item.studio || match.studio || '',
    studioLookupAttemptedAt: new Date().toISOString(),
    metadataSource: 'kitsu',
    metadataNeedsRefresh: !genres.length,
    metadataUpdatedAt: new Date().toISOString(),
    syncStatus: {
      ...(item.syncStatus || {}),
      metadata: true,
      poster: Boolean(match.cover || item.cover),
      genres: Boolean(genres.length || item.genres?.length),
      studio: Boolean(studios.length || item.studio || match.studio),
      studioLookupAttempted: true,
      metadataSource: 'kitsu',
      dirty: !genres.length,
      lastMetadataSync: new Date().toISOString()
    }
  };
}

export async function fetchKitsuContentRating(item = {}) {
  const wantedTitle = item.officialTitle || item.title || '';
  let match = null;

  if (item.kitsuId) {
    try {
      const payload = await fetchKitsu(`/anime/${encodeURIComponent(item.kitsuId)}`);
      if (payload?.data) match = normalizeKitsuAnime(payload.data);
    } catch (error) {
      console.warn('[Kitsu Content Rating] direct ID lookup failed; trying title search:', item.kitsuId, error);
    }
  }

  if (!match) {
    const results = await searchKitsuAnime(wantedTitle, { limit: 8 });
    match = bestKitsuMatch(results, {
      ...item,
      title: wantedTitle
    });
  }

  if (!match) {
    throw new Error(`Kitsu returned no confident title match for ${wantedTitle}`);
  }

  return {
    kitsuId: match.kitsuId || item.kitsuId || '',
    ageRating: match.ageRating || '',
    ageRatingGuide: match.ageRatingGuide || '',
    nsfw: Boolean(match.nsfw),
    contentRatingCheckedAt: match.contentRatingCheckedAt || new Date().toISOString()
  };
}


export async function fetchKitsuFollowingSnapshot(item = {}) {
  const wantedTitle = item.title || item.officialTitle || '';
  const results = await searchKitsuAnime(wantedTitle, { limit: 8 });

  if (!results.length) {
    throw new Error(`Kitsu returned no matches for ${wantedTitle}`);
  }

  const match = bestKitsuMatch(results, item);
  if (!match) {
    throw new Error(`Kitsu returned no confident title match for ${wantedTitle}`);
  }

  return {
    kitsuId: match.kitsuId || item.kitsuId || '',
    title: item.title || match.title || wantedTitle,
    officialTitle: match.officialTitle || match.title || item.officialTitle || wantedTitle,
    status: String(match.status || '').toLowerCase(),
    startDate: match.startDate || match.airedFrom || '',
    airedFrom: match.airedFrom || match.startDate || '',
    airedTo: match.airedTo || '',
    episodeCount: Number(match.episodeCount || match.episodes || 0),
    episodes: Number(match.episodes || match.episodeCount || 0),
    cover: match.cover || item.cover || '',
    synopsis: match.synopsis || match.description || item.synopsis || '',
    year: match.year || item.year || '',
    checkedAt: new Date().toISOString(),
    metadataSource: 'kitsu'
  };
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

function appendKitsuPagination(path, { limit = 20, offset = 0 } = {}) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}page[limit]=${limit}&page[offset]=${offset}`;
}

async function fetchPaginatedKitsuCollection({
  paths = [],
  target = 60,
  pageSize = 20,
  maxPages = 6
} = {}) {
  let lastError = null;

  for (const basePath of paths) {
    const collected = [];
    const seen = new Set();

    try {
      for (let page = 0; page < maxPages && collected.length < target; page += 1) {
        const offset = page * pageSize;
        const rows = await fetchKitsuAnimeCollection(
          appendKitsuPagination(basePath, {
            limit: pageSize,
            offset
          })
        );

        if (!rows.length) break;

        rows.forEach((row) => {
          const key = String(row?.id || '');
          if (!key || seen.has(key)) return;
          seen.add(key);
          collected.push(row);
        });

        if (rows.length < pageSize) break;
      }

      if (collected.length) return collected;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return [];
}

export async function fetchKitsuLiveDiscoverFeeds({
  limit = 60,
  currentLimit,
  upcomingLimit
} = {}) {
  const safeCurrentLimit = Math.min(
    Math.max(Number(currentLimit || Math.min(limit, 40) || 40), 1),
    100
  );
  const safeUpcomingLimit = Math.min(
    Math.max(Number(upcomingLimit || limit || 60), 1),
    100
  );
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);

  const [currentResult, futureResult, tbaResult] = await Promise.allSettled([
    fetchPaginatedKitsuCollection({
      target: Math.max(safeCurrentLimit * 2, 40),
      paths: [
        '/anime?filter[status]=current&sort=-userCount',
        '/anime?filter[status]=current'
      ]
    }),
    fetchPaginatedKitsuCollection({
      target: Math.max(safeUpcomingLimit * 2, 80),
      paths: [
        '/anime?filter[status]=upcoming&sort=startDate',
        '/anime?filter[status]=unreleased&sort=startDate',
        '/anime?sort=-startDate'
      ]
    }),
    fetchPaginatedKitsuCollection({
      target: Math.min(Math.max(safeUpcomingLimit, 20), 60),
      paths: [
        '/anime?filter[status]=tba&sort=-userCount',
        '/anime?filter[status]=tba'
      ]
    })
  ]);

  if (
    currentResult.status === 'rejected' &&
    futureResult.status === 'rejected' &&
    tbaResult.status === 'rejected'
  ) {
    throw new Error(
      `Kitsu live feeds failed: ${currentResult.reason?.message || currentResult.reason}; ${futureResult.reason?.message || futureResult.reason}; ${tbaResult.reason?.message || tbaResult.reason}`
    );
  }

  const currentResources = currentResult.status === 'fulfilled'
    ? currentResult.value
    : [];
  const upcomingResources = [
    ...(futureResult.status === 'fulfilled' ? futureResult.value : []),
    ...(tbaResult.status === 'fulfilled' ? tbaResult.value : [])
  ].filter((resource, index, rows) => (
    rows.findIndex((candidate) => String(candidate?.id || '') === String(resource?.id || '')) === index
  ));
  const warnings = [];

  if (currentResult.status === 'rejected') {
    warnings.push(`Kitsu current feed failed: ${currentResult.reason?.message || currentResult.reason}`);
  }
  if (futureResult.status === 'rejected') {
    warnings.push(`Kitsu future-date feed failed: ${futureResult.reason?.message || futureResult.reason}`);
  }
  if (tbaResult.status === 'rejected') {
    warnings.push(`Kitsu date-TBA feed failed: ${tbaResult.reason?.message || tbaResult.reason}`);
  }

  const current = currentResources
    .filter((resource) => {
      const attributes = resource.attributes || {};
      const status = discoverStatus(attributes);
      const start = discoverStartDate(attributes);
      const end = String(attributes.endDate || '');
      return status === 'current' || (start && start <= todayKey && (!end || end >= todayKey));
    })
    .sort((a, b) => {
      const left = discoverStartDate(a.attributes || {});
      const right = discoverStartDate(b.attributes || {});
      return String(right || '').localeCompare(String(left || ''));
    })
    .slice(0, safeCurrentLimit)
    .map((resource) => normalizeKitsuCatalogAnime(resource, 'current'));

  const upcoming = upcomingResources
    .filter((resource) => {
      const attributes = resource.attributes || {};
      const status = discoverStatus(attributes);
      const start = discoverStartDate(attributes);
      return ['tba', 'unreleased', 'upcoming'].includes(status) || (start && start > todayKey);
    })
    .sort((a, b) => {
      const left = discoverStartDate(a.attributes || {}) || '9999-12-31';
      const right = discoverStartDate(b.attributes || {}) || '9999-12-31';
      return left.localeCompare(right);
    })
    .slice(0, safeUpcomingLimit)
    .map((resource) => normalizeKitsuCatalogAnime(resource, 'upcoming'));

  return {
    current,
    upcoming,
    source: 'kitsu',
    partial: warnings.length > 0,
    warnings,
    fetched: {
      current: currentResources.length,
      upcoming: upcomingResources.length
    }
  };
}
