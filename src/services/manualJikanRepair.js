const JIKAN_SEARCH_URL = 'https://api.jikan.moe/v4/anime';
const JIKAN_TIMEOUT_MS = 9000;

function clean(value = '') {
  return String(value || '').trim();
}

function titleKey(value = '') {
  return clean(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function titleVariants(item = {}) {
  return [
    item.title,
    item.officialTitle,
    item.englishTitle,
    item.canonicalTitle,
    ...(Array.isArray(item.titleSynonyms) ? item.titleSynonyms : [])
  ]
    .map(titleKey)
    .filter(Boolean);
}

function jikanTitleVariants(item = {}) {
  return [
    item.title,
    item.title_english,
    item.title_japanese,
    ...(Array.isArray(item.title_synonyms) ? item.title_synonyms : [])
  ]
    .map(titleKey)
    .filter(Boolean);
}

function intersectionCount(left = [], right = []) {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value)).length;
}

function tokenSimilarity(left = '', right = '') {
  const a = new Set(titleKey(left).split(' ').filter(Boolean));
  const b = new Set(titleKey(right).split(' ').filter(Boolean));

  if (!a.size || !b.size) return 0;

  const overlap = [...a].filter((token) => b.has(token)).length;
  return overlap / Math.max(a.size, b.size);
}

function scoreJikanMatch(source = {}, candidate = {}) {
  const sourceTitles = titleVariants(source);
  const candidateTitles = jikanTitleVariants(candidate);

  if (intersectionCount(sourceTitles, candidateTitles) > 0) {
    return 100;
  }

  const sourceTitle = source.officialTitle || source.title || '';
  const candidateTitle =
    candidate.title_english ||
    candidate.title ||
    candidate.title_japanese ||
    '';

  let score = Math.round(tokenSimilarity(sourceTitle, candidateTitle) * 82);

  const sourceYear = Number(source.year || 0);
  const candidateYear = Number(candidate.year || candidate.aired?.from?.slice?.(0, 4) || 0);

  if (sourceYear && candidateYear && sourceYear === candidateYear) score += 10;

  const sourceEpisodes = Number(source.episodeCount || source.episodes || 0);
  const candidateEpisodes = Number(candidate.episodes || 0);

  if (
    sourceEpisodes &&
    candidateEpisodes &&
    Math.abs(sourceEpisodes - candidateEpisodes) <= 1
  ) {
    score += 8;
  }

  return Math.min(99, score);
}

async function fetchJsonWithTimeout(url, timeoutMs = JIKAN_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      const error = new Error(`Jikan ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export function jikanRepairNeeds(item = {}) {
  return {
    genres: !Array.isArray(item.genres) || item.genres.length === 0,
    studio: !String(item.studio || '').trim(),
    synopsis: !String(item.synopsis || item.description || '').trim(),
    episodes: !Number(item.episodeCount || item.episodes || 0),
    year: !Number(item.year || 0)
  };
}

export function needsManualJikanRepair(item = {}) {
  return Object.values(jikanRepairNeeds(item)).some(Boolean);
}

export async function fetchManualJikanRepair(item = {}) {
  const query = encodeURIComponent(item.officialTitle || item.title || '');
  if (!query) throw new Error('Missing title');

  const payload = await fetchJsonWithTimeout(
    `${JIKAN_SEARCH_URL}?q=${query}&limit=8&sfw=true`
  );

  const ranked = (payload.data || [])
    .map((candidate) => ({
      candidate,
      confidence: scoreJikanMatch(item, candidate)
    }))
    .sort((a, b) => b.confidence - a.confidence);

  const best = ranked[0];

  if (!best || best.confidence < 88) {
    const error = new Error(
      best
        ? `No confident Jikan match (${best.confidence}%)`
        : 'No Jikan match found'
    );
    error.candidates = ranked.slice(0, 5);
    throw error;
  }

  const candidate = best.candidate;
  const needs = jikanRepairNeeds(item);
  const genres = [
    ...(candidate.genres || []),
    ...(candidate.themes || []),
    ...(candidate.demographics || [])
  ]
    .map((entry) => entry?.name)
    .filter(Boolean);

  const studios = (candidate.studios || [])
    .map((entry) => entry?.name)
    .filter(Boolean);

  const patch = {
    metadataRepairSource: 'jikan-manual',
    jikanRepairConfidence: best.confidence,
    jikanRepairUpdatedAt: new Date().toISOString(),
    malId: item.malId || candidate.mal_id || undefined
  };

  if (needs.genres && genres.length) patch.genres = [...new Set(genres)];
  if (needs.studio && studios.length) patch.studio = studios.join(' / ');
  if (needs.synopsis && candidate.synopsis) {
    patch.synopsis = candidate.synopsis;
    patch.description = candidate.synopsis;
  }
  if (needs.episodes && candidate.episodes) {
    patch.episodeCount = candidate.episodes;
    patch.episodes = candidate.episodes;
  }
  if (needs.year && candidate.year) patch.year = candidate.year;

  // Deliberately do not return poster/cover fields. Kitsu artwork stays untouched.
  return {
    patch,
    confidence: best.confidence,
    matchedTitle:
      candidate.title_english ||
      candidate.title ||
      candidate.title_japanese ||
      item.title
  };
}


export async function fetchJikanStudioFallback(item = {}) {
  if (String(item.studio || '').trim()) return { patch: {}, confidence: 100, skipped: true };

  const queryTitle = item.officialTitle || item.englishTitle || item.title || item.canonicalTitle || '';
  const query = encodeURIComponent(queryTitle);
  if (!query) throw new Error('Missing title for Jikan studio fallback');

  const payload = await fetchJsonWithTimeout(
    `${JIKAN_SEARCH_URL}?q=${query}&limit=8&sfw=true`,
    7500
  );

  const ranked = (payload.data || [])
    .map((candidate) => ({ candidate, confidence: scoreJikanMatch(item, candidate) }))
    .sort((a, b) => b.confidence - a.confidence);
  const best = ranked[0];

  if (!best || best.confidence < 88) {
    throw new Error(best ? `No confident Jikan studio match (${best.confidence}%)` : 'No Jikan studio match found');
  }

  const studios = [...new Set((best.candidate.studios || []).map((entry) => clean(entry?.name)).filter(Boolean))];
  if (!studios.length) throw new Error('Jikan matched the title but returned no studio data');

  return {
    patch: {
      studio: studios.join(' / '),
      productionStudios: studios,
      malId: item.malId || best.candidate.mal_id || undefined,
      metadataRepairSource: 'jikan-studio-fallback',
      jikanStudioFallbackConfidence: best.confidence,
      jikanStudioFallbackUpdatedAt: new Date().toISOString()
    },
    confidence: best.confidence,
    matchedTitle: best.candidate.title_english || best.candidate.title || best.candidate.title_japanese || queryTitle
  };
}
