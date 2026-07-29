import { getManualMetadata, normalizeManualMetadataKey } from '../data/manualMetadataOverrides';

export function shouldPreferManualMetadata(title = '') {
  return Boolean(getManualMetadata(title));
}

export function manualMetadataToAnime(item = {}, manual = {}) {
  return {
    ...item,
    ...manual,
    id: item.id || manual.id || normalizeManualMetadataKey(manual.title || item.title).replace(/\s+/g, '-'),
    title: manual.title || item.title,
    officialTitle: manual.officialTitle || manual.title || item.officialTitle,
    description: manual.description || manual.synopsis || item.description || '',
    synopsis: manual.synopsis || manual.description || item.synopsis || '',
    metadataUpdatedAt: new Date().toISOString(),
    syncStatus: {
      ...(item.syncStatus || {}),
      metadata: true,
      manualOverride: true,
      dirty: false,
      lastMetadataSync: new Date().toISOString()
    }
  };
}

