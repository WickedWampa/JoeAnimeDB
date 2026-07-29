// Legacy compatibility layer. New code should use kitsuProvider directly.
// The old exports remain temporarily so older callers cannot revive a retired
// network provider by importing this module.
import { fetchKitsuMetadata } from './kitsuProvider';

function studioNames(item = {}) {
  const values = [
    item.productionStudios,
    item.animationStudios,
    item.studios,
    item.studio
  ];

  return [...new Set(
    values
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .flatMap((value) => {
        if (!value) return [];
        if (typeof value === 'object') return [value.name || value.title || ''];
        return String(value).split(/\s+\/\s+|\s*;\s*|\s*\|\s*/);
      })
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )];
}

export function jikanRepairNeeds(item = {}) {
  return {
    cover: !item.cover,
    synopsis: !(item.synopsis || item.description),
    studio: !studioNames(item).length,
    genres: !Array.isArray(item.genres) || !item.genres.length,
    year: !Number(item.year || 0),
    episodes: !Number(item.episodeCount || item.episodes || 0)
  };
}

export function needsManualJikanRepair(item = {}) {
  return Object.values(jikanRepairNeeds(item)).some(Boolean);
}

function patchFromKitsu(item = {}, enriched = {}) {
  const needs = jikanRepairNeeds(item);
  const studios = studioNames(enriched);
  const patch = {
    kitsuId: enriched.kitsuId || item.kitsuId || '',
    metadataRepairSource: 'kitsu-legacy-compatibility',
    metadataUpdatedAt: new Date().toISOString()
  };

  if (needs.cover && enriched.cover) patch.cover = enriched.cover;
  if (needs.synopsis && (enriched.synopsis || enriched.description)) {
    patch.synopsis = enriched.synopsis || enriched.description;
    patch.description = enriched.description || enriched.synopsis;
  }
  if (needs.studio && studios.length) {
    patch.studio = studios.join(' / ');
    patch.productionStudios = studios;
  }
  if (needs.genres && enriched.genres?.length) patch.genres = enriched.genres;
  if (needs.year && enriched.year) patch.year = enriched.year;
  if (needs.episodes && (enriched.episodeCount || enriched.episodes)) {
    patch.episodeCount = enriched.episodeCount || enriched.episodes;
    patch.episodes = enriched.episodes || enriched.episodeCount;
  }

  return patch;
}

export async function fetchManualJikanRepair(item = {}) {
  const enriched = await fetchKitsuMetadata(item);
  return {
    patch: patchFromKitsu(item, enriched),
    matchedTitle: enriched.officialTitle || enriched.title || item.officialTitle || item.title,
    confidence: 95,
    provider: 'kitsu'
  };
}

export async function fetchJikanStudioFallback(item = {}) {
  const enriched = await fetchKitsuMetadata(item);
  const studios = studioNames(enriched);
  if (!studios.length) throw new Error('Kitsu matched the title but returned no studio data');

  return {
    patch: {
      kitsuId: enriched.kitsuId || item.kitsuId || '',
      studio: studios.join(' / '),
      productionStudios: studios,
      metadataRepairSource: 'kitsu-studio-fallback',
      kitsuStudioFallbackUpdatedAt: new Date().toISOString()
    },
    matchedTitle: enriched.officialTitle || enriched.title || item.officialTitle || item.title,
    confidence: 95,
    provider: 'kitsu'
  };
}
