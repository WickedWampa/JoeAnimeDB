import {
  applySafeKitsuIdentity,
  resolveSafeKitsuIdentity
} from './animeImporter';
import {
  applyVerifiedCatalogLinkageRepair,
  findVerifiedCatalogKitsuMatch,
  kitsuIdOf
} from './kitsuRelationshipService';

function identifyingTitle(item = {}) {
  return String(item.officialTitle || item.title || '').trim();
}

function resolutionCacheKey(item = {}) {
  return [
    identifyingTitle(item).toLowerCase(),
    item.malId || item.mal_id || '',
    item.year || item.startYear || item.releaseYear || '',
    item.type || item.subtype || item.format || item.showType || ''
  ].map((value) => String(value).trim().toLowerCase()).join('|');
}

function catalogRepairFor(item = {}, catalog = []) {
  const verified = findVerifiedCatalogKitsuMatch(item, catalog);
  if (!verified?.candidate || !kitsuIdOf(verified.candidate)) return null;

  return {
    libraryId: item.id,
    kitsuId: kitsuIdOf(verified.candidate),
    confidence: verified.confidence,
    reason: verified.reason,
    source: 'verified-catalog-identity'
  };
}

function defaultYieldControl() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function kitsuCollision(library = [], proposedKitsuId, currentIndex) {
  const wanted = String(proposedKitsuId || '').trim();
  if (!wanted) return null;
  return library.find((candidate, candidateIndex) =>
    candidateIndex !== currentIndex && String(kitsuIdOf(candidate) || '').trim() === wanted
  ) || null;
}

function flagIdentityCollision(item = {}, proposedKitsuId, collision = {}) {
  return {
    ...item,
    identityNeedsReview: true,
    metadataNeedsReview: true,
    identityResolutionStatus: 'review',
    metadataReviewReason:
      `Kitsu identity ${proposedKitsuId} is already linked to ${collision.title || 'another library title'}.`,
    identityLinkageSource: 'database-update-collision-review',
    identityLinkageUpdatedAt: new Date().toISOString()
  };
}

/**
 * Safely repairs missing Kitsu identity links for an entire library.
 *
 * This deliberately delegates confidence decisions to the same catalog/title
 * resolver helpers used by Home and MAL import. It only adds identity metadata;
 * the existing library object remains the source of every user-owned field.
 */
export async function repairLibraryKitsuLinkages({
  library = [],
  catalog = [],
  resolveIdentity = resolveSafeKitsuIdentity,
  onProgress,
  yieldControl = defaultYieldControl
} = {}) {
  const nextLibrary = [...library];
  const networkResolutions = new Map();
  const linkedBefore = library.filter((item) => Boolean(kitsuIdOf(item))).length;
  const summary = {
    scanned: library.length,
    eligible: 0,
    skippedLinked: 0,
    repaired: 0,
    needsReview: 0,
    unresolved: 0,
    linkedBefore,
    linkedAfter: linkedBefore,
    changed: 0,
    updates: []
  };

  for (let index = 0; index < nextLibrary.length; index += 1) {
    const item = nextLibrary[index] || {};
    const title = identifyingTitle(item) || `Library title ${index + 1}`;

    onProgress?.({ index: index + 1, total: nextLibrary.length, title, summary: { ...summary } });

    if (kitsuIdOf(item)) {
      summary.skippedLinked += 1;
      if ((index + 1) % 5 === 0) await yieldControl();
      continue;
    }

    if (item.identityNeedsReview) {
      summary.needsReview += 1;
      if ((index + 1) % 5 === 0) await yieldControl();
      continue;
    }

    if (!identifyingTitle(item)) {
      summary.unresolved += 1;
      if ((index + 1) % 5 === 0) await yieldControl();
      continue;
    }

    summary.eligible += 1;

    try {
      const catalogRepair = catalogRepairFor(item, catalog);
      if (catalogRepair) {
        const collision = kitsuCollision(nextLibrary, catalogRepair.kitsuId, index);
        if (collision) {
          nextLibrary[index] = flagIdentityCollision(item, catalogRepair.kitsuId, collision);
          summary.needsReview += 1;
          summary.changed += 1;
          summary.updates.push({ kind: 'review', item: nextLibrary[index] });
          if ((index + 1) % 5 === 0) await yieldControl();
          continue;
        }

        nextLibrary[index] = applyVerifiedCatalogLinkageRepair(item, catalogRepair);
        if (kitsuIdOf(nextLibrary[index])) {
          summary.repaired += 1;
          summary.changed += 1;
          summary.updates.push({ kind: 'repaired', item: nextLibrary[index] });
        } else {
          summary.unresolved += 1;
        }
        if ((index + 1) % 5 === 0) await yieldControl();
        continue;
      }

      const cacheKey = resolutionCacheKey(item);
      if (!networkResolutions.has(cacheKey)) {
        networkResolutions.set(cacheKey, Promise.resolve().then(() => resolveIdentity(item)));
      }
      const resolution = await networkResolutions.get(cacheKey);
      const repairedItem = applySafeKitsuIdentity(item, resolution, 'database-update-safe-repair');

      if (kitsuIdOf(repairedItem)) {
        const proposedKitsuId = kitsuIdOf(repairedItem);
        const collision = kitsuCollision(nextLibrary, proposedKitsuId, index);
        if (collision) {
          nextLibrary[index] = flagIdentityCollision(item, proposedKitsuId, collision);
          summary.needsReview += 1;
          summary.changed += 1;
          summary.updates.push({ kind: 'review', item: nextLibrary[index] });
        } else {
          nextLibrary[index] = repairedItem;
          summary.repaired += 1;
          summary.changed += 1;
          summary.updates.push({ kind: 'repaired', item: nextLibrary[index] });
        }
      } else if (repairedItem.identityNeedsReview) {
        nextLibrary[index] = repairedItem;
        summary.needsReview += 1;
        if (repairedItem !== item) {
          summary.changed += 1;
          summary.updates.push({ kind: 'review', item: repairedItem });
        }
      } else {
        summary.unresolved += 1;
      }
    } catch {
      summary.unresolved += 1;
    }

    if ((index + 1) % 5 === 0) await yieldControl();
  }

  summary.linkedAfter = nextLibrary.filter((item) => Boolean(kitsuIdOf(item))).length;
  return { library: nextLibrary, ...summary };
}
