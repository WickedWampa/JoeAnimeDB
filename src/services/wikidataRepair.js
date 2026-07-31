import { fetchKitsuMetadata } from './kitsuProvider';
import {
  buildTitleSearchQueries,
  franchiseBaseTitle,
  knownTitles,
  titleSearchKey,
  uniqueTitles
} from '../utils/titleAliases';

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const REQUEST_TIMEOUT_MS = 10000;
const MIN_CONFIDENCE = 88;

function clean(value = '') {
  return String(value || '').trim();
}

function titleKey(value = '') {
  return titleSearchKey(value);
}

function unique(values = []) {
  return uniqueTitles(values);
}

function studioNames(item = {}) {
  const values = [
    item.animationStudios,
    item.productionStudios,
    item.studios,
    item.studio
  ];

  const names = values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .flatMap((value) => {
      if (!value) return [];
      if (typeof value === 'object') {
        return [value.name || value.title || value.label || ''];
      }
      return String(value).split(/\s+\/\s+|\s*;\s*|\s*\|\s*/);
    })
    .map(clean)
    .filter(Boolean);

  return [...new Set(names)];
}

function franchiseMatchScore(target = {}, candidate = {}) {
  const targetBase = titleKey(franchiseBaseTitle(target.officialTitle || target.title));
  const candidateBase = titleKey(franchiseBaseTitle(candidate.officialTitle || candidate.title));

  if (!targetBase || !candidateBase) return 0;
  if (targetBase === candidateBase) return 100;

  const similarityScore = similarity(targetBase, candidateBase);
  if (similarityScore < 0.78) return 0;

  let score = Math.round(similarityScore * 90);

  const targetYear = Number(target.year || 0);
  const candidateYear = Number(candidate.year || 0);

  if (targetYear && candidateYear) {
    const difference = Math.abs(targetYear - candidateYear);
    if (difference <= 4) score += 5;
    else if (difference >= 10) score -= 12;
  }

  return Math.max(0, Math.min(99, score));
}

function findLocalFranchiseStudio(item = {}, library = []) {
  if (studioNames(item).length) return null;

  const candidates = (Array.isArray(library) ? library : [])
    .filter((candidate) => candidate && candidate.id !== item.id)
    .map((candidate) => ({
      candidate,
      studios: studioNames(candidate),
      confidence: franchiseMatchScore(item, candidate)
    }))
    .filter((entry) => entry.studios.length && entry.confidence >= 92)
    .sort((a, b) => b.confidence - a.confidence);

  const best = candidates[0];
  if (!best) return null;

  // Avoid inheritance when two equally strong franchise matches disagree.
  const competing = candidates.filter(
    (entry) =>
      entry.confidence >= best.confidence - 2 &&
      entry.studios.join('|').toLowerCase() !== best.studios.join('|').toLowerCase()
  );

  if (competing.length) return null;

  return {
    studios: best.studios,
    confidence: best.confidence,
    inheritedFrom:
      best.candidate.officialTitle ||
      best.candidate.title ||
      'local franchise record'
  };
}

function buildSearchQueries(item = {}) {
  return buildTitleSearchQueries(item, { includeAnimeTerms: true, limit: 36 });
}

function similarity(left = '', right = '') {
  const a = new Set(titleKey(left).split(' ').filter(Boolean));
  const b = new Set(titleKey(right).split(' ').filter(Boolean));

  if (!a.size || !b.size) return 0;

  const overlap = [...a].filter((token) => b.has(token)).length;
  return overlap / Math.max(a.size, b.size);
}

async function fetchJson(url, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) throw new Error(`Wikidata ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function apiUrl(params = {}) {
  const search = new URLSearchParams({
    origin: '*',
    format: 'json',
    ...params
  });

  return `${WIKIDATA_API}?${search.toString()}`;
}

async function searchEntities(title = '') {
  const payload = await fetchJson(apiUrl({
    action: 'wbsearchentities',
    language: 'en',
    uselang: 'en',
    type: 'item',
    limit: '12',
    search: title
  }));

  return payload.search || [];
}

async function fetchEntities(ids = [], props = 'labels|aliases|descriptions|claims') {
  if (!ids.length) return {};

  const payload = await fetchJson(apiUrl({
    action: 'wbgetentities',
    ids: ids.join('|'),
    languages: 'en',
    languagefallback: '1',
    props
  }));

  return payload.entities || {};
}

function entityNames(entity = {}) {
  return [
    entity.labels?.en?.value,
    ...(entity.aliases?.en || []).map((entry) => entry.value)
  ].map(titleKey).filter(Boolean);
}

function claimEntityIds(entity = {}, property = '') {
  return (entity.claims?.[property] || [])
    .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
    .filter(Boolean);
}

function claimTimeYear(entity = {}, property = 'P577') {
  const claims = entity.claims?.[property] || [];

  for (const claim of claims) {
    const time = claim?.mainsnak?.datavalue?.value?.time;
    const match = String(time || '').match(/[+-](\d{4,})-/);
    if (match) return Number(match[1]);
  }

  return 0;
}

function claimReleaseYear(entity = {}) {
  // Films commonly use publication date (P577), while anime series often use
  // start time (P580). Treat either as a valid release year.
  return claimTimeYear(entity, 'P577') || claimTimeYear(entity, 'P580');
}

function claimQuantity(entity = {}, property = '') {
  const amount = entity.claims?.[property]?.[0]?.mainsnak?.datavalue?.value?.amount;
  const number = Number(amount);
  return Number.isFinite(number) ? Math.abs(number) : 0;
}

function scoreEntity(item = {}, searchRow = {}, entity = {}, matchedQuery = '') {
  const wantedTitles = knownTitles(item).map(titleKey);
  const normalizedTitles = buildSearchQueries(item).map(titleKey);
  const names = entityNames(entity);

  const exactOriginal = wantedTitles.some((title) => names.includes(title));
  const exactNormalized = normalizedTitles.some((title) => names.includes(title));

  let score = exactOriginal
    ? 100
    : exactNormalized
      ? 94
      : Math.round(
          Math.max(
            ...knownTitles(item).map((title) =>
              similarity(
                title,
                searchRow.label || entity.labels?.en?.value || ''
              )
            ),
            similarity(
              matchedQuery,
              searchRow.label || entity.labels?.en?.value || ''
            )
          ) * 82
        );

  const description = String(
    searchRow.description || entity.descriptions?.en?.value || ''
  ).toLowerCase();

  const instanceOfIds = claimEntityIds(entity, 'P31');
  const productionCompanyIds = claimEntityIds(entity, 'P272');

  const isAnimeDescription =
    /anime television|anime tv|anime series|animated television|animated series|animated film/.test(description);
  const isBroadFranchise =
    /media franchise|multimedia franchise|franchise|fictional universe|media mix/.test(description) ||
    instanceOfIds.includes('Q196600');
  const isSourceMaterial =
    /manga series|comic series|manga|light novel|novel series|web novel/.test(description);
  const isClearlyWrongType =
    /video game|song|album|person|character|soundtrack|music group/.test(description);

  // Entity type must beat a raw exact-title match. Broad franchise/source
  // material pages often have the perfect label but cannot provide the anime
  // season's studio, year, or episode count.
  if (isAnimeDescription) {
    score += 34;
  } else if (/\banime\b/.test(description)) {
    score += 22;
  }

  if (isBroadFranchise) score -= 72;
  if (isSourceMaterial) score -= 58;
  if (isClearlyWrongType) score -= 72;

  // Known classes commonly used by Wikidata for anime/animated TV works.
  if (
    instanceOfIds.includes('Q63952888') ||
    instanceOfIds.includes('Q581714') ||
    instanceOfIds.includes('Q5398426')
  ) {
    score += 34;
  }

  const sourceYear = Number(item.year || 0);
  const entityYear = claimReleaseYear(entity);

  if (sourceYear && entityYear) {
    const difference = Math.abs(sourceYear - entityYear);
    if (difference === 0) score += 22;
    else if (difference === 1) score += 10;
    else if (difference >= 4) score -= 22;
  }

  const needsStudio = !String(item.studio || '').trim();

  if (needsStudio) {
    if (productionCompanyIds.length) score += 24;
    else score -= 18;
  }

  const sourceEpisodes = Number(item.episodeCount || item.episodes || 0);
  const entityEpisodes = claimQuantity(entity, 'P1113');

  if (sourceEpisodes && entityEpisodes) {
    const difference = Math.abs(sourceEpisodes - entityEpisodes);
    if (difference === 0) score += 22;
    else if (difference <= 2) score += 10;
    else if (difference >= 10) score -= 18;
  }

  // Never allow a franchise/source-material entity to remain "high confidence"
  // solely because its label exactly matches the user's anime title.
  if (isBroadFranchise || isSourceMaterial || isClearlyWrongType) {
    score = Math.min(score, 54);
  }

  return Math.max(0, Math.min(100, score));
}

async function labelsForIds(ids = []) {
  const uniqueIds = [...new Set(ids)].slice(0, 50);
  const entities = await fetchEntities(uniqueIds, 'labels');

  return uniqueIds
    .map((id) => entities[id]?.labels?.en?.value)
    .filter(Boolean);
}

function debugCandidate(entry = {}, item = {}) {
  const entity = entry.entity || {};
  return {
    requestedTitle: item.officialTitle || item.title || '',
    wikidataId: entry.row?.id || '',
    label: entry.row?.label || entity.labels?.en?.value || '',
    description:
      entry.row?.description ||
      entity.descriptions?.en?.value ||
      '',
    confidence: entry.confidence || 0,
    instanceOfIds: claimEntityIds(entity, 'P31'),
    productionCompanyIds: claimEntityIds(entity, 'P272'),
    releaseYear: claimReleaseYear(entity),
    episodeCount: claimQuantity(entity, 'P1113'),
    matchedQueries: entry.matchedQueries || []
  };
}

async function collectRankedCandidates(item = {}) {
  const queries = buildSearchQueries(item);
  const rowsById = new Map();

  for (const query of queries) {
    try {
      const rows = await searchEntities(query);

      for (const row of rows) {
        const previous = rowsById.get(row.id);

        if (!previous) {
          rowsById.set(row.id, {
            row,
            matchedQueries: [query]
          });
        } else if (!previous.matchedQueries.includes(query)) {
          previous.matchedQueries.push(query);
        }
      }
    } catch (error) {
      console.warn('Wikidata search variant failed:', query, error);
    }

    // Continue through the curated query variants. Early stopping here caused
    // broad source-material results to crowd out the correct anime entity.
    if (rowsById.size >= 80) break;
  }

  const rows = [...rowsById.values()].slice(0, 80);
  if (!rows.length) throw new Error('No Wikidata result found');

  const ids = rows.map((entry) => entry.row.id).filter(Boolean);
  const entities = await fetchEntities(ids);

  const ranked = rows
    .map((entry) => {
      const entity = entities[entry.row.id];
      const confidence = entity
        ? Math.max(
            ...entry.matchedQueries.map((query) =>
              scoreEntity(item, entry.row, entity, query)
            )
          )
        : 0;

      return {
        ...entry,
        entity,
        confidence
      };
    })
    .filter((entry) => entry.entity)
    .sort((a, b) => b.confidence - a.confidence);

  console.groupCollapsed(
    `[Wikidata Resolver] ${item.officialTitle || item.title || 'Unknown title'}`
  );
  console.table(
    ranked.slice(0, 5).map((entry) => debugCandidate(entry, item))
  );
  console.groupEnd();

  return ranked;
}

export function wikidataRepairNeeds(item = {}) {
  const releaseStatus = clean(
    item.airingStatus ||
    item.releaseStatus ||
    item.broadcastStatus ||
    ''
  ).toLowerCase();
  const episodeTotalIsOpen = [
    'current',
    'airing',
    'upcoming',
    'unreleased',
    'tba'
  ].some((status) => releaseStatus.includes(status));

  return {
    studio: !String(item.studio || '').trim(),
    genres: !Array.isArray(item.genres) || item.genres.length === 0,
    year: !Number(item.year || 0),
    episodes: !Number(item.episodeCount || item.episodes || 0) && !episodeTotalIsOpen
  };
}

export function needsWikidataRepair(item = {}) {
  return Object.values(wikidataRepairNeeds(item)).some(Boolean);
}

export async function fetchWikidataRepair(item = {}, library = []) {
  const requestedNeeds = wikidataRepairNeeds(item);
  let kitsuPatch = {};
  let kitsuFields = [];

  try {
    const kitsu = await fetchKitsuMetadata(item);
    const kitsuStudios = studioNames(kitsu);

    kitsuPatch = {
      kitsuId: kitsu.kitsuId || item.kitsuId || '',
      airingStatus: kitsu.airingStatus || item.airingStatus || '',
      startDate: kitsu.startDate || kitsu.airedFrom || item.startDate || item.airedFrom || '',
      airedFrom: kitsu.airedFrom || kitsu.startDate || item.airedFrom || item.startDate || '',
      airedTo: kitsu.airedTo || item.airedTo || '',
      metadataRepairSource: 'kitsu-primary-repair',
      kitsuRepairUpdatedAt: new Date().toISOString()
    };

    if (requestedNeeds.studio && kitsuStudios.length) {
      kitsuPatch.studio = kitsuStudios.join(' / ');
      kitsuPatch.productionStudios = kitsuStudios;
      kitsuFields.push('studio');
    }

    if (requestedNeeds.genres && kitsu.genres?.length) {
      kitsuPatch.genres = [...new Set(kitsu.genres)];
      kitsuFields.push('genres');
    }

    if (requestedNeeds.year && Number(kitsu.year || 0)) {
      kitsuPatch.year = Number(kitsu.year);
      kitsuFields.push('year');
    }

    const kitsuEpisodes = Number(kitsu.episodeCount || kitsu.episodes || 0);
    if (requestedNeeds.episodes && kitsuEpisodes) {
      kitsuPatch.episodeCount = kitsuEpisodes;
      kitsuPatch.episodes = kitsuEpisodes;
      kitsuFields.push('episodes');
    }
  } catch (error) {
    console.warn('[Metadata Repair] Kitsu pass unavailable; trying Wikidata:', item.title || item.officialTitle || 'title', error);
  }

  const kitsuCompletedItem = { ...item, ...kitsuPatch };
  const needs = wikidataRepairNeeds(kitsuCompletedItem);

  if (!Object.values(needs).some(Boolean)) {
    return {
      patch: kitsuPatch,
      confidence: 100,
      matchedTitle: kitsuCompletedItem.officialTitle || kitsuCompletedItem.title,
      matchedQuery: item.kitsuId ? `kitsu:${item.kitsuId}` : 'Kitsu title match',
      remainingNeeds: needs,
      resolvedFields: kitsuFields.length ? kitsuFields : ['ongoing episode total']
    };
  }

  const inheritedStudio = needs.studio
    ? findLocalFranchiseStudio(kitsuCompletedItem, library)
    : null;

  const inheritedPatch = inheritedStudio
    ? {
        studio: inheritedStudio.studios.join(' / '),
        productionStudios: inheritedStudio.studios,
        metadataRepairSource: 'local-franchise-inheritance',
        franchiseRepairConfidence: inheritedStudio.confidence,
        franchiseRepairInheritedFrom: inheritedStudio.inheritedFrom,
        wikidataRepairUpdatedAt: new Date().toISOString()
      }
    : {};

  // If studio is the only missing field and a safe franchise inheritance exists,
  // avoid a network request entirely.
  const otherMissing = needs.genres || needs.year || needs.episodes;
  if (inheritedStudio && !otherMissing) {
    return {
      patch: { ...kitsuPatch, ...inheritedPatch },
      confidence: inheritedStudio.confidence,
      matchedTitle: inheritedStudio.inheritedFrom,
      matchedQuery: 'local franchise inheritance',
      remainingNeeds: wikidataRepairNeeds({
        ...kitsuCompletedItem,
        ...inheritedPatch
      }),
      resolvedFields: [...new Set([...kitsuFields, 'studio'])]
    };
  }

  let ranked;
  try {
    ranked = await collectRankedCandidates(kitsuCompletedItem);
  } catch (error) {
    if (!kitsuFields.length) throw error;

    return {
      patch: kitsuPatch,
      confidence: 95,
      matchedTitle: kitsuCompletedItem.officialTitle || kitsuCompletedItem.title,
      matchedQuery: item.kitsuId ? `kitsu:${item.kitsuId}` : 'Kitsu title match',
      remainingNeeds: needs,
      unresolvedReason: error?.message || String(error),
      resolvedFields: kitsuFields
    };
  }
  const best = ranked[0];

  if (!best || best.confidence < MIN_CONFIDENCE) {
    if (inheritedStudio) {
      return {
        patch: { ...kitsuPatch, ...inheritedPatch },
        confidence: inheritedStudio.confidence,
        matchedTitle: inheritedStudio.inheritedFrom,
        matchedQuery: 'local franchise inheritance',
        remainingNeeds: wikidataRepairNeeds({
          ...kitsuCompletedItem,
          ...inheritedPatch
        }),
        resolvedFields: [...new Set([...kitsuFields, 'studio'])]
      };
    }

    if (kitsuFields.length) {
      return {
        patch: kitsuPatch,
        confidence: 95,
        matchedTitle: kitsuCompletedItem.officialTitle || kitsuCompletedItem.title,
        matchedQuery: item.kitsuId ? `kitsu:${item.kitsuId}` : 'Kitsu title match',
        remainingNeeds: needs,
        unresolvedReason: best
          ? `No confident Wikidata match (${best.confidence}%)`
          : 'No Wikidata entity could be loaded',
        resolvedFields: kitsuFields
      };
    }

    const error = new Error(
      best
        ? `No confident Wikidata match (${best.confidence}%)`
        : 'No Wikidata entity could be loaded'
    );

    error.candidates = ranked.slice(0, 5).map((entry) => ({
      id: entry.row.id,
      title: entry.row.label,
      description: entry.row.description,
      confidence: entry.confidence,
      matchedQueries: entry.matchedQueries
    }));

    throw error;
  }

  const entity = best.entity;

  // P272 = production company.
  const productionIds = claimEntityIds(entity, 'P272');
  // P136 = genre.
  const genreIds = claimEntityIds(entity, 'P136');

  const [productionNames, genreNames] = await Promise.all([
    needs.studio ? labelsForIds(productionIds) : [],
    needs.genres ? labelsForIds(genreIds) : []
  ]);

  console.log('[Wikidata Resolver] Selected entity', {
    requestedTitle: item.officialTitle || item.title || '',
    selectedId: best.row.id,
    selectedLabel: best.row.label || entity.labels?.en?.value || '',
    selectedDescription:
      best.row.description ||
      entity.descriptions?.en?.value ||
      '',
    confidence: best.confidence,
    instanceOfIds: claimEntityIds(entity, 'P31'),
    productionCompanyIds: productionIds,
    resolvedProductionNames: productionNames,
    matchedQueries: best.matchedQueries
  });

  const patch = {
    ...kitsuPatch,
    ...inheritedPatch,
    wikidataId: item.wikidataId || best.row.id,
    metadataRepairSource: 'wikidata-smart-resolver',
    wikidataRepairConfidence: best.confidence,
    wikidataRepairMatchedQuery: best.matchedQueries[0] || '',
    wikidataRepairUpdatedAt: new Date().toISOString()
  };

  if (needs.studio && productionNames.length) {
    const names = [...new Set(productionNames)];
    patch.studio = names.join(' / ');
    patch.productionStudios = names;
    patch.metadataRepairSource = 'wikidata-smart-resolver';
  }

  if (needs.genres && genreNames.length) {
    patch.genres = [...new Set(genreNames)];
  }

  const year = claimReleaseYear(entity);
  if (needs.year && year) patch.year = year;

  // P1113 = number of episodes.
  const episodes = claimQuantity(entity, 'P1113');
  if (needs.episodes && episodes) {
    patch.episodeCount = episodes;
    patch.episodes = episodes;
  }

  return {
    patch,
    confidence: best.confidence,
    matchedTitle: best.row.label || entity.labels?.en?.value || item.title,
    matchedQuery: best.matchedQueries[0] || '',
    remainingNeeds: wikidataRepairNeeds({ ...kitsuCompletedItem, ...patch }),
    resolvedFields: [...new Set(kitsuFields)]
  };
}


async function tryKitsuStudioFallback(item = {}) {
  if (String(item.studio || '').trim()) return null;
  try {
    const enriched = await fetchKitsuMetadata(item);
    const studios = studioNames(enriched);
    if (!studios.length) return null;

    return {
      patch: {
        kitsuId: enriched.kitsuId || item.kitsuId || '',
        studio: studios.join(' / '),
        productionStudios: studios,
        metadataRepairSource: 'kitsu-studio-fallback',
        kitsuStudioFallbackUpdatedAt: new Date().toISOString()
      },
      matchedTitle: enriched.officialTitle || enriched.title || item.officialTitle || item.title,
      confidence: 95
    };
  } catch (error) {
    console.warn('[Kitsu Studio Fallback] unavailable:', item.title || item.officialTitle || 'Unknown title', error?.message || error);
    return null;
  }
}

export async function enrichMissingMetadata(item = {}, library = []) {
  if (!needsWikidataRepair(item)) {
    return {
      anime: item,
      improved: false,
      fields: [],
      unresolved: false,
      source: item.metadataRepairSource || item.metadataSource || 'existing'
    };
  }

  try {
    const result = await fetchWikidataRepair(item, library);
    const patch = result.patch || {};
    const fields = [];

    if (patch.studio || patch.productionStudios?.length) fields.push('studio');
    if (patch.genres?.length) fields.push('genres');
    if (patch.year) fields.push('year');
    if (patch.episodeCount || patch.episodes) fields.push('episodes');

    const remainingNeeds = result.remainingNeeds || wikidataRepairNeeds({
      ...item,
      ...patch
    });
    const remainingFields = Object.entries(remainingNeeds)
      .filter(([, missing]) => missing)
      .map(([field]) => field);
    const resolvedFields = fields.length
      ? fields
      : result.resolvedFields || [];

    if (!remainingFields.length && resolvedFields.length && !fields.length) {
      return {
        anime: {
          ...item,
          ...patch,
          cover: item.cover, poster: item.poster, image: item.image,
          posterImage: item.posterImage, coverImage: item.coverImage,
          joeScore: item.joeScore, score: item.score, favorite: item.favorite,
          rewatches: item.rewatches, notes: item.notes, status: item.status,
          metadataNeedsReview: false, metadataReviewReason: '',
          metadataRepairAttemptedAt: new Date().toISOString()
        },
        improved: true,
        fields: resolvedFields,
        unresolved: false,
        source: patch.metadataRepairSource || 'kitsu-primary-repair',
        matchedTitle: result.matchedTitle,
        matchedQuery: result.matchedQuery,
        confidence: result.confidence
      };
    }

    if (!fields.length) {
      const kitsuResult = await tryKitsuStudioFallback(item);
      const kitsuPatch = kitsuResult?.patch || {};
      if (kitsuPatch.studio) {
        return {
          anime: {
            ...item, ...kitsuPatch,
            cover: item.cover, poster: item.poster, image: item.image,
            posterImage: item.posterImage, coverImage: item.coverImage,
            joeScore: item.joeScore, score: item.score, favorite: item.favorite,
            rewatches: item.rewatches, notes: item.notes, status: item.status,
            metadataNeedsReview: false, metadataReviewReason: '',
            metadataRepairAttemptedAt: new Date().toISOString()
          },
          improved: true, fields: ['studio'], unresolved: false,
          source: 'kitsu-studio-fallback', matchedTitle: kitsuResult.matchedTitle,
          confidence: kitsuResult.confidence
        };
      }
      return {
        anime: {
          ...item,
          metadataNeedsReview: true,
          metadataReviewReason: 'A confident metadata match was found, but it contained none of the missing fields.',
          metadataRepairAttemptedAt: new Date().toISOString()
        },
        improved: false, fields: [], unresolved: true,
        reason: 'Matched record did not contain missing fields.',
        source: patch.metadataRepairSource || 'wikidata-smart-resolver'
      };
    }

    return {
      anime: {
        ...item,
        ...patch,

        // Preserve the primary Kitsu/local artwork and all user-owned values.
        cover: item.cover,
        poster: item.poster,
        image: item.image,
        posterImage: item.posterImage,
        coverImage: item.coverImage,
        joeScore: item.joeScore,
        score: item.score,
        favorite: item.favorite,
        rewatches: item.rewatches,
        notes: item.notes,
        status: item.status,

        metadataNeedsReview: Boolean(remainingFields.length),
        metadataReviewReason: remainingFields.length
          ? `Still missing ${remainingFields.join(', ')}.`
          : '',
        metadataRepairAttemptedAt: new Date().toISOString()
      },
      improved: true,
      fields,
      unresolved: Boolean(remainingFields.length),
      reason: remainingFields.length
        ? result.unresolvedReason || `Still missing ${remainingFields.join(', ')}.`
        : '',
      source: patch.metadataRepairSource || 'wikidata-smart-resolver',
      matchedTitle: result.matchedTitle,
      matchedQuery: result.matchedQuery,
      confidence: result.confidence
    };
  } catch (error) {
    const kitsuResult = await tryKitsuStudioFallback(item);
    const kitsuPatch = kitsuResult?.patch || {};
    if (kitsuPatch.studio) {
      return {
        anime: {
          ...item, ...kitsuPatch,
          cover: item.cover, poster: item.poster, image: item.image,
          posterImage: item.posterImage, coverImage: item.coverImage,
          joeScore: item.joeScore, score: item.score, favorite: item.favorite,
          rewatches: item.rewatches, notes: item.notes, status: item.status,
          metadataNeedsReview: false, metadataReviewReason: '',
          metadataRepairAttemptedAt: new Date().toISOString()
        },
        improved: true, fields: ['studio'], unresolved: false,
        source: 'kitsu-studio-fallback', matchedTitle: kitsuResult.matchedTitle,
        confidence: kitsuResult.confidence
      };
    }
    return {
      anime: {
        ...item, metadataNeedsReview: true,
        metadataReviewReason: error?.message || String(error),
        metadataRepairCandidates: error?.candidates || [],
        metadataRepairAttemptedAt: new Date().toISOString()
      },
      improved: false, fields: [], unresolved: true,
      reason: error?.message || String(error), candidates: error?.candidates || [],
      source: 'wikidata-smart-resolver'
    };
  }
}
