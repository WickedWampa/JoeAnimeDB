import { getManualMetadata, normalizeManualMetadataKey } from '../data/manualMetadataOverrides';
import { manualMetadataToAnime } from './metadataResolver';
import { fetchMetadata as fetchJikanMetadata } from './metadata';
import { fetchKitsuMetadata } from './kitsuProvider';

export function applyMetadataToAnime(item = {}, metadata = {}) {
  return {
    ...item,
    ...metadata,
    id: item.id || metadata.id || metadata.malId || normalizeManualMetadataKey(metadata.title || item.title).replace(/\s+/g, '-'),
    title: metadata.title || item.title,
    officialTitle: metadata.officialTitle || metadata.titleEnglish || metadata.title || item.officialTitle || item.title,
    description: metadata.description || metadata.synopsis || item.description || '',
    synopsis: metadata.synopsis || metadata.description || item.synopsis || '',
    metadataUpdatedAt: new Date().toISOString(),
    syncStatus: {
      ...(item.syncStatus || {}),
      metadata: true,
      manualOverride: metadata.metadataSource === 'manual',
      dirty: false,
      lastMetadataSync: new Date().toISOString()
    }
  };
}

export function getManualMetadataForAnime(itemOrTitle = {}) {
  const title = typeof itemOrTitle === 'string'
    ? itemOrTitle
    : itemOrTitle.title || itemOrTitle.officialTitle || itemOrTitle.titleEnglish;

  return getManualMetadata(title);
}

export async function fetchMetadataFromProvider(item = {}) {
  const manual = getManualMetadataForAnime(item);

  if (manual) {
    return manualMetadataToAnime(item, manual);
  }

  let fetched;
  let provider = 'jikan';

  try {
    fetched = await fetchJikanMetadata(item);
  } catch (jikanError) {
    console.warn('Jikan metadata lookup failed; trying Kitsu fallback:', item?.title, jikanError);
    fetched = await fetchKitsuMetadata(item);
    provider = 'kitsu';
  }

  const needsRefresh = Boolean(fetched.metadataNeedsRefresh);

  return {
    ...fetched,
    metadataSource: fetched.metadataSource || provider,
    metadataNeedsRefresh: needsRefresh,
    syncStatus: {
      ...(fetched.syncStatus || item.syncStatus || {}),
      metadata: true,
      metadataSource: provider,
      manualOverride: false,
      dirty: needsRefresh,
      lastMetadataSync: new Date().toISOString()
    }
  };
}

export function hasManualMetadataOverride(itemOrTitle = {}) {
  return Boolean(getManualMetadataForAnime(itemOrTitle));
}
