import { MEMORY_DIMENSIONS, DIMENSION_LABELS, clampScore } from './memoryTypes';
import { buildEvidenceMap } from './evidenceEngine';

function libraryStats(library = []) {
  const completed = library.filter((item) => String(item.status || '').toLowerCase() === 'completed').length;
  const watching = library.filter((item) => String(item.status || '').toLowerCase() === 'watching').length;
  const dropped = library.filter((item) => String(item.status || '').toLowerCase() === 'dropped').length;
  const favorites = library.filter((item) => item.favorite).length;
  const rewatches = library.reduce((sum, item) => sum + Number(item.rewatches || 0), 0);

  return { total: library.length, completed, watching, dropped, favorites, rewatches };
}

function scoreFromEvidence(evidence = [], stats = {}) {
  if (!evidence.length) return { score: 0, confidence: 0 };

  const totalWeight = evidence.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  const evidenceCount = evidence.length;
  const base = Math.min(100, totalWeight * 7 + evidenceCount * 3);
  const confidenceBase = Math.min(100, evidenceCount * 14 + Math.min(25, Number(stats.completed || 0) / 4));

  return {
    score: clampScore(base),
    confidence: clampScore(confidenceBase)
  };
}

export function buildTasteProfile(library = []) {
  const stats = libraryStats(library);
  const evidenceMap = buildEvidenceMap(library, MEMORY_DIMENSIONS);
  const dimensions = {};

  for (const dimension of MEMORY_DIMENSIONS) {
    const evidence = evidenceMap[dimension] || [];
    const scored = scoreFromEvidence(evidence, stats);

    dimensions[dimension] = {
      key: dimension,
      label: DIMENSION_LABELS[dimension] || dimension,
      score: scored.score,
      confidence: scored.confidence,
      evidence: evidence.map((entry) => entry.title),
      evidenceDetails: evidence
    };
  }

  const ranked = Object.values(dimensions).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.confidence - a.confidence;
  });

  return {
    stats,
    dimensions,
    strongest: ranked.filter((item) => item.score > 0).slice(0, 8),
    weakest: [...ranked].reverse().filter((item) => item.confidence > 0).slice(0, 6),
    confidence: clampScore(ranked.slice(0, 8).reduce((sum, item) => sum + item.confidence, 0) / Math.max(1, ranked.slice(0, 8).length))
  };
}
