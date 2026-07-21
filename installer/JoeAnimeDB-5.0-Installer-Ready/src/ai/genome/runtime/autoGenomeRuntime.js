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
  const title = titleFor(input);
  if (!title) return false;
  return Boolean(findGenomeCardFromRegistry(input) || findGenomeCardFromRegistry(title));
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
