// Runtime helper for app-side Genome generation.
// Conservative bridge:
// - checks whether a Genome exists
// - builds generated cards as quality: generated / needsReview: true
// - final file write should happen in Electron main process

import { findGenomeCardFromRegistry } from '../genomeRegistry';
import { buildDraftGenomeCard } from '../generation/genomeGenerator';

function titleFor(input = {}) {
  return input.title || input.officialTitle || input.titleEnglish || '';
}

function titleCandidatesFor(input = {}) {
  if (typeof input === 'string') return [input];

  return [...new Set([
    input.officialTitle,
    input.title,
    input.titleEnglish,
    input.japaneseTitle,
    input.titleJapanese,
    ...(input.titleSynonyms || []),
    ...(input.aliases || [])
  ].filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function tierFromSource(source = '') {
  const value = String(source).toLowerCase();
  if (value.includes('/gold/')) return 'Gold';
  if (value.includes('/core25/')) return 'Core25';
  if (value.includes('/core100/')) return 'Core100';
  if (value.includes('/enhanced/')) return 'Enhanced';
  if (value.includes('/generated/')) return 'Generated';
  if (value.includes('/modules/')) return 'Module';
  return 'Registry';
}

export function getGenomeCoverageForAnime(input = {}) {
  const candidates = titleCandidatesFor(input);

  for (const candidate of candidates) {
    const card = findGenomeCardFromRegistry(candidate);
    if (!card) continue;

    return {
      covered: true,
      title: titleFor(input) || candidate,
      matchedTitle: card.titles?.[0] || card.title || card.id,
      genomeId: card.id,
      tier: tierFromSource(card.registrySource),
      source: card.registrySource || ''
    };
  }

  return {
    covered: false,
    title: titleFor(input),
    matchedTitle: '',
    genomeId: '',
    tier: 'Missing',
    source: ''
  };
}

export function auditGenomeCoverage(anime = []) {
  const covered = [];
  const missing = [];
  const tiers = {};

  for (const item of anime) {
    const coverage = getGenomeCoverageForAnime(item);

    if (coverage.covered) {
      covered.push({ anime: item, ...coverage });
      tiers[coverage.tier] = (tiers[coverage.tier] || 0) + 1;
    } else {
      missing.push(item);
    }
  }

  return {
    total: anime.length,
    covered,
    missing,
    coveredCount: covered.length,
    missingCount: missing.length,
    tiers
  };
}

function metadataFromAnime(input = {}) {
  return {
    malId: input.malId || input.id,
    title: input.title,
    titleEnglish: input.officialTitle || input.titleEnglish,
    titleJapanese: input.japaneseTitle || input.titleJapanese,
    titleSynonyms: input.titleSynonyms || [],
    synopsis: input.synopsis || input.description || '',
    background: input.background || '',
    year: input.year,
    season: input.season,
    type: input.type,
    episodes: input.episodeCount || input.episodes,
    status: input.airingStatus || input.status,
    score: input.communityScore || input.score,
    rating: input.rating,
    source: input.source,
    studios: input.studio ? [input.studio] : (input.studios || []),
    genres: input.genres || [],
    themes: input.themes || [],
    demographics: input.demographics || []
  };
}

export function hasGenomeForAnime(input = {}) {
  return getGenomeCoverageForAnime(input).covered;
}

export function buildGeneratedGenomeForAnime(input = {}) {
  if (hasGenomeForAnime(input)) {
    return {
      generated: false,
      reason: 'Genome already exists.',
      card: null
    };
  }

  const metadata = metadataFromAnime(input);
  const card = buildDraftGenomeCard({ metadata });

  return {
    generated: true,
    reason: 'Generated provisional Genome Card. Save it through Electron main.',
    card
  };
}
