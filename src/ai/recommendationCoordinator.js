import { routeJoeAIRecommendation } from './joeAIRecommendationRouter';
import {
  applyLearnedSignals,
  buildConfidenceReceipt,
  normalizeJoeAIKey,
  recommendationKey
} from './intelligence/joeAIIntelligence';
import { genomeSignalsForItem } from './intelligence/genomeRecommendationSignals';
import { animeIdentityKeys, sameAnimeIdentity } from '../services/titleIdentity';
import { fetchKitsuCatalogPage, fetchKitsuMetadata } from '../services/kitsuProvider';
import { isContentAllowed } from '../services/contentSafety';

const recommendationMetadataCache = new Map();
const RECOMMENDATION_HYDRATION_LIMIT = 8;
const RECOMMENDATION_HYDRATION_CONCURRENCY = 2;
const RECOMMENDATION_VISIBLE_TARGET = 8;
const RECOMMENDATION_RESERVE_TARGET = 16;

function shouldUseGenomeRouter(value = '') {
  const lower = String(value || '').toLowerCase();
  return (
    /\b(something|show|shows|anime)\s+like\b/.test(lower)
    || /\bsimilar\s+to\b/.test(lower)
    || /\brecommend\s+.+\s+like\b/.test(lower)
    || /\b(darker|dark|funny|comedy|emotional|cozy|comfort|strategy|strategic|sports|hidden gem|underrated|movie|short binge)\b/.test(lower)
    || /^recommend\s+(?!something\b).+/i.test(String(value || '').trim())
  );
}

export function enrichRecommendationItems(result, joeAIState) {
  if (!result || !Array.isArray(result.items)) return result;

  const items = result.items
    .map((item, originalIndex) => {
      const learning = applyLearnedSignals(item, joeAIState);
      if (learning.excluded) return null;
      const genome = genomeSignalsForItem(item);
      const tasteMatch = Math.max(1, Math.min(99, Number(item.match || 70) + learning.adjustment));
      const confidenceReceipt = item.confidenceReceipt || buildConfidenceReceipt(item, {
        tasteMatch,
        evidenceCount: Math.max(1, genome.dimensions.length),
        genomeTier: genome.tier,
        state: joeAIState
      });

      return {
        ...item,
        match: Math.round(tasteMatch),
        reasons: [...new Set([...(item.reasons || []), ...learning.reasons])].slice(0, 5),
        warnings: [...new Set([...(item.warnings || []), ...learning.warnings])].slice(0, 3),
        genomeTraits: [...new Set([...(item.genomeTraits || []), ...genome.traits])],
        confidenceReceipt,
        _joeAIOriginalIndex: originalIndex
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (right.match !== left.match) return right.match - left.match;

      const rightPrediction = Number(right.confidenceReceipt?.predictionConfidence || 0);
      const leftPrediction = Number(left.confidenceReceipt?.predictionConfidence || 0);
      if (rightPrediction !== leftPrediction) return rightPrediction - leftPrediction;

      return left._joeAIOriginalIndex - right._joeAIOriginalIndex;
    })
    .map(({ _joeAIOriginalIndex, ...item }) => item);

  return { ...result, items };
}

function ensureRecommendationExplanation(item = {}) {
  const reasons = [...new Set([
    ...(item.reasons || []),
    ...(item.genomeTraits || []).slice(0, 2)
  ].filter(Boolean))].slice(0, 5);

  const safeReasons = reasons.length
    ? reasons
    : [
        item.metadataReady === false
          ? 'This is an exploratory pick while its metadata is still being completed.'
          : 'Its overall genres, themes, length, and catalog signals overlap with your Anime DNA.'
      ];

  const name = item.officialTitle || item.title || 'This title';

  return {
    ...item,
    reasons: safeReasons,
    joeAISummary: item.joeAISummary ||
      `${name} made the list because ${safeReasons.slice(0, 2).join(' and ').replace(/^./, (character) => character.toLowerCase())}`,
    deepDive: item.deepDive || [
      `Why JoeAI picked ${name}:`,
      '',
      ...safeReasons.map((reason) => `• ${reason}`),
      '',
      item.warnings?.length ? `Watch-outs: ${item.warnings.join('; ')}` : ''
    ].filter(Boolean).join('\n')
  };
}

function titleText(item = {}) {
  return [
    item.officialTitle,
    item.title,
    item.canonicalTitle,
    item.synopsis,
    item.description,
    item.type,
    ...(item.genres || []),
    ...(item.themes || []),
    ...(item.tags || [])
  ].filter(Boolean).join(' ').toLowerCase();
}

function franchiseStem(value = '') {
  return normalizeJoeAIKey(String(value || '')
    .replace(/\b(?:season|part|cour)\s*\d+\b/gi, '')
    .replace(/\b(?:movie|ova|ona|special)\b/gi, '')
    .replace(/\b(?:ii|iii|iv|v|2nd|3rd)\b/gi, ''));
}

function franchiseFollowUp(item = {}, library = []) {
  const stem = franchiseStem(item.officialTitle || item.title);
  if (!stem || stem.length < 5) return '';
  const match = library.find((entry) => {
    const ownedStem = franchiseStem(entry.officialTitle || entry.title);
    return ownedStem && ownedStem === stem && !sameAnimeIdentity(item, entry);
  });
  return match?.officialTitle || match?.title || '';
}

function libraryOwns(item = {}, library = []) {
  const candidateKeys = animeIdentityKeys(item);
  return library.some((entry) => {
    if (sameAnimeIdentity(item, entry)) return true;
    const ownedKeys = animeIdentityKeys(entry);
    return [...candidateKeys].some((key) => ownedKeys.has(key));
  });
}

export function finalizeJoeAIRecommendations(result, {
  library = [],
  conversationContext = {},
  constraints = {}
} = {}) {
  if (!result || !Array.isArray(result.items)) return result;

  const excludedTerms = [...new Set([
    ...(conversationContext.lastConstraints?.exclude || []),
    ...(constraints.exclude || [])
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))];
  const recent = new Set(conversationContext.recentRecommendationKeys || []);
  const seen = new Set();
  const eligible = result.items
    .filter((item) => !libraryOwns(item, library))
    .filter((item) => !excludedTerms.some((term) => titleText(item).includes(term)))
    .filter((item) => {
      const keys = animeIdentityKeys(item);
      if (!keys.size) keys.add(recommendationKey(item));
      if ([...keys].some((key) => seen.has(key))) return false;
      keys.forEach((key) => seen.add(key));
      return true;
    })
    .map((item) => {
      const relatedOwnedTitle = franchiseFollowUp(item, library);
      return {
        ...item,
        owned: false,
        bucket: 'discovery',
        franchiseFollowUp: relatedOwnedTitle || item.franchiseFollowUp,
        matchLabel: relatedOwnedTitle ? 'Franchise follow-up' : item.matchLabel
      };
    });

  const fresh = eligible.filter((item) => !recent.has(recommendationKey(item)));
  const repeated = eligible.filter((item) => recent.has(recommendationKey(item)));
  return { ...result, items: [...fresh, ...repeated] };
}

function kitsuFallbackScore(item = {}, text = '') {
  const ignored = new Set(['recommend', 'something', 'anime', 'show', 'watch', 'should', 'like', 'with', 'that', 'this', 'from', 'what', 'give']);
  const aliases = {
    dark: ['dark', 'horror', 'thriller', 'psychological', 'violent'],
    sad: ['sad', 'drama', 'tragic', 'emotional'],
    funny: ['funny', 'comedy', 'humor'],
    cozy: ['cozy', 'comfort', 'slice of life', 'iyashikei'],
    strategy: ['strategy', 'tactical', 'political', 'game'],
    romance: ['romance', 'romantic', 'love']
  };
  const rawTerms = String(text || '').toLowerCase().match(/[a-z0-9]{3,}/g)?.filter((term) => !ignored.has(term)) || [];
  const terms = [...new Set(rawTerms.flatMap((term) => aliases[term] || [term]))];
  const blob = titleText(item);
  const termScore = terms.reduce((score, term) => score + (blob.includes(term) ? 12 : 0), 0);
  const community = Number(item.communityScore || item.averageRating || item.score || 0);
  return termScore + (Number.isFinite(community) ? community / 10 : 0);
}

async function expandWithKitsu(
  text,
  result,
  library,
  conversationContext,
  constraints,
  minimumItems = RECOMMENDATION_VISIBLE_TARGET
) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return result;
  if ((result?.items || []).length >= minimumItems) return result;

  try {
    const page = 1 + ((conversationContext.recentRecommendationKeys?.length || 0) % 4);
    const response = await fetchKitsuCatalogPage({ page, limit: 20 });
    const meaningfulTerms = String(text || '').toLowerCase().match(/[a-z0-9]{3,}/g)
      ?.filter((term) => !['recommend', 'something', 'anime', 'show', 'watch', 'should', 'what', 'next', 'give', 'pick'].includes(term)) || [];
    const rankedRows = (response?.rows || [])
      .map((item) => ({ item, score: kitsuFallbackScore(item, text) }))
      .sort((left, right) => right.score - left.score);
    const stronglyMatched = rankedRows.filter(({ score }) => !meaningfulTerms.length || score >= 12);
    const additions = (stronglyMatched.length ? stronglyMatched : rankedRows.slice(0, minimumItems))
      .map(({ item }) => item)
      .map((item) => ({
        ...item,
        match: Math.max(55, Math.min(88, Math.round(62 + kitsuFallbackScore(item, text)))),
        reasons: ['A fresh Kitsu catalog candidate that overlaps with this request'],
        joeAISummary: `${item.officialTitle || item.title} expands this search beyond the catalog already cached on this device.`,
        metadataSource: 'Kitsu'
      }))
      .sort((left, right) => kitsuFallbackScore(right, text) - kitsuFallbackScore(left, text));
    return finalizeJoeAIRecommendations({
      ...(result || { type: 'recommendations', title: 'JoeAI Recommendations' }),
      items: [...(result?.items || []), ...additions]
    }, { library, conversationContext, constraints });
  } catch {
    return result;
  }
}

export function mergeRecommendationCandidatePools(primary = [], reserve = []) {
  return [...primary, ...reserve];
}

function recommendationMetadataKey(item = {}) {
  const providerId = item.kitsuId || item.kitsu_id;
  if (providerId) return `kitsu:${providerId}`;
  return `title:${normalizeJoeAIKey(item.officialTitle || item.title)}`;
}

export function recommendationNeedsHydration(item = {}) {
  return !(
    (item.cover || item.poster || item.imageUrl) &&
    (item.synopsis || item.description) &&
    Array.isArray(item.genres) &&
    item.genres.length &&
    item.year &&
    (item.episodes || item.episodeCount) &&
    item.contentRatingCheckedAt
  );
}

export function mergeHydratedRecommendation(item = {}, metadata = {}) {
  const recommendationFields = {
    match: item.match,
    matchLabel: item.matchLabel,
    reasons: item.reasons,
    warnings: item.warnings,
    genomeTraits: item.genomeTraits,
    confidenceReceipt: item.confidenceReceipt,
    joeAISummary: item.joeAISummary,
    deepDive: item.deepDive,
    owned: item.owned,
    bucket: item.bucket,
    franchiseFollowUp: item.franchiseFollowUp
  };

  return {
    ...item,
    ...metadata,
    ...recommendationFields,
    id: item.id || metadata.id,
    title: item.title || metadata.officialTitle || metadata.title,
    officialTitle: metadata.officialTitle || metadata.title || item.officialTitle || item.title,
    kitsuId: metadata.kitsuId || metadata.kitsu_id || item.kitsuId || item.kitsu_id,
    malId: metadata.malId || metadata.mal_id || item.malId || item.mal_id || null,
    cover: metadata.cover || metadata.poster || metadata.imageUrl || item.cover || item.poster || item.imageUrl,
    imageUrl: metadata.imageUrl || metadata.cover || metadata.poster || item.imageUrl || item.cover || item.poster,
    synopsis: metadata.synopsis || metadata.description || item.synopsis || item.description,
    description: metadata.description || metadata.synopsis || item.description || item.synopsis,
    genres: metadata.genres?.length ? metadata.genres : (item.genres || []),
    studio: metadata.studio || item.studio,
    studios: metadata.studios?.length ? metadata.studios : (item.studios || []),
    episodes: metadata.episodes || metadata.episodeCount || item.episodes || item.episodeCount,
    episodeCount: metadata.episodeCount || metadata.episodes || item.episodeCount || item.episodes,
    metadataReady: metadata.metadataReady !== false
  };
}

export function toCatalogMetadataRecord(item = {}) {
  const {
    match,
    matchLabel,
    reasons,
    warnings,
    genomeTraits,
    confidenceReceipt,
    joeAISummary,
    deepDive,
    owned,
    bucket,
    franchiseFollowUp,
    ...catalogItem
  } = item;
  return catalogItem;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

async function hydrateKitsuCards(result, { persistCatalogItem } = {}) {
  if (!result || !Array.isArray(result.items)) return result;

  const candidates = result.items.slice(0, RECOMMENDATION_HYDRATION_LIMIT);
  const hydrated = await mapWithConcurrency(
    candidates,
    RECOMMENDATION_HYDRATION_CONCURRENCY,
    async (item) => {
      if (!recommendationNeedsHydration(item)) return item;

      const cacheKey = recommendationMetadataKey(item);
      const cached = recommendationMetadataCache.get(cacheKey);
      if (cached) return mergeHydratedRecommendation(item, cached);

      try {
        const metadata = await fetchKitsuMetadata(item);
        if (!metadata) return item;
        recommendationMetadataCache.set(cacheKey, metadata);
        return mergeHydratedRecommendation(item, metadata);
      } catch (error) {
        console.warn('JoeAI recommendation metadata lookup failed:', item.title, error);
        return item;
      }
    }
  );

  if (persistCatalogItem) {
    for (let index = 0; index < hydrated.length; index += 1) {
      const item = hydrated[index];
      if (item === candidates[index]) continue;
      try {
        await persistCatalogItem(toCatalogMetadataRecord(item));
      } catch (error) {
        console.warn('JoeAI recommendation metadata could not be cached:', item.title, error);
      }
    }
  }

  return {
    ...result,
    items: [...hydrated, ...result.items.slice(RECOMMENDATION_HYDRATION_LIMIT)]
  };
}

async function hydrateVisibleRecommendations(result, {
  contentSafetyMode = 'unrestricted',
  persistCatalogItem
} = {}) {
  if (!result || !Array.isArray(result.items)) return result;

  const visible = [];
  const candidates = result.items.slice(0, RECOMMENDATION_RESERVE_TARGET);

  for (let offset = 0; offset < candidates.length && visible.length < RECOMMENDATION_VISIBLE_TARGET; offset += RECOMMENDATION_HYDRATION_LIMIT) {
    const batchResult = await hydrateKitsuCards({
      ...result,
      items: candidates.slice(offset, offset + RECOMMENDATION_HYDRATION_LIMIT)
    }, { persistCatalogItem });

    visible.push(
      ...(batchResult.items || []).filter((item) => isContentAllowed(item, contentSafetyMode))
    );
  }

  return {
    ...result,
    items: visible.slice(0, RECOMMENDATION_VISIBLE_TARGET)
  };
}

export async function coordinateJoeAIRecommendation({
  text = '',
  anime = [],
  catalog = [],
  brain,
  joeAIState = {},
  conversationContext = {},
  constraints = {},
  contentSafetyMode = 'unrestricted',
  persistCatalogItem
} = {}) {
  let result = null;
  if (shouldUseGenomeRouter(text)) {
    const routed = routeJoeAIRecommendation(text, anime, catalog);
    if (typeof routed === 'string') return { type: 'text', text: routed };
    if (routed) result = enrichRecommendationItems(routed, joeAIState);
  }

  if (!result) {
    const picks = brain?.recommendations?.(12, {
      prompt: text,
      joeAIState
    }) || [];

    if (picks.length) {
      result = {
        type: 'recommendations',
        title: 'JoeAI Recommendations',
        subtitle: 'Every pick includes the Anime DNA, Genome evidence, saved feedback, and request signals that put it here.',
        sourceTitle: '',
        items: picks.map(ensureRecommendationExplanation)
      };
    }
  }

  // A highly specific Genome route can contain only a few candidates after
  // owned titles, exclusions, and recent picks are removed. Keep its strongest
  // cards first, then add the broader Anime Brain ranking as a reserve pool.
  // This gives metadata and safety filtering enough candidates to still render
  // a full recommendation set.
  const reservePicks = brain?.recommendations?.(24, {
    prompt: text,
    joeAIState
  }) || [];
  if (reservePicks.length) {
    const reserve = enrichRecommendationItems({
      type: result?.type || 'recommendations',
      items: reservePicks.map(ensureRecommendationExplanation)
    }, joeAIState);
    result = {
      ...(result || {
        type: 'recommendations',
        title: 'JoeAI Recommendations',
        subtitle: 'Every pick includes the Anime DNA, Genome evidence, saved feedback, and request signals that put it here.',
        sourceTitle: ''
      }),
      items: mergeRecommendationCandidatePools(result?.items || [], reserve.items || [])
    };
  }

  result = finalizeJoeAIRecommendations(result, { library: anime, conversationContext, constraints });
  result = await expandWithKitsu(
    text,
    result,
    anime,
    conversationContext,
    constraints,
    RECOMMENDATION_RESERVE_TARGET
  );
  result = await hydrateVisibleRecommendations(result, {
    contentSafetyMode,
    persistCatalogItem
  });

  if (result?.items?.length) return { ...result, items: result.items.slice(0, 8) };

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return {
    type: 'text',
    text: offline
      ? 'JoeAI is still here, but you appear to be offline and I do not have enough local catalog metadata for a confident recommendation. Your library is safe. Try again when connected or run Update Database later.'
      : brain?.answer?.('recommend something')
        || 'I do not have enough completed catalog metadata for a confident recommendation yet. Run Update Database, then ask me again.'
  };
}
