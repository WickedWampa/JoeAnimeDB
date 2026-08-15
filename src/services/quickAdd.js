import { animeIdFromTitle } from './animeImporter';

export const QUICK_ADD_STATUS = 'Plan to Watch';

// Discover and Upcoming records carry UI state that belongs only in the
// catalog. Once a title enters the personal library, those flags must not
// follow it or the detail modal will continue treating it as a follow-only
// catalog entry.
export function promoteCatalogTitleToLibrary(candidate = {}) {
  const {
    catalogSource,
    discoverBucket,
    discoverSource,
    discoverSyncedAt,
    followed,
    followedAt,
    ignored,
    ...libraryEntry
  } = candidate;
  const candidateId = String(libraryEntry.id || '');

  return {
    ...libraryEntry,
    id: candidateId && !candidateId.startsWith('catalog-')
      ? libraryEntry.id
      : animeIdFromTitle(libraryEntry)
  };
}

export function buildQuickAddEntry(candidate = {}, {
  source = 'Quick Add',
  librarySize = 0,
  status = QUICK_ADD_STATUS,
  notes = ''
} = {}) {
  const libraryCandidate = promoteCatalogTitleToLibrary(candidate);
  const title = libraryCandidate.officialTitle || libraryCandidate.title || 'Untitled anime';
  const now = new Date().toISOString();

  return {
    ...libraryCandidate,
    title,
    officialTitle: libraryCandidate.officialTitle || title,
    status,
    favorite: Boolean(libraryCandidate.favorite),
    rewatches: Number(libraryCandidate.rewatches || 0),
    finalRank: libraryCandidate.finalRank || librarySize + 1,
    notes: libraryCandidate.notes || notes,
    libraryNeedsReview: true,
    libraryReviewReason: 'Quick Added. Review status, score, notes, rewatches, and version details when ready.',
    quickAddedAt: libraryCandidate.quickAddedAt || now,
    quickAddSource: source,
    addedFrom: libraryCandidate.addedFrom || source,
    listUpdatedAt: now
  };
}

export function clearLibraryReview(entry = {}) {
  return {
    ...entry,
    libraryNeedsReview: false,
    libraryReviewReason: '',
    libraryReviewedAt: new Date().toISOString(),
    listUpdatedAt: new Date().toISOString()
  };
}
