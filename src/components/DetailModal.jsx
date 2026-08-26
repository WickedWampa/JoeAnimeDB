import React, { useEffect, useRef, useState } from 'react';
import { Poster } from './Poster';
import { score } from '../utils/animeUtils';
import { fetchKitsuMetadata } from '../services/kitsuProvider';
import { enrichMissingMetadata } from '../services/wikidataRepair';
import { mergeAnimeMetadata } from '../services/animeImporter';
import { preservePersonalAnimeData } from '../services/personalAnimeData';
import { buildQuickAddEntry, clearLibraryReview } from '../services/quickAdd';
import { sameAnimeIdentity } from '../services/titleIdentity';
import {
  WATCHMODE_REGIONS,
  confirmWatchmodeMatch,
  fetchWhereToWatch,
  forgetWatchmodeMatch,
  getSavedStreamingApps,
  getSavedWatchRegion,
  groupWatchProvidersByPreference,
  saveWatchRegion
} from '../services/watchmodeService';
import { primeKitsuStreamingLinks } from '../services/kitsuStreamingService';
import { getCachedStreamingAvailability } from '../services/streamingAvailabilityService';
import { openExternalUrl } from '../platform/runtime';
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
  const detailModalRef = useRef(null);
  const tvPendingNavigationFocusRef = useRef(null);
  const [repairingMetadata, setRepairingMetadata] = useState(false);
  const [metadataMessage, setMetadataMessage] = useState('');
  const [metadataMessageType, setMetadataMessageType] = useState('');
  const [metadataProgressText, setMetadataProgressText] = useState('');
  const [scoreDraft, setScoreDraft] = useState(Number(anime.joeScore ?? score(anime) ?? 0));
  const [scoreSaving, setScoreSaving] = useState(false);
  const scoreDraftRef = useRef(Number(anime.joeScore ?? score(anime) ?? 0));
  const scorePersistedRef = useRef(Number(anime.joeScore ?? score(anime) ?? 0));
  const scoreSaveTimerRef = useRef(null);
  const scoreSaveInFlightRef = useRef(false);
  const scoreQueuedValueRef = useRef(null);
  const scoreEditingRef = useRef(false);
  const scoreAnimeIdRef = useRef(String(anime.id || ''));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState('');
  const [catalogActionBusy, setCatalogActionBusy] = useState('');
  const [watchRegion, setWatchRegion] = useState(() => getSavedWatchRegion());
  const [streamingApps, setStreamingApps] = useState(() => getSavedStreamingApps());
  const [watchState, setWatchState] = useState({ status: 'loading', providers: [], candidates: [] });
  const selectedId = String(anime.id || '');
  const isLibraryTitle = Boolean(selectedId) && (library || []).some(
    (entry) => String(entry.id || '') === selectedId
  );
  const isCatalogTitle = !isLibraryTitle && (
    selectedId.startsWith('catalog-') || Boolean(anime.catalogSource)
  );
  const currentScore = Number(scoreDraft || 0);
  const currentStatus = anime.status || '';
  const navigationLocked = repairingMetadata || deleting || scoreSaving;
  const canGoPrevious = !navigationLocked && typeof onPrevious === 'function' && navigationIndex > 0;
  const canGoNext = !navigationLocked && typeof onNext === 'function' && navigationIndex >= 0 && navigationIndex < navigationCount - 1;
  const needsMetadataReview = Boolean(anime.metadataNeedsReview || anime.metadataNeedsRefresh);
  const displayStudio =
    anime.studio ||
    anime.studios?.[0]?.name || anime.studios?.[0] ||
    anime.productionStudios?.[0]?.name || anime.productionStudios?.[0] || '';
  const displayType = anime.type || anime.mediaType || '';
  const displayYear = anime.year || '';
  const displayEpisodeCount = Number(anime.episodeCount || anime.episodes || 0);
  const displayCommunityScore = anime.communityScore ?? anime.malScore ?? anime.score ?? null;
  const displayMetadataLine = [displayStudio, displayType, displayYear].filter(Boolean).join(' · ');
  const watchProviderGroups = groupWatchProvidersByPreference(
    watchState.providers || [],
    streamingApps
  );

  useEffect(() => {
    const nextScore = Number(anime.joeScore ?? score(anime) ?? 0);
    if (scoreSaveTimerRef.current) window.clearTimeout(scoreSaveTimerRef.current);
    scoreSaveTimerRef.current = null;
    scoreSaveInFlightRef.current = false;
    scoreQueuedValueRef.current = null;
    scoreEditingRef.current = false;
    scoreAnimeIdRef.current = String(anime.id || '');
    scoreDraftRef.current = nextScore;
    scorePersistedRef.current = nextScore;
    setScoreDraft(nextScore);
    setScoreSaving(false);
    setMetadataMessage('');
    setMetadataMessageType('');
    setMetadataProgressText('');
    setConfirmingDelete(false);
    setDeleteMessage('');
  }, [anime.id]);

  useEffect(() => {
    const savedScore = Number(anime.joeScore ?? score(anime) ?? 0);
    scorePersistedRef.current = savedScore;

    // A TV D-pad sequence can outpace SQLite. While the slider is being
    // edited, its local draft is authoritative; an older persisted value must
    // not flow back through props and snap the thumb toward a lower score.
    if (!scoreEditingRef.current && !scoreSaveInFlightRef.current) {
      scoreDraftRef.current = savedScore;
      setScoreDraft(savedScore);
    }
  }, [anime.joeScore]);

  useEffect(() => () => {
    if (scoreSaveTimerRef.current) window.clearTimeout(scoreSaveTimerRef.current);
  }, []);

  useEffect(() => {
    const syncStreamingApps = (event) => {
      setStreamingApps(
        Array.isArray(event?.detail) ? event.detail : getSavedStreamingApps()
      );
    };

    window.addEventListener('joeanime:streaming-apps-changed', syncStreamingApps);
    return () => window.removeEventListener('joeanime:streaming-apps-changed', syncStreamingApps);
  }, []);

  useEffect(() => {
    let active = true;
    const cached = getCachedStreamingAvailability(anime, {
      region: watchRegion,
      allowStale: true
    });
    setWatchState(cached?.status
      ? cached
      : { status: 'loading', providers: [], candidates: [], source: 'kitsu' });

    primeKitsuStreamingLinks([anime])
      .then(() => {
        if (!active) return;
        const result = getCachedStreamingAvailability(anime, {
          region: watchRegion,
          allowStale: true
        });
        if (result?.status) setWatchState(result);
        else if (!cached?.status) {
          setWatchState({
            status: 'not_found',
            providers: [],
            candidates: [],
            source: 'kitsu',
            regional: false
          });
        }
      })
      .catch((error) => {
        if (active && !cached?.status) {
          setWatchState({
            status: 'error',
            providers: [],
            candidates: [],
            source: 'kitsu',
            error: String(error?.message || error || 'Where to Watch is unavailable.')
          });
        }
      });

    return () => {
      active = false;
    };
  }, [anime.id, anime.title, anime.year, anime.type, watchRegion]);

  async function checkWatchmodeAvailability({ forceReview = false } = {}) {
    setWatchState((current) => ({ ...current, status: 'loading' }));
    try {
      const result = await fetchWhereToWatch(anime, {
        region: watchRegion,
        forceReview,
        requestMode: 'interactive'
      });
      setWatchState({ ...result, source: 'watchmode', regional: true });
    } catch (error) {
      setWatchState({
        status: 'error',
        providers: [],
        candidates: [],
        source: 'watchmode',
        error: String(error?.message || error || 'Where to Watch is unavailable.')
      });
    }
  }

  function changeWatchRegion(event) {
    const nextRegion = event.target.value;
    saveWatchRegion(nextRegion);
    setWatchRegion(nextRegion);
  }

  async function chooseWatchmodeCandidate(candidate) {
    setWatchState((current) => ({ ...current, status: 'loading' }));
    try {
      const result = await confirmWatchmodeMatch(anime, candidate.id, { region: watchRegion });
      setWatchState({ ...result, source: 'watchmode', regional: true });
    } catch (error) {
      setWatchState({
        status: 'error',
        providers: [],
        candidates: [],
        error: String(error?.message || error || 'Where to Watch is unavailable.')
      });
    }
  }

  function changeWatchmodeMatch() {
    forgetWatchmodeMatch(anime);
    void checkWatchmodeAvailability({ forceReview: true });
  }

  function handleDetailNavigation(direction) {
    if (document.body?.classList.contains('tvInputMode')) {
      tvPendingNavigationFocusRef.current = direction;
    }

    if (direction === 'previous') onPrevious?.();
    else onNext?.();
  }

  function isTvDetailFocusable(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
    if (element.matches(':disabled, [aria-disabled="true"]')) return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getTvDetailControls() {
    const root = detailModalRef.current;
    if (!root) return [];

    return Array.from(root.querySelectorAll([
      'button:not([disabled])',
      'a[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[role="button"]:not([aria-disabled="true"])',
      '[tabindex]:not([tabindex="-1"])'
    ].join(','))).filter(isTvDetailFocusable);
  }

  function findTvDetailCandidate(active, direction) {
    const controls = getTvDetailControls();
    if (!controls.length) return null;

    const from = active.getBoundingClientRect();
    const fromX = from.left + from.width / 2;
    const fromY = from.top + from.height / 2;
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const candidate of controls) {
      if (candidate === active) continue;

      const rect = candidate.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const dx = x - fromX;
      const dy = y - fromY;

      let primary;
      let cross;

      if (direction === 'ArrowRight') {
        if (dx <= 8) continue;
        primary = dx;
        cross = Math.abs(dy);
      } else if (direction === 'ArrowLeft') {
        if (dx >= -8) continue;
        primary = -dx;
        cross = Math.abs(dy);
      } else if (direction === 'ArrowDown') {
        if (dy <= 8) continue;
        primary = dy;
        cross = Math.abs(dx);
      } else {
        if (dy >= -8) continue;
        primary = -dy;
        cross = Math.abs(dx);
      }

      const score = primary + (cross * 3.25);
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    return best;
  }

  function focusTvDetailControl(control) {
    if (!(control instanceof HTMLElement)) return false;

    control.focus({ preventScroll: true });
    control.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: 'smooth'
    });
    return true;
  }

  function getTvDetailRailControls() {
    const root = detailModalRef.current;
    if (!root) return [];

    return Array.from(
      root.querySelectorAll('.detailArtRail button:not([disabled])')
    ).filter(isTvDetailFocusable);
  }

  function focusTvDetailHeader() {
    const root = detailModalRef.current;
    if (!root) return false;

    const target = root.querySelector(
      '.detailNavigationButton:not([disabled]), .close:not([disabled])'
    );
    if (!(target instanceof HTMLElement)) return false;

    target.focus({ preventScroll: true });
    root.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    return true;
  }

  function moveInsideTvDetailRail(active, direction) {
    if (!(active instanceof HTMLElement)) return false;
    if (direction !== 'ArrowUp' && direction !== 'ArrowDown') return false;
    if (!active.closest('.detailArtRail')) return false;

    const controls = getTvDetailRailControls();
    const index = controls.indexOf(active);
    if (index < 0) return false;

    const offset = direction === 'ArrowDown' ? 1 : -1;
    const next = controls[index + offset];

    // Up from the first poster-side action returns to the modal header instead
    // of becoming a dead end. This also scrolls long TV detail cards back to
    // their title and previous/next controls.
    if (direction === 'ArrowUp' && index === 0) {
      return focusTvDetailHeader();
    }

    // Keep vertical D-pad movement inside the poster-side action stack.
    // At an edge, consume the key rather than letting spatial navigation
    // jump across the modal to an unrelated right-column control.
    if (!(next instanceof HTMLElement)) {
      return true;
    }

    return focusTvDetailControl(next);
  }

  function handleTvDetailKeyDown(event) {
    if (!document.body?.classList.contains('tvInputMode')) return;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;

    const root = detailModalRef.current;
    if (!root) return;

    const active = event.target;
    const scoreSlider = root.querySelector('[data-tv-detail-score]');
    const statusSelect = root.querySelector('[data-tv-detail-status]');
    const rewatchDecrease = root.querySelector('[data-tv-detail-rewatch="decrease"]');

    if (active === scoreSlider && event.key === 'ArrowDown' && focusTvDetailControl(statusSelect)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (active === statusSelect && event.key === 'ArrowUp' && focusTvDetailControl(scoreSlider)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (active === statusSelect && event.key === 'ArrowDown' && focusTvDetailControl(rewatchDecrease)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (
      active instanceof HTMLElement
      && active.matches('[data-tv-detail-rewatch]')
      && event.key === 'ArrowUp'
      && focusTvDetailControl(statusSelect)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const isTextField = active instanceof HTMLElement && (
      active.isContentEditable ||
      active.tagName === 'TEXTAREA' ||
      active.tagName === 'SELECT' ||
      (active.tagName === 'INPUT' && active.getAttribute('type') !== 'range')
    );

    // Let text/select controls use their native keys while they are being edited.
    if (isTextField) return;

    // Left/Right should change the rating while the score slider is focused.
    if (
      active instanceof HTMLInputElement &&
      active.type === 'range' &&
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
      return;
    }

    if (!(active instanceof HTMLElement) || !root.contains(active)) {
      const preferred = root.querySelector(
        '.catalogLibraryAction:not([disabled]), ' +
        '.detailLibraryReview button:not([disabled]), ' +
        '.favoriteToggle:not([disabled]), ' +
        '.detailNavigationButton:not([disabled]), ' +
        '.close:not([disabled])'
      ) || getTvDetailControls()[0];

      if (preferred && focusTvDetailControl(preferred)) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    if (
      active instanceof HTMLElement
      && active.classList.contains('tvDetailSynopsis')
      && (event.key === 'ArrowDown' || event.key === 'ArrowUp')
    ) {
      const modal = detailModalRef.current;
      const amount = Math.max(120, Math.round(window.innerHeight * 0.24));

      modal?.scrollBy({
        top: event.key === 'ArrowDown' ? amount : -amount,
        left: 0,
        behavior: event.repeat ? 'auto' : 'smooth'
      });

      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Poster-side actions are a simple vertical stack on TV. Do not let the
    // generic geometry engine jump from Favorite/Follow/Repair to controls
    // across the right side of the modal.
    if (
      (event.key === 'ArrowUp' || event.key === 'ArrowDown')
      && moveInsideTvDetailRail(active, event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const candidate = findTvDetailCandidate(active, event.key);

    // Do not let an edge-of-modal arrow bubble out and switch library titles.
    event.preventDefault();
    event.stopPropagation();

    if (candidate) focusTvDetailControl(candidate);
  }

  useEffect(() => {
    if (!document.body?.classList.contains('tvInputMode')) return undefined;

    const timer = window.setTimeout(() => {
      const root = detailModalRef.current;
      if (!root) return;

      const pendingDirection = tvPendingNavigationFocusRef.current;
      tvPendingNavigationFocusRef.current = null;

      if (pendingDirection) {
        const navButton = root.querySelector(
          `[data-tv-detail-nav="${pendingDirection}"]:not([disabled])`
        );

        if (navButton instanceof HTMLElement) {
          navButton.focus({ preventScroll: true });
          navButton.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          return;
        }
      }

      const preferred = root.querySelector(
        '.catalogLibraryAction:not([disabled]), ' +
        '.detailLibraryReview button:not([disabled]), ' +
        '.favoriteToggle:not([disabled]), ' +
        '.detailNavigationButton:not([disabled]), ' +
        '.close:not([disabled])'
      );

      if (preferred instanceof HTMLElement) {
        preferred.focus({ preventScroll: true });
        preferred.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [anime.id, anime.libraryNeedsReview]);

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

      // Desktop keeps the convenient Left/Right title shortcuts. On Android TV,
      // the D-pad belongs to modal focus navigation; previous/next are activated
      // by focusing the top arrow buttons and pressing OK/Enter.
      if (document.body?.classList.contains('tvInputMode')) return;

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

  async function addCatalogToLibrary(status = 'Plan to Watch') {
    if (!updateAnime || !isCatalogTitle || catalogActionBusy) return;

    setCatalogActionBusy(status);
    try {
      const existing = (library || []).find((item) => sameAnimeIdentity(item, anime));
      if (existing) {
        if (status === 'Completed' && String(existing.status || '').toLowerCase() !== 'completed') {
          await updateAnime({ ...existing, status: 'Completed', listUpdatedAt: new Date().toISOString() });
        }
        return;
      }

      await updateAnime(buildQuickAddEntry(anime, {
        source: 'Home Details',
        librarySize: library.length,
        status
      }));
    } catch (error) {
      console.warn(`Could not add ${anime.title} from Details:`, error);
    } finally {
      setCatalogActionBusy('');
    }
  }

  function updateRewatches(delta) {
    const next = Math.max(0, Number(anime.rewatches || 0) + delta);
    updateField('rewatches', next);
  }

  function normalizedScore(value) {
    return Math.max(0, Math.min(10, Math.round(Number(value || 0) * 10) / 10));
  }

  async function persistScoreDraft(nextScore) {
    if (!updateAnime || isCatalogTitle) {
      scoreEditingRef.current = false;
      return;
    }

    const targetAnimeId = scoreAnimeIdRef.current;

    if (scoreSaveInFlightRef.current) {
      scoreQueuedValueRef.current = nextScore;
      return;
    }

    if (nextScore === scorePersistedRef.current) {
      scoreEditingRef.current = false;
      setScoreSaving(false);
      return;
    }

    scoreSaveInFlightRef.current = true;
    setScoreSaving(true);
    let saved = false;

    try {
      await updateField('joeScore', nextScore);
      saved = true;
      if (scoreAnimeIdRef.current === targetAnimeId) {
        scorePersistedRef.current = nextScore;
      }
    } catch (error) {
      console.warn(`Could not save score for ${anime.title}:`, error);
    } finally {
      if (scoreAnimeIdRef.current !== targetAnimeId) return;

      scoreSaveInFlightRef.current = false;
      const queuedScore = scoreQueuedValueRef.current;
      scoreQueuedValueRef.current = null;
      const latestScore = normalizedScore(scoreDraftRef.current);

      if (!saved) {
        scoreEditingRef.current = false;
        scoreDraftRef.current = scorePersistedRef.current;
        setScoreDraft(scorePersistedRef.current);
        setScoreSaving(false);
        return;
      }

      // If more D-pad input arrived during the save, persist only the newest
      // value next. Saves stay ordered and an older completion can never win.
      if (
        (queuedScore !== null && normalizedScore(queuedScore) !== scorePersistedRef.current)
        || latestScore !== scorePersistedRef.current
      ) {
        void persistScoreDraft(latestScore);
        return;
      }

      scoreEditingRef.current = false;
      setScoreSaving(false);
    }
  }

  function commitScore() {
    if (scoreSaveTimerRef.current) window.clearTimeout(scoreSaveTimerRef.current);
    scoreSaveTimerRef.current = null;

    const nextScore = normalizedScore(scoreDraftRef.current);
    scoreDraftRef.current = nextScore;
    setScoreDraft(nextScore);
    void persistScoreDraft(nextScore);
  }

  function scheduleScoreCommit() {
    if (scoreSaveTimerRef.current) window.clearTimeout(scoreSaveTimerRef.current);
    scoreSaveTimerRef.current = window.setTimeout(() => {
      scoreSaveTimerRef.current = null;
      commitScore();
    }, 350);
  }

  function changeScoreDraft(event) {
    const nextScore = normalizedScore(event.target.value);
    scoreEditingRef.current = true;
    scoreDraftRef.current = nextScore;
    setScoreDraft(nextScore);
    scheduleScoreCommit();
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

    if (anime.identityNeedsReview) {
      setMetadataMessage('This title has an ambiguous Kitsu identity. Choose the correct match from Settings → Needs Review.');
      setMetadataMessageType('warning');
      setMetadataProgressText('');
      return;
    }

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
      <section
        ref={detailModalRef}
        className="detailModal upgradedModal"
        data-tv-detail-modal="true"
        onKeyDownCapture={handleTvDetailKeyDown}
      >
        <button className="close" onClick={onClose}>×</button>
        <aside className="detailArtRail">
          <Poster anime={anime} className="detailPoster" />
          {isCatalogTitle && (
            <>
              <button
                className="repairMetadataButton catalogLibraryAction"
                type="button"
                onClick={() => addCatalogToLibrary('Plan to Watch')}
                disabled={!updateAnime || Boolean(catalogActionBusy)}
              >
                {catalogActionBusy === 'Plan to Watch' ? 'Adding…' : 'Add to Library'}
              </button>
              <button
                className="repairMetadataButton catalogLibraryAction"
                type="button"
                onClick={() => addCatalogToLibrary('Completed')}
                disabled={!updateAnime || Boolean(catalogActionBusy)}
              >
                {catalogActionBusy === 'Completed' ? 'Saving…' : 'Already Watched'}
              </button>
            </>
          )}
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
            className={`repairMetadataButton ${needsMetadataReview ? 'needsMetadataRepair' : ''}`}
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
              data-tv-detail-nav="previous"
              onClick={() => handleDetailNavigation('previous')}
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
              data-tv-detail-nav="next"
              onClick={() => handleDetailNavigation('next')}
              disabled={!canGoNext}
              aria-label="Next anime"
              title="Next anime (Right arrow)"
            >
              ›
            </button>
          </div>
          <h1>{anime.title}</h1>
          <p className="muted">{displayMetadataLine || 'Metadata pending'}</p>

          {anime.libraryNeedsReview && (
            <section className="detailLibraryReview" role="status">
              <div>
                <strong>Quick Add needs review</strong>
                <p>{anime.libraryReviewReason || 'Review the personal details below, then mark this entry reviewed.'}</p>
              </div>
              <button type="button" onClick={() => updateAnime?.(clearLibraryReview(anime))} disabled={!updateAnime}>
                Mark Reviewed
              </button>
            </section>
          )}

          {!isCatalogTitle && <section className="scoreEditor">
            <div>
              <span className="controlLabel">My Score</span>
              <Stars value={currentScore} />
            </div>
            <strong>{currentScore.toFixed(1)}</strong>
            <input
              data-tv-detail-score="true"
              type="range"
              min="0"
              max="10"
              step="0.1"
              value={currentScore}
              aria-label="My Score"
              aria-valuetext={`${currentScore.toFixed(1)} out of 10`}
              onChange={changeScoreDraft}
              onPointerUp={commitScore}
              onBlur={commitScore}
            />
            {scoreSaving && <small className="scoreSaving" role="status">Saving…</small>}
          </section>}

          <div className="detailStats">
            <div><strong>{currentScore.toFixed(1)}</strong><span>My Score</span></div>
            <div><strong>{displayCommunityScore ?? '—'}</strong><span>Community</span></div>
            <div><strong>{displayEpisodeCount || '—'}</strong><span>Episodes</span></div>
            <div><strong>{anime.rewatches || 0}</strong><span>Rewatches</span></div>
          </div>

          {!isCatalogTitle && <section className="personalPanel glowPanel">
            <label className="statusControl">
              <span className="controlLabel">Watch Status</span>
              <div className={`statusPill ${STATUS_CLASS[currentStatus] || 'unset'}`}>
                {currentStatus || 'Not Set'}
              </div>
              <select
                data-tv-detail-status="true"
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
                <button type="button" data-tv-detail-rewatch="decrease" onClick={() => updateRewatches(-1)} aria-label="Decrease rewatches">−</button>
                <strong>{anime.rewatches || 0}</strong>
                <button type="button" data-tv-detail-rewatch="increase" onClick={() => updateRewatches(1)} aria-label="Increase rewatches">+</button>
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
          <section className="whereToWatch" aria-labelledby="where-to-watch-title">
            <div className="whereToWatchHeader">
              <h2 id="where-to-watch-title">Where to Watch</h2>
              <label className="watchRegionControl">
                <span>Streaming region</span>
                <select value={watchRegion} onChange={changeWatchRegion} aria-label="Streaming region">
                  {WATCHMODE_REGIONS.map((region) => (
                    <option key={region.code} value={region.code}>{region.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {watchState.status === 'loading' && <p role="status">Loading saved streaming links...</p>}

            {watchState.status === 'needs_review' && (
              <div className="watchmodeReview" role="status">
                <p>Confirm the correct title before JoeAnimeDB looks up streaming services.</p>
                <div className="watchmodeCandidates">
                  {(watchState.candidates || []).map((candidate) => (
                    <button type="button" key={candidate.id} onClick={() => chooseWatchmodeCandidate(candidate)}>
                      {candidate.name}
                      <small>{[candidate.year, candidate.type].filter(Boolean).join(' · ') || 'Details unavailable'}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {watchState.status === 'not_found' && (
              <div className="watchmodeMatchMeta">
                <span>No saved Kitsu streaming links were found for this title.</span>
                <button type="button" onClick={() => checkWatchmodeAvailability()}>
                  Check with Watchmode
                </button>
              </div>
            )}
            {watchState.status === 'error' && (
              <div className="watchmodeMatchMeta" role="alert">
                <span>{watchState.error}</span>
                {watchState.source !== 'watchmode' && (
                  <button type="button" onClick={() => checkWatchmodeAvailability()}>
                    Check with Watchmode
                  </button>
                )}
              </div>
            )}

            {watchState.status === 'ready' && (
              <>
                {(watchState.providers || []).length ? (
                  <>
                    {watchProviderGroups.preferred.length ? (
                      <div className="quickWatchBlock">
                        <div className="quickWatchHeading">
                          <span>Quick Watch</span>
                          <small>Your selected streaming apps</small>
                        </div>
                        <div className="quickWatchProviders">
                          {watchProviderGroups.preferred.map((provider, index) => (
                            <button
                              type="button"
                              className={index === 0 ? 'quickWatchPrimary' : ''}
                              key={`quick-${provider.name}-${provider.url}`}
                              onClick={() => openExternalUrl(provider.url)}
                            >
                              Watch on {provider.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : streamingApps.length ? (
                      <p className="watchPreferenceHint">
                        None of your selected streaming apps are listed for this title. Showing other options.
                      </p>
                    ) : (
                      <p className="watchPreferenceHint">
                        Choose your streaming apps in Settings to enable personalized Quick Watch.
                      </p>
                    )}

                    {watchProviderGroups.other.length ? (
                      <div className="otherWatchOptions">
                        {watchProviderGroups.preferred.length ? <small>Other streaming options</small> : null}
                        <div className="whereToWatchProviders">
                          {watchProviderGroups.other.map((provider) => (
                            <button
                              type="button"
                              key={`${provider.name}-${provider.url}`}
                              onClick={() => openExternalUrl(provider.url)}
                            >
                              Watch on {provider.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p>No subscription streaming options were found in this region.</p>
                )}
                <p className="watchmodeMatchMeta">
                  {watchState.source === 'watchmode' ? (
                    <>
                      <span>Region-checked by Watchmode · Matched to {watchState.match?.name || anime.title}</span>
                      <button type="button" onClick={changeWatchmodeMatch}>Change match</button>
                    </>
                  ) : (
                    <>
                      <span>Streaming links by Kitsu · Availability may vary by region</span>
                      <button type="button" onClick={() => checkWatchmodeAvailability()}>
                        Verify {WATCHMODE_REGIONS.find((region) => region.code === watchRegion)?.label || watchRegion}
                      </button>
                    </>
                  )}
                </p>
              </>
            )}
          </section>
          <section
            className="synopsisBlock tvDetailSynopsis"
            tabIndex={0}
            aria-label={`Synopsis for ${anime.title}`}
          >
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
