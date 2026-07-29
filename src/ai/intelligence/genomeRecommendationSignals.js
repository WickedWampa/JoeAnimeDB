import { findGenomeCardByTitle } from '../genome/genomeRegistry';

const lower = (value = '') => String(value || '').toLowerCase();

const DIMENSIONS = [
  { key: 'worldbuilding', label: 'deep worldbuilding', words: ['worldbuilding', 'world building', 'expansive world', 'lore', 'civilization'] },
  { key: 'foundFamily', label: 'found-family bonds', words: ['found family', 'crew', 'companionship', 'loyalty', 'guild'] },
  { key: 'powerProgression', label: 'power progression', words: ['power progression', 'training', 'leveling', 'weak to strong', 'growth'] },
  { key: 'strategy', label: 'strategic conflict', words: ['strategy', 'strategic', 'tactical', 'politic', 'mind game'] },
  { key: 'kingdomBuilding', label: 'kingdom building', words: ['kingdom', 'nation building', 'empire', 'territory', 'leadership'] },
  { key: 'darkness', label: 'dark emotional pressure', words: ['dark', 'violent', 'horror', 'trauma', 'survival', 'tragedy'] },
  { key: 'emotionalPayoff', label: 'emotional payoff', words: ['emotional', 'heartbreak', 'catharsis', 'drama', 'healing'] },
  { key: 'comedy', label: 'comedic energy', words: ['comedy', 'funny', 'humor', 'absurd'] },
  { key: 'mystery', label: 'mystery and discovery', words: ['mystery', 'secret', 'discovery', 'suspense', 'conspiracy'] },
  { key: 'longJourney', label: 'long-form journey', words: ['long journey', 'long haul', 'adventure', 'quest', 'saga'] }
];

function cardText(card = {}) {
  return lower([
    card.signature,
    card.coreFantasy,
    card.rewardLoop,
    card.emotionalJourney,
    card.joeNote,
    ...(card.fantasyPillars || []),
    ...(card.viewerMotivations || []),
    ...(card.whyFansLove || []),
    ...(card.whoShouldWatch || []),
    ...(card.tags || []),
    ...(card.traits || [])
  ].filter(Boolean).join(' '));
}

export function genomeTierOf(card = {}) {
  return card.qualityLabel
    || card.quality
    || card.tier
    || (String(card.source || '').toLowerCase().includes('gold') ? 'Gold' : '')
    || 'Genome';
}

export function genomeDimensions(card = {}) {
  const text = cardText(card);
  return DIMENSIONS
    .filter((dimension) => dimension.words.some((word) => text.includes(word)))
    .map((dimension) => dimension);
}

export function genomeSignalsForItem(item = {}) {
  const card = findGenomeCardByTitle(item.officialTitle || item.title || '');
  if (!card) {
    return {
      card: null,
      tier: '',
      dimensions: [],
      traits: []
    };
  }

  const dimensions = genomeDimensions(card);
  return {
    card,
    tier: genomeTierOf(card),
    dimensions,
    traits: dimensions.map((dimension) => dimension.label)
  };
}

export function buildLibraryGenomeProfile(library = []) {
  const weights = new Map();
  let cardCount = 0;

  (library || []).forEach((item) => {
    const score = Number(item.joeScore ?? item.rating ?? item.finalScore ?? 0);
    const positiveWeight =
      (score >= 9.5 ? 8 : score >= 9 ? 6 : score >= 8 ? 4 : score >= 7 ? 2 : score > 0 ? 0.5 : 1)
      + (item.favorite ? 5 : 0)
      + Math.min(6, Number(item.rewatches || 0) * 2);
    const negativeWeight = String(item.status || '').toLowerCase().includes('dropped') || (score > 0 && score <= 5)
      ? -5
      : 0;
    const signals = genomeSignalsForItem(item);
    if (!signals.card) return;
    cardCount += 1;

    signals.dimensions.forEach((dimension) => {
      weights.set(
        dimension.key,
        (weights.get(dimension.key) || 0) + positiveWeight + negativeWeight
      );
    });
  });

  return { weights, cardCount };
}

export function scoreGenomeFit(item = {}, profile = {}) {
  const signals = genomeSignalsForItem(item);
  if (!signals.card) {
    return {
      score: 0,
      reasons: [],
      evidenceCount: 0,
      tier: '',
      traits: []
    };
  }

  const matches = signals.dimensions
    .map((dimension) => ({
      ...dimension,
      weight: Number(profile.weights?.get(dimension.key) || 0)
    }))
    .filter((dimension) => dimension.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  const score = matches.reduce((sum, dimension) => sum + Math.min(10, dimension.weight / 2.5), 0);

  return {
    score: Math.min(28, score),
    reasons: matches.slice(0, 2).map((dimension) => `${dimension.label} matches your strongest Genome evidence`),
    evidenceCount: matches.length,
    tier: signals.tier,
    traits: signals.traits
  };
}

