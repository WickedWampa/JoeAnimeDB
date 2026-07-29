import React, { useEffect, useState } from 'react';
import { Poster } from './Poster';
import { score } from '../utils/animeUtils';
import { fetchKitsuMetadata } from '../services/kitsuProvider';
import { enrichMissingMetadata } from '../services/wikidataRepair';
import { mergeAnimeMetadata } from '../services/animeImporter';
import { preservePersonalAnimeData } from '../services/personalAnimeData';
import '../styles/detail-metadata-repair.css';
import '../styles/library-release-readiness.css';

const WATCH_STATUSES = [
  '',
  'Watching',
  'Completed',
  'On Hold',
  'Dropped',
  'Plan to Watch'
];

const STATUS_CLASS = {
  Watching: 'watching',
  Completed: 'completed',
  'On Hold': 'hold',
  Dropped: 'dropped',
  'Plan to Watch': 'plan'
};

function Stars({ value }) {
  const rounded = Math.round(Number(value || 0));
  return (
    <span className="starDisplay" aria-hidden="true">
      {Array.from({ length: 10 }).map((_, index) => (
        <span key={index} className={index < rounded ? 'filled' : ''}>★</span>
      ))}
    </span>
  );
}

export function DetailModal({
  anime,
  library = [],
  onClose,
  updateAnime,
  updateCatalogAnime,
  deleteAnime,
  onPrevious,
  onNext,
  navigationIndex = -1,
  navigationCount = 0
}) {
  const [repairingMetadata, setRepairingMetadata] = useState(false);
  const [metadataMessage, setMetadataMessage] = useState('');
  const [metadataMessageType, setMetadataMessageType] = useState('');
  const [metadataProgressText, setMetadataProgressText] = useState('');
  const [scoreDraft, setScoreDraft] = useState(Number(anime.joeScore ?? score(anime) ?? 0));
  const [scoreSaving, setScoreSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState('');
  const isCatalogTitle = String(anime.id || '').startsWith('catalog-') || Boolean(anime.catalogSource);
  const currentScore = Number(scoreDraft || 0);
  const currentStatus = anime.status || '';
  const navigationLocked = repairingMetadata || deleting || scoreSaving;
  const canGoPrevious = !navigationLocked && typeof onPrevious === 'function' && navigationIndex > 0;
  const canGoNext = !navigationLocked && typeof onNext === 'function' && navigationIndex >= 0 && navigationIndex < navigationCount - 1;
  const needsMetadataReview = Boolean(anime.metadataNeedsReview || anime.metadataNeedsRefresh);

  useEffect(() => {
    setScoreDraft(Number(anime.joeScore ?? score(anime) ?? 0));
    setMetadataMessage('');
    setMetadataMessageType('');
    setMetadataProgressText('');
    setConfirmingDelete(false);
    setDeleteMessage('');
  }, [anime.id, anime.joeScore]);

  useEffect(() => {
    function handleKeyDown(event) {
      const target = event.target;
      const isEditing = target instanceof HTMLElement && (
        target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      );

      if (event.key === 'Escape') {
        event.preventDefault();
        if (confirmingDelete) setConfirmingDelete(false);
        else if (!navigationLocked) onClose();
        return;
      }

      if (isEditing || navigationLocked) return;

      if (event.key === 'ArrowLeft' && canGoPrevious) {
        event.preventDefault();
        onPrevious();
      }

      if (event.key === 'ArrowRight' && canGoNext) {
        event.preventDefault();
        onNext();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canGoPrevious, canGoNext, confirmingDelete, navigationLocked, onClose, onPrevious, onNext]);

  async function updateField(field, value) {
    if (!updateAnime) return;
    await updateAnime({
      ...anime,
      [field]: value
    });
  }

  function updateRewatches(delta) {
    const next = Math.max(0, Number(anime.rewatches || 0) + delta);
    updateField('rewatches', next);
  }

  async function commitScore() {
    if (!updateAnime || isCatalogTitle || scoreSaving) return;

    const nextScore = Math.max(0, Math.min(10, Math.round(Number(scoreDraft || 0) * 10) / 10));
    const savedScore = Number(anime.joeScore ?? score(anime) ?? 0);
    setScoreDraft(nextScore);

    if (nextScore === savedScore) return;

    setScoreSaving(true);
    try {
      await updateField('joeScore', nextScore);
    } finally {
      setScoreSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteAnime || deleting) return;

    setDeleting(true);
    setDeleteMessage('');

    try {
      await deleteAnime(anime.id);
      onClose();
    } catch (error) {
      console.warn('Remove from library failed:', anime.title, error);
      setDeleteMessage('Could not remove this title. Your library was not changed.');
      setDeleting(false);
    }
  }

  async function toggleFollow() {
    if (!updateCatalogAnime) return;

    const following = !Boolean(anime.followed);

    await updateCatalogAnime({
      ...anime,
      followed: following,
      ignored: false,
      followedAt: following ? (anime.followedAt || new Date().toISOString()) : '',
      listUpdatedAt: new Date().toISOString()
    });
  }

  async function repairMetadata() {
    if (!updateAnime || repairingMetadata) return;

    setRepairingMetadata(true);
    setMetadataMessage('');
    setMetadataMessageType('');
    setMetadataProgressText('Checking Kitsu…');

    try {
      const repairRunId = `${Date.now()}-${String(anime.id || anime.title)}`;
      const identity = (item) => ({
        id: item?.id ?? null,
        title: item?.title || '',
        malId: item?.malId ?? item?.mal_id ?? null,
        kitsuId: item?.kitsuId ?? item?.kitsu_id ?? null
      });
      console.group(`[Metadata Repair Debug][Modal][${repairRunId}] ${anime.title}`);
      console.log('LIBRARY AT REPAIR START', {
        count: Array.isArray(library) ? library.length : 0,
        target: identity(anime),
        recordsSharingProviderIds: (Array.isArray(library) ? library : []).filter((item) => {
          if (String(item.id) === String(anime.id)) return false;
          const sameMal = anime.malId != null && String(item.malId ?? item.mal_id ?? '') === String(anime.malId);
          const sameKitsu = anime.kitsuId != null && String(item.kitsuId ?? item.kitsu_id ?? '') === String(anime.kitsuId);
          return sameMal || sameKitsu;
        }).map(identity)
      });

      let refreshed = { ...anime };
      let kitsuError = null;

      try {
        const kitsu = await fetchKitsuMetadata(anime);
        console.log('RAW KITSU RESULT IDENTITY', identity(kitsu));
        refreshed = mergeAnimeMetadata(anime, kitsu, anime.status);
        console.log('IDENTITY AFTER KITSU MERGE', {
          original: identity(anime),
          refreshed: identity(refreshed),
          changed: JSON.stringify(identity(anime)) !== JSON.stringify(identity(refreshed))
        });
      } catch (error) {
        kitsuError = error;
        console.warn('Single-title Kitsu repair failed:', anime.title, error);
      }

      setMetadataProgressText('Completing missing metadata with Wikidata…');

      const wikiResult = await enrichMissingMetadata(
        refreshed,
        Array.isArray(library) && library.length ? library : [anime]
      );

      console.log('RAW WIKIDATA RESULT IDENTITY', identity(wikiResult?.item));

      const completed = preservePersonalAnimeData(anime, {
        ...refreshed,
        ...(wikiResult?.item || {}),
        metadataNeedsRefresh: Boolean(wikiResult?.unresolved),
        syncStatus: {
          ...(anime.syncStatus || {}),
          ...(refreshed.syncStatus || {}),
          metadata: true,
          poster: Boolean((wikiResult?.item || refreshed).cover),
          genres: Boolean((wikiResult?.item || refreshed).genres?.length),
          studio: Boolean((wikiResult?.item || refreshed).studio),
          dirty: Boolean(wikiResult?.unresolved),
          metadataError: '',
          metadataSource: wikiResult?.source || refreshed.metadataSource || 'kitsu',
          lastMetadataSync: new Date().toISOString()
        }
      });

      console.log('IDENTITY AFTER ALL PROVIDER MERGES', {
        original: identity(anime),
        refreshed: identity(refreshed),
        completed: identity(completed),
        changedFromOriginal: JSON.stringify(identity(anime)) !== JSON.stringify(identity(completed))
      });

      const improved = Boolean(
        completed.cover !== anime.cover ||
        completed.synopsis !== anime.synopsis ||
        completed.studio !== anime.studio ||
        completed.year !== anime.year ||
        completed.episodeCount !== anime.episodeCount ||
        JSON.stringify(completed.genres || []) !== JSON.stringify(anime.genres || [])
      );

      if (!improved && wikiResult?.unresolved && kitsuError) {
        throw new Error(
          `Kitsu: ${kitsuError?.message || kitsuError}; Wikidata could not complete the remaining fields.`
        );
      }

      console.groupCollapsed(`[Single Repair Trace] ${anime.title}`);
      console.log('ORIGINAL RECORD', {
        id: anime.id,
        title: anime.title,
        studio: anime.studio || '',
        studios: anime.studios || [],
        productionStudios: anime.productionStudios || [],
        genres: anime.genres || [],
        metadataNeedsRefresh: anime.metadataNeedsRefresh,
        syncStatus: anime.syncStatus
      });
      console.log('KITSU MERGED RESULT', {
        studio: refreshed.studio || '',
        studios: refreshed.studios || [],
        productionStudios: refreshed.productionStudios || [],
        genres: refreshed.genres || [],
        metadataSource: refreshed.metadataSource,
        syncStatus: refreshed.syncStatus
      });
      console.log('WIKIDATA RESULT', {
        source: wikiResult?.source || '',
        fields: wikiResult?.fields || [],
        unresolved: Boolean(wikiResult?.unresolved),
        item: wikiResult?.item || null
      });
      console.log('FINAL METADATA BEFORE SAVE', {
        id: completed.id,
        title: completed.title,
        studio: completed.studio || '',
        studios: completed.studios || [],
        productionStudios: completed.productionStudios || [],
        genres: completed.genres || [],
        metadataNeedsRefresh: completed.metadataNeedsRefresh,
        syncStatus: completed.syncStatus
      });

      setMetadataProgressText('Saving repaired metadata…');
      console.log('CALLING updateAnime WITH', identity(completed), completed);
      const savedDatabase = await updateAnime(completed);
      console.log('RETURNED DATABASE SUMMARY', {
        count: Array.isArray(savedDatabase?.anime) ? savedDatabase.anime.length : null,
        targetMatchesById: (savedDatabase?.anime || []).filter((item) => String(item.id) === String(completed.id)).map(identity),
        targetMatchesByMalId: completed.malId == null ? [] : (savedDatabase?.anime || []).filter((item) => String(item.malId ?? item.mal_id ?? '') === String(completed.malId)).map(identity)
      });
      const savedRecord = (savedDatabase?.anime || []).find((item) =>
        String(item.id) === String(completed.id)
      );

      console.log('SAVED RECORD AFTER DATABASE ROUND-TRIP', {
        id: savedRecord?.id || completed.id,
        title: savedRecord?.title || completed.title,
        studio: savedRecord?.studio || '',
        studios: savedRecord?.studios || [],
        productionStudios: savedRecord?.productionStudios || [],
        genres: savedRecord?.genres || [],
        metadataNeedsRefresh: savedRecord?.metadataNeedsRefresh,
        syncStatus: savedRecord?.syncStatus
      });
      console.groupEnd();
      console.groupEnd();

      const finalRecord = savedRecord || completed;
      const missingStudio = !String(finalRecord?.studio || '').trim();
      const missingGenres = !Array.isArray(finalRecord?.genres) || !finalRecord.genres.length;
      const remainingFields = [
        missingStudio ? 'studio' : '',
        missingGenres ? 'genres' : ''
      ].filter(Boolean);

      if (remainingFields.length) {
        setMetadataMessage(
          improved
            ? `Metadata partially repaired — ${remainingFields.join(' and ')} still unresolved.`
            : `No additional metadata was found — ${remainingFields.join(' and ')} still unresolved.`
        );
        setMetadataMessageType('warning');
      } else {
        setMetadataMessage('Metadata repaired successfully.');
        setMetadataMessageType('success');
      }

      setMetadataProgressText('');
    } catch (error) {
      console.error('[Metadata Repair Debug] REPAIR FAILED', error);
      console.groupEnd();
      const message = String(error?.message || error || 'Unknown error');
      console.warn('Single-title metadata repair failed:', anime.title, error);
      setMetadataMessage(
        `Metadata repair failed: ${message}. Your library is safe and nothing was changed.`
      );
      setMetadataMessageType('error');
      setMetadataProgressText('');
    } finally {
      setRepairingMetadata(false);
    }
  }

  return (
    <div className="modalBackdrop">
      <section className="detailModal upgradedModal">
        <button className="close" onClick={onClose}>×</button>
        <aside className="detailArtRail">
          <Poster anime={anime} className="detailPoster" />
          <button
            className={`favoriteToggle heroFavorite ${anime.favorite ? 'active' : ''}`}
            type="button"
            onClick={() => updateField('favorite', !Boolean(anime.favorite))}
          >
            {anime.favorite ? '❤️ Favorite' : '🤍 Add Favorite'}
          </button>

          {isCatalogTitle && (
            <button
              className={`repairMetadataButton ${anime.followed ? 'followingActive' : ''}`}
              type="button"
              onClick={toggleFollow}
              disabled={!updateCatalogAnime}
            >
              {anime.followed ? '🔔 Following' : '🔔 Notify Me / Follow'}
            </button>
          )}

          <button
            className="repairMetadataButton"
            type="button"
            onClick={repairMetadata}
            disabled={repairingMetadata || !updateAnime}
          >
            {repairingMetadata ? `⏳ ${metadataProgressText || 'Repairing Metadata…'}` : '🔄 Repair Metadata'}
          </button>

          {repairingMetadata && metadataProgressText && (
            <p className="metadataRepairProgress" role="status">{metadataProgressText}</p>
          )}

          {metadataMessage && (
            <p className={`metadataRepairMessage ${metadataMessageType}`} role="status">
              {metadataMessageType === 'success' ? '✓ ' : metadataMessageType === 'warning' ? '⚠ ' : '✕ '}
              {metadataMessage}
            </p>
          )}
        </aside>

        <div className="detailBody">
          <div className="detailNavigation">
            <button
              type="button"
              className="detailNavigationButton"
              onClick={onPrevious}
              disabled={!canGoPrevious}
              aria-label="Previous anime"
              title="Previous anime (Left arrow)"
            >
              ‹
            </button>
            <div className="detailNavigationPosition">
              <p className="eyebrow">Anime Details</p>
              {navigationIndex >= 0 && navigationCount > 0 && (
                <span>{navigationIndex + 1} of {navigationCount}</span>
              )}
            </div>
            <button
              type="button"
              className="detailNavigationButton"
              onClick={onNext}
              disabled={!canGoNext}
              aria-label="Next anime"
              title="Next anime (Right arrow)"
            >
              ›
            </button>
          </div>
          <h1>{anime.title}</h1>
          <p className="muted">{anime.studio} · {anime.type || 'TV'} · {anime.year || ''}</p>

          {needsMetadataReview && (
            <section className={`detailMetadataReview ${anime.metadataNeedsReview ? 'identityReview' : ''}`} role="status">
              <strong>⚠ {anime.metadataNeedsReview ? 'Title match needs review' : 'Metadata is incomplete'}</strong>
              <p>
                {anime.metadataReviewReason ||
                  'Some provider details are missing or uncertain. Your score, status, favorites, rewatches, and notes will be preserved if you repair it.'}
              </p>
            </section>
          )}

          {!isCatalogTitle && <section className="scoreEditor">
            <div>
              <span className="controlLabel">My Score</span>
              <Stars value={currentScore} />
            </div>
            <strong>{currentScore.toFixed(1)}</strong>
            <input
              type="range"
              min="0"
              max="10"
              step="0.1"
              value={currentScore}
              aria-label="My Score"
              aria-valuetext={`${currentScore.toFixed(1)} out of 10`}
              onChange={(event) => setScoreDraft(Number(event.target.value))}
              onPointerUp={commitScore}
              onKeyUp={commitScore}
              onBlur={commitScore}
            />
            {scoreSaving && <small className="scoreSaving" role="status">Saving…</small>}
          </section>}

          <div className="detailStats">
            <div><strong>{currentScore.toFixed(1)}</strong><span>My Score</span></div>
            <div><strong>{anime.communityScore || '—'}</strong><span>Community</span></div>
            <div><strong>{anime.episodeCount || '—'}</strong><span>Episodes</span></div>
            <div><strong>{anime.rewatches || 0}</strong><span>Rewatches</span></div>
          </div>

          {!isCatalogTitle && <section className="personalPanel glowPanel">
            <label className="statusControl">
              <span className="controlLabel">Watch Status</span>
              <div className={`statusPill ${STATUS_CLASS[currentStatus] || 'unset'}`}>
                {currentStatus || 'Not Set'}
              </div>
              <select
                value={currentStatus}
                onChange={(event) => updateField('status', event.target.value)}
              >
                {WATCH_STATUSES.map((status) => (
                  <option key={status || 'none'} value={status}>{status || 'Not Set'}</option>
                ))}
              </select>
            </label>

            <div className="rewatchControl">
              <span className="controlLabel">Rewatches</span>
              <div className="stepper">
                <button type="button" onClick={() => updateRewatches(-1)} aria-label="Decrease rewatches">−</button>
                <strong>{anime.rewatches || 0}</strong>
                <button type="button" onClick={() => updateRewatches(1)} aria-label="Increase rewatches">+</button>
              </div>
            </div>

            <label className="notesField polishedNotes">
              <span className="controlLabel">Personal Notes</span>
              <textarea
                value={anime.notes || ''}
                placeholder="What did this anime mean to you?"
                onChange={(event) => updateField('notes', event.target.value)}
              />
            </label>
          </section>}

          <div className="tags">{(anime.genres || []).map((g) => <span key={g}>{g}</span>)}</div>
          <section className="synopsisBlock">
            <h2>Synopsis</h2>
            <p>{anime.synopsis}</p>
          </section>
          {anime.trailerUrl && <a className="trailer" href={anime.trailerUrl} target="_blank" rel="noreferrer">Watch Trailer</a>}

          {!isCatalogTitle && <section className="dangerZone">
            {confirmingDelete ? (
              <div className="removeConfirmBox" role="alert">
                <div>
                  <strong>Remove “{anime.title}”?</strong>
                  <p>This permanently removes its score, status, notes, favorite, and rewatch history.</p>
                  {deleteMessage && <p className="removeError">{deleteMessage}</p>}
                </div>
                <div className="removeConfirmActions">
                  <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                    Keep Title
                  </button>
                  <button className="confirmRemoveButton" type="button" onClick={confirmDelete} disabled={deleting}>
                    {deleting ? 'Removing…' : 'Remove Permanently'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="removeAnimeButton"
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={!deleteAnime}
              >
                🗑 Remove From Library
              </button>
            )}
          </section>}
        </div>
      </section>
    </div>
  );
}
