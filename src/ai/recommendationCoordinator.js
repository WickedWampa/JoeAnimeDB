import { routeJoeAIRecommendation } from './joeAIRecommendationRouter';
import {
  applyLearnedSignals,
  buildConfidenceReceipt
} from './intelligence/joeAIIntelligence';
import { genomeSignalsForItem } from './intelligence/genomeRecommendationSignals';

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

export function coordinateJoeAIRecommendation({
  text = '',
  anime = [],
  catalog = [],
  brain,
  joeAIState = {}
} = {}) {
  if (shouldUseGenomeRouter(text)) {
    const routed = routeJoeAIRecommendation(text, anime, catalog);
    if (typeof routed === 'string') return { type: 'text', text: routed };
    if (routed) return enrichRecommendationItems(routed, joeAIState);
  }

  const picks = brain?.recommendations?.(5, {
    prompt: text,
    joeAIState
  }) || [];

  if (!picks.length) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return {
      type: 'text',
      text: offline
        ? '🍜 JoeAI is still here, but you appear to be offline and I do not have enough local catalog metadata for a confident recommendation. Your library is safe—try again when connected or run Update Database later.'
        : brain?.answer?.('recommend something')
          || '🍜 I do not have enough completed catalog metadata for a confident recommendation yet. Run Update Database, then ask me again.'
    };
  }

  return {
    type: 'recommendations',
    title: '🍜 JoeAI Recommendations',
    subtitle: 'Every pick includes the Anime DNA, Genome evidence, saved feedback, and request signals that put it here.',
    sourceTitle: '',
    items: picks.map(ensureRecommendationExplanation)
  };
}
