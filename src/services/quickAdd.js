import { animeIdFromTitle } from './animeImporter';

export const QUICK_ADD_STATUS = 'Plan to Watch';

export function buildQuickAddEntry(candidate = {}, {
  source = 'Quick Add',
  librarySize = 0,
  status = QUICK_ADD_STATUS,
  notes = ''
} = {}) {
  const title = candidate.officialTitle || candidate.title || 'Untitled anime';
  const now = new Date().toISOString();
  const candidateId = String(candidate.id || '');
  const libraryId = candidateId && !candidateId.startsWith('catalog-')
    ? candidate.id
    : animeIdFromTitle(candidate);

  return {
    ...candidate,
    id: libraryId,
    title,
    officialTitle: candidate.officialTitle || title,
    status,
    favorite: Boolean(candidate.favorite),
    rewatches: Number(candidate.rewatches || 0),
    finalRank: candidate.finalRank || librarySize + 1,
    notes: candidate.notes || notes,
    libraryNeedsReview: true,
    libraryReviewReason: 'Quick Added. Review status, score, notes, rewatches, and version details when ready.',
    quickAddedAt: candidate.quickAddedAt || now,
    quickAddSource: source,
    addedFrom: candidate.addedFrom || source,
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
