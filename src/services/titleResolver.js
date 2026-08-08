import { parseTitleIdentity, titleAliases } from './titleIdentity';

const TYPE_ALIASES = new Map([
  ['tv', 'tv'],
  ['series', 'tv'],
  ['television', 'tv'],
  ['movie', 'movie'],
  ['film', 'movie'],
  ['ova', 'ova'],
  ['ona', 'ona'],
  ['special', 'special']
]);

function normalizeType(value = '') {
  const normalized = String(value).toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  if (!normalized) return '';

  for (const [alias, type] of TYPE_ALIASES.entries()) {
    if (normalized === alias || normalized.split(/\s+/).includes(alias)) return type;
  }

  return normalized;
}

function titleWords(value = '') {
  return parseTitleIdentity(value).normalized.split(/\s+/).filter(Boolean);
}

function extractTitleRequest(query = '', hints = {}) {
  let title = String(query || '').trim();
  const yearMatch = title.match(/(?:[\s([])((?:19|20)\d{2})[)\]]?$/);
  const typeMatch = title.match(/[([]\s*(tv|series|television|movie|film|ova|ona|special)\s*[)\]]/i);
  const year = Number(hints.year || yearMatch?.[1] || 0) || null;
  const type = normalizeType(hints.type || typeMatch?.[1] || '');

  if (yearMatch) title = title.replace(yearMatch[0], ' ');
  if (typeMatch) title = title.replace(typeMatch[0], ' ');

  title = title.replace(/[()[\]]/g, ' ').replace(/\s+/g, ' ').trim();

  return {
    raw: String(query || '').trim(),
    title: title || String(query || '').trim(),
    identity: parseTitleIdentity(title || query),
    year,
    type
  };
}

function candidateYear(candidate = {}) {
  return Number(candidate.year || candidate.startYear || candidate.releaseYear || 0) || null;
}

function candidateType(candidate = {}) {
  return normalizeType(candidate.type || candidate.subtype || candidate.format || candidate.showType || '');
}

function scoreCandidate(candidate = {}, request) {
  const aliases = titleAliases(candidate);
  const identities = aliases.map(parseTitleIdentity);
  const queryWords = titleWords(request.title);
  const exactAlias = identities.some((identity) => identity.normalized === request.identity.normalized);
  const exactBase = identities.some((identity) => identity.base && identity.base === request.identity.base);
  const containsAllWords = identities.some((identity) => {
    const words = titleWords(identity.normalized);
    return queryWords.length > 0 && queryWords.every((word) => words.includes(word));
  });

  let score = exactAlias ? 100 : exactBase ? 84 : containsAllWords ? 68 : 30;
  const reasons = [];

  if (exactAlias) reasons.push('exact title or alternate title');
  else if (exactBase) reasons.push('same title identity');
  else if (containsAllWords) reasons.push('title words overlap');

  const year = candidateYear(candidate);
  const type = candidateType(candidate);
  const yearConflict = Boolean(request.year && year && request.year !== year);
  const typeConflict = Boolean(request.type && type && request.type !== type);

  if (request.year && year) {
    if (yearConflict) {
      score -= 35;
      reasons.push(`year mismatch (${year})`);
    } else {
      score += 12;
      reasons.push(`year ${year}`);
    }
  }

  if (request.type && type) {
    if (typeConflict) {
      score -= 28;
      reasons.push(`format mismatch (${type})`);
    } else {
      score += 10;
      reasons.push(`format ${type}`);
    }
  }

  const providerConfidence = Number(candidate.importConfidence || candidate.matchScore || 0);
  if (providerConfidence >= 96 && exactAlias) score += 2;

  const confidence = Math.max(0, Math.min(100, Math.round(score)));
  const compatibleExact = exactAlias && !yearConflict && !typeConflict;

  return {
    ...candidate,
    resolutionConfidence: confidence,
    resolutionExact: compatibleExact,
    resolutionReasons: reasons,
    matchScore: confidence,
    matchReason: reasons.join(', ') || candidate.matchReason || candidate.importLabel || 'Possible match'
  };
}

export function resolveAnimeTitleCandidates({ query = '', candidates = [], hints = {} } = {}) {
  const request = extractTitleRequest(query, hints);
  const rankedCandidates = (candidates || [])
    .filter(Boolean)
    .map((candidate) => scoreCandidate(candidate, request))
    .sort((a, b) =>
      Number(b.resolutionConfidence || 0) - Number(a.resolutionConfidence || 0) ||
      Number(b.importConfidence || 0) - Number(a.importConfidence || 0) ||
      String(a.officialTitle || a.title || '').localeCompare(String(b.officialTitle || b.title || ''))
    );

  if (!rankedCandidates.length) {
    return {
      decision: 'none',
      autoAct: false,
      request,
      candidate: null,
      candidates: []
    };
  }

  const exactCandidates = rankedCandidates.filter((candidate) => candidate.resolutionExact);
  const best = rankedCandidates[0];
  const runnerUp = rankedCandidates[1];
  const confidenceGap = Number(best.resolutionConfidence || 0) - Number(runnerUp?.resolutionConfidence || 0);
  const oneUnambiguousExact = exactCandidates.length === 1 && exactCandidates[0] === best;
  const autoAct = Boolean(
    oneUnambiguousExact &&
    Number(best.resolutionConfidence || 0) >= 98 &&
    (!runnerUp || !runnerUp.resolutionExact) &&
    (!runnerUp || confidenceGap >= 10 || Number(runnerUp.resolutionConfidence || 0) < 78)
  );

  return {
    decision: autoAct ? 'exact' : 'review',
    autoAct,
    request,
    candidate: best,
    candidates: rankedCandidates,
    exactCandidates,
    confidenceGap,
    reason: autoAct
      ? 'One high-confidence exact identity match.'
      : exactCandidates.length > 1
        ? 'Multiple candidates share the requested title.'
        : 'The best match is not exact enough to change the library automatically.'
  };
}
