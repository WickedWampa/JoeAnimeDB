import { MEMORY_DIMENSIONS, DIMENSION_LABELS, clampScore } from './memoryTypes';
import { buildEvidenceMap } from './evidenceEngine';

function libraryStats(library = []) {
  const completed = library.filter((item) => String(item.status || '').toLowerCase() === 'completed').length;
  const watching = library.filter((item) => String(item.status || '').toLowerCase() === 'watching').length;
  const dropped = library.filter((item) => String(item.status || '').toLowerCase() === 'dropped').length;
  const favorites = library.filter((item) => item.favorite).length;
  const rewatches = library.reduce((sum, item) => sum + Number(item.rewatches || 0), 0);
  const rated = library.filter((item) => Number(item.joeScore || item.score || item.finalScore || item.rating || 0) > 0).length;
  const episodeTotal = library.reduce((sum, item) => sum + Number(item.episodes || item.episodeCount || 0), 0);

  return { total: library.length, completed, watching, dropped, favorites, rewatches, rated, episodeTotal };
}

function rawScoreFromEvidence(evidence = []) {
  if (!evidence.length) return 0;
  const totalWeight = evidence.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  const topWeight = evidence.slice(0, 4).reduce((sum, item) => sum + Number(item.weight || 0), 0);
  const breadthBonus = Math.min(14, evidence.length * 1.6);
  return totalWeight + topWeight * 0.35 + breadthBonus;
}

function confidenceFromEvidence(evidence = [], stats = {}) {
  if (!evidence.length) return 0;

  const countConfidence = Math.min(42, evidence.length * 5);
  const completedConfidence = Math.min(22, Number(stats.completed || 0) / 5);
  const rewatchConfidence = Math.min(16, evidence.reduce((sum, item) => sum + Number(item.rewatches || 0), 0) * 2);
  const ratingConfidence = Math.min(12, Number(stats.rated || 0) / 4);
  const favoriteConfidence = Math.min(8, evidence.filter((item) => item.favorite).length * 3);

  return clampScore(countConfidence + completedConfidence + rewatchConfidence + ratingConfidence + favoriteConfidence);
}

function normalizeScores(rawScores = {}) {
  const values = Object.values(rawScores).filter((value) => Number(value) > 0);
  const maxRaw = Math.max(1, ...values);
  const minVisible = values.length > 6 ? 12 : 18;

  return Object.fromEntries(
    Object.entries(rawScores).map(([key, raw]) => {
      if (!raw) return [key, 0];
      const ratio = raw / maxRaw;
      const curved = Math.pow(ratio, 0.82);
      return [key, clampScore(minVisible + curved * (98 - minVisible))];
    })
  );
}

function buildViewerClass(strongest = []) {
  const topKeys = strongest.slice(0, 3).map((item) => item.key);
  if (topKeys.includes('worldbuilding') && topKeys.includes('kingdomBuilding')) return '🌍 World Builder';
  if (topKeys.includes('strategicBattles') || topKeys.includes('politics')) return '♟️ Master Strategist';
  if (topKeys.includes('supernaturalCombat') || topKeys.includes('powerFantasy')) return '⚔️ Power Seeker';
  if (topKeys.includes('comedy')) return '😂 Chaos Gremlin';
  if (topKeys.includes('romance')) return '💖 Romance Dreamer';
  if (topKeys.includes('horror') || topKeys.includes('psychological')) return '👻 Dark Explorer';
  return '🍜 Anime Explorer';
}

export function buildTasteProfile(library = []) {
  const stats = libraryStats(library);
  const evidenceMap = buildEvidenceMap(library, MEMORY_DIMENSIONS);
  const rawScores = {};

  for (const dimension of MEMORY_DIMENSIONS) {
    rawScores[dimension] = rawScoreFromEvidence(evidenceMap[dimension] || []);
  }

  const normalizedScores = normalizeScores(rawScores);
  const dimensions = {};

  for (const dimension of MEMORY_DIMENSIONS) {
    const evidence = evidenceMap[dimension] || [];
    const score = normalizedScores[dimension] || 0;
    const confidence = confidenceFromEvidence(evidence, stats);

    dimensions[dimension] = {
      key: dimension,
      label: DIMENSION_LABELS[dimension] || dimension,
      score,
      confidence,
      rawScore: Math.round((rawScores[dimension] || 0) * 10) / 10,
      evidence: evidence.map((entry) => entry.title),
      evidenceDetails: evidence
    };
  }

  const ranked = Object.values(dimensions).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.confidence - a.confidence;
  });

  const strongest = ranked.filter((item) => item.score > 0).slice(0, 8);
  const confidence = clampScore(
    Math.min(96, 35 + Math.min(34, stats.completed / 3) + Math.min(14, stats.rewatches * 1.2) + Math.min(10, stats.rated / 3) + Math.min(3, strongest.length))
  );

  return {
    stats,
    dimensions,
    strongest,
    weakest: [...ranked].reverse().filter((item) => item.confidence > 0).slice(0, 6),
    confidence,
    viewerClass: buildViewerClass(strongest)
  };
}
