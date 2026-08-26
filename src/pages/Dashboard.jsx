import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, Dices, Heart, Layers3, Moon, Shuffle, Zap } from 'lucide-react';
import '../styles/joeai-home-v3.css';
import '../styles/joeai-home-v3-guide.css';
import { Poster } from '../components/Poster';
import { getRecommendationContext } from '../services/recommendationRuntime';
import { useDeferredDailyRecommendation } from '../hooks/useDeferredDailyRecommendation';
import { useHomeDecisionData } from '../hooks/useHomeDecisionData';
import { sameAnimeIdentity } from '../services/titleIdentity';
import { openExternalUrl } from '../platform/runtime';
import { buildQuickAddEntry } from '../services/quickAdd';
import {
  buildQuickPickPool,
  persistQuickPickPools,
  primeQuickPickPoolCache,
  QUICK_PICK_INTENTS,
  quickPickItemKey,
  readPersistedQuickPickPools,
  selectQuickPickFromPool
} from '../services/homeQuickPick';
import {
  deferUntilAfterFirstPaint,
  measureStartupTask,
  recordStartupTiming
} from '../services/startupPerformance';

const EMPTY_ANIME_LIST = Object.freeze([]);
const EMPTY_JOEAI_STATE = Object.freeze({});
const QUICK_PICK_ICONS = Object.freeze({
  quick: Zap,
  movie: Clapperboard,
  binge: Layers3,
  dark: Moon,
  comfort: Heart,
  different: Shuffle,
  surprise: Dices
});

function recordQuickPickPerformance(entry = {}) {
  const rows = Array.isArray(globalThis.__JOEANIME_QUICK_PICK_TIMINGS__)
    ? globalThis.__JOEANIME_QUICK_PICK_TIMINGS__
    : [];
  globalThis.__JOEANIME_QUICK_PICK_TIMINGS__ = [{
    measuredAt: new Date().toISOString(),
    ...entry
  }, ...rows].slice(0, 100);
}

function localDaySeed(date = new Date()) {
  return Number(`${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`);
}

function normalizeStatus(status = '') {
  return String(status || '').toLowerCase().replace(/[\s_-]+/g, '');
}

function titleOf(item = {}) {
  return item.officialTitle || item.title || 'Unknown title';
}

function progressOf(item = {}) {
  const value = Number(item.watchedEpisodes ?? item.episodesWatched ?? item.episodeProgress ?? item.progress ?? item.watchedEpisodeCount ?? item.currentEpisode ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function totalEpisodesOf(item = {}) {
  const value = Number(item.episodeCount ?? item.episodes ?? item.totalEpisodes ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function Panel({ className = '', title, eyebrow, subtitle, action, onAction, headerActions = [], pending = false, children }) {
  return (
    <section className={`homeDecisionPanel ${className}`}>
      <header className="homeDecisionPanelHeader">
        <div>
          {eyebrow && <small>{eyebrow}</small>}
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {pending && <span className="homeDecisionPending">Updating</span>}
        {(headerActions.length > 0 || action) && (
          <div className="homeDecisionPanelActions">
            {headerActions.map((headerAction) => (
              <button
                type="button"
                className={headerAction.className || ''}
                key={headerAction.ariaLabel || headerAction.label}
                data-tv-skip-focus="true"
                aria-label={headerAction.ariaLabel}
                title={headerAction.ariaLabel}
                onClick={headerAction.onClick}
              >
                {headerAction.label}
              </button>
            ))}
            {action && <button type="button" data-tv-skip-focus="true" onClick={onAction}>{action}</button>}
          </div>
        )}
      </header>
      {children}
    </section>
  );
}

function ActionStat({ value, label }) {
  if (!value) return null;
  return <div className="homeV3StatPill"><strong>{value}</strong><small>{label}</small></div>;
}

function DecisionCard({ anime, badge, detail, reason, reasonLabel, actions = [], onOpen, onPosterLoad, provider, busy = false, className = '', showOpenAction = true }) {
  if (!anime) return null;

  function activate(event) {
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    const nestedControl = event.target?.closest?.('button, a, input, select, textarea, [role="button"]');
    if (nestedControl && nestedControl !== event.currentTarget) return;
    event.preventDefault();
    onOpen?.();
  }

  return (
    <article
      className={`homeDecisionCard ${className}`.trim()}
      data-tv-card="true"
      role="button"
      tabIndex="0"
      onClick={activate}
      onKeyDown={activate}
      aria-label={`Open ${titleOf(anime)}`}
    >
      <div className="homeDecisionPoster" aria-hidden="true">
        <Poster anime={anime} mode="thumb" onLoad={onPosterLoad} />
        {badge && <span>{badge}</span>}
      </div>
      <div className="homeDecisionCardCopy">
        <h3>{titleOf(anime)}</h3>
        {detail && <small>{detail}</small>}
        {reason && reasonLabel && <b className="homeDecisionReasonLabel">{reasonLabel}</b>}
        {reason && <p>{reason}</p>}
        {provider && <b className="homeDecisionProvider">On {provider}</b>}
      </div>
      {(showOpenAction || actions.length > 0) && (
        <div className="homeDecisionCardActions">
          {showOpenAction && <button type="button" className="primary" data-tv-home-action="true" onClick={onOpen}>Open details</button>}
          {actions.map((action) => (
            <button
              type="button"
              key={action.label}
              data-tv-home-action="true"
              disabled={busy || action.disabled}
              onClick={action.onClick}
            >
              {busy && action.busyLabel ? action.busyLabel : action.label}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function EmptyAction({ title, body, action, onAction }) {
  return (
    <div className="homeDecisionEmpty">
      <strong>{title}</strong><p>{body}</p>
      {action && <button type="button" onClick={onAction}>{action}</button>}
    </div>
  );
}

export function StatStrip({ stats, anime }) {
  const watching = anime.filter((item) => normalizeStatus(item.status) === 'watching').length;
  const completed = anime.filter((item) => normalizeStatus(item.status) === 'completed').length;
  return (
    <section className="homeV3StatsInline">
      <ActionStat value={stats?.total ?? anime.length} label="Anime" />
      <ActionStat value={watching} label="Watching" />
      <ActionStat value={completed} label="Completed" />
    </section>
  );
}

export function Dashboard({
  anime = EMPTY_ANIME_LIST,
  catalog: rawCatalog = EMPTY_ANIME_LIST,
  stats = {},
  setSelected,
  setView,
  onQuickAsk,
  updateAnime,
  updateCatalogAnime,
  joeAIState = EMPTY_JOEAI_STATE,
  contentSafetyMode = 'unrestricted',
  displayName = 'Anime Fan'
}) {
  const [recommendationContext, setRecommendationContext] = useState(null);
  useEffect(() => deferUntilAfterFirstPaint(() => {
    setRecommendationContext(measureStartupTask(
      'quickPickContextGeneration',
      () => getRecommendationContext(anime, rawCatalog, contentSafetyMode, joeAIState),
      { libraryTitleCount: anime.length, catalogTitleCount: rawCatalog.length }
    ));
  }), [anime, rawCatalog, contentSafetyMode, joeAIState]);

  useEffect(() => {
    const startedAt = Number(globalThis.__JOEANIME_STARTUP_STARTED_AT__ || 0);
    const now = globalThis.performance?.now?.() ?? Date.now();
    if (startedAt) {
      recordStartupTiming('homeMount', now - startedAt);
      recordStartupTiming('homeInteractivePaint', now - startedAt);
    }
  }, []);
  const { recommendation: dailyRecommendation, isPending: dailyPending } = useDeferredDailyRecommendation(
    recommendationContext,
    localDaySeed(),
    joeAIState
  );
  const dailyPick = dailyRecommendation?.item || null;
  const [quickPickPreparationComplete, setQuickPickPreparationComplete] = useState(false);
  const {
    watchingTitles,
    returning,
    missedSequels,
    returningPending,
    onServices,
    servicesPending,
    hasStreamingApps
  } = useHomeDecisionData({
    library: anime,
    catalog: rawCatalog,
    dailyPick,
    updateAnime,
    enableSecondaryRefresh: quickPickPreparationComplete
  });
  const [activeIntent, setActiveIntent] = useState('');
  const [quickPickNonces, setQuickPickNonces] = useState({});
  const [quickPickPoolsVersion, setQuickPickPoolsVersion] = useState(0);
  const [intentRecommendation, setIntentRecommendation] = useState(null);
  const [preparingIntent, setPreparingIntent] = useState('');
  const quickPickPoolsRef = useRef({});
  const quickPickSelectionsRef = useRef({});
  const quickPickHistoryRef = useRef({});
  const quickPickInteractionRef = useRef(null);
  const quickPickWorkerRef = useRef(null);
  const quickPickWorkerRequestRef = useRef('');
  const [libraryActionKey, setLibraryActionKey] = useState('');
  const continueWatchingRailRef = useRef(null);
  const watching = watchingTitles;

  function scrollContinueWatching(direction) {
    const rail = continueWatchingRailRef.current;
    if (!rail) return;
    const distance = Math.max(320, Math.round(rail.clientWidth * 0.88));
    rail.scrollBy({ left: direction * distance, behavior: 'smooth' });
  }

  useEffect(() => {
    if (!recommendationContext?.brain) return undefined;

    let cancelled = false;
    let worker = null;
    let fallbackTimer = null;
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const precomputeStartedAt = globalThis.performance?.now?.() ?? Date.now();
    const cacheReadStartedAt = globalThis.performance?.now?.() ?? Date.now();
    const persisted = readPersistedQuickPickPools(recommendationContext, joeAIState);
    const cachedIntentIds = QUICK_PICK_INTENTS
      .map((intent) => intent.id)
      .filter((intentId) => Array.isArray(persisted.pools[intentId]));
    let firstPoolReadyRecorded = cachedIntentIds.length > 0;
    const cacheReadMs = (globalThis.performance?.now?.() ?? Date.now()) - cacheReadStartedAt;

    quickPickSelectionsRef.current = {};
    quickPickHistoryRef.current = {};
    quickPickPoolsRef.current = persisted.pools;
    setActiveIntent('');
    setPreparingIntent('');
    setIntentRecommendation(null);
    setQuickPickNonces({});
    setQuickPickPoolsVersion((value) => value + 1);
    primeQuickPickPoolCache(recommendationContext, persisted.pools, joeAIState);
    recordQuickPickPerformance({
      phase: 'persisted-cache-read',
      cacheHit: cachedIntentIds.length > 0,
      cachedIntentCount: cachedIntentIds.length,
      stale: persisted.stale,
      cacheReadMs,
      cacheAgeMs: persisted.createdAt ? Date.now() - persisted.createdAt : null
    });
    recordStartupTiming('quickPickPersistedCacheRead', cacheReadMs, {
      cachedIntentCount: cachedIntentIds.length,
      stale: persisted.stale
    });
    if (firstPoolReadyRecorded) {
      const startupStartedAt = Number(globalThis.__JOEANIME_STARTUP_STARTED_AT__ || 0);
      recordStartupTiming('quickPickActionDataReady', startupStartedAt
        ? (globalThis.performance?.now?.() ?? Date.now()) - startupStartedAt
        : cacheReadMs, { source: 'persisted-cache' });
    }

    const intentIds = QUICK_PICK_INTENTS
      .map((intent) => intent.id)
      .filter((intentId) => persisted.stale || !cachedIntentIds.includes(intentId));

    if (!intentIds.length) {
      setQuickPickPreparationComplete(true);
      return undefined;
    }
    setQuickPickPreparationComplete(false);

    const acceptPool = (intentId, pool, timing) => {
      if (cancelled) return;
      quickPickPoolsRef.current = { ...quickPickPoolsRef.current, [intentId]: pool || [] };
      primeQuickPickPoolCache(recommendationContext, quickPickPoolsRef.current, joeAIState);
      setQuickPickPoolsVersion((value) => value + 1);
      recordQuickPickPerformance({ phase: 'pool-ready', ...timing });
      if (!firstPoolReadyRecorded) {
        firstPoolReadyRecorded = true;
        const startupStartedAt = Number(globalThis.__JOEANIME_STARTUP_STARTED_AT__ || 0);
        recordStartupTiming('quickPickActionDataReady', startupStartedAt
          ? (globalThis.performance?.now?.() ?? Date.now()) - startupStartedAt
          : (globalThis.performance?.now?.() ?? Date.now()) - precomputeStartedAt,
          { source: 'worker', intent: intentId });
      }
      globalThis.setTimeout(() => {
        if (!cancelled) persistQuickPickPools(recommendationContext, quickPickPoolsRef.current, joeAIState);
      }, 0);
    };

    const finishPreparation = (phase, timings = []) => {
      if (cancelled) return;
      persistQuickPickPools(recommendationContext, quickPickPoolsRef.current, joeAIState);
      setQuickPickPreparationComplete(true);
      recordQuickPickPerformance({
        phase,
        totalMs: (globalThis.performance?.now?.() ?? Date.now()) - precomputeStartedAt,
        workerTimings: timings
      });
    };

    const prepareFallback = () => {
      const queue = [...intentIds];
      const timings = [];
      const next = () => {
        if (cancelled) return;
        const intentId = queue.shift();
        if (!intentId) {
          finishPreparation('staged-main-thread-fallback', timings);
          return;
        }
        let timing = null;
        const pool = buildQuickPickPool(recommendationContext, intentId, {
          joeAIState,
          onTiming: (value) => { timing = value; timings.push(value); }
        });
        acceptPool(intentId, pool, timing);
        fallbackTimer = globalThis.setTimeout(next, 0);
      };
      fallbackTimer = globalThis.setTimeout(next, 0);
    };

    const preparePools = () => {
      if (cancelled) return;
      try {
        worker = new Worker(new URL('../workers/quickPickPoolWorker.js', import.meta.url), { type: 'module' });
        worker.onmessage = (event) => {
          if (cancelled || event.data?.requestId !== requestId) return;
          if (event.data?.error) {
            console.warn('Quick Pick background preparation failed:', event.data.error);
            worker?.terminate();
            worker = null;
            quickPickWorkerRef.current = null;
            prepareFallback();
            return;
          }
          if (event.data?.type === 'pool-ready') {
            acceptPool(event.data.intentId, event.data.pool, event.data.timing);
            return;
          }
          if (event.data?.type !== 'complete') return;
          finishPreparation('background-precompute', event.data.timings || []);
          worker?.terminate();
          worker = null;
          quickPickWorkerRef.current = null;
        };
        worker.onerror = (error) => {
          console.warn('Quick Pick worker could not start; using staged local preparation.', error);
          if (cancelled) return;
          worker?.terminate();
          worker = null;
          quickPickWorkerRef.current = null;
          prepareFallback();
        };
        quickPickWorkerRef.current = worker;
        quickPickWorkerRequestRef.current = requestId;
        worker.postMessage({
          requestId,
          library: recommendationContext.library || [],
          catalog: recommendationContext.catalog || [],
          joeAIState,
          intentIds
        });
      } catch (error) {
        console.warn('Quick Pick worker is unavailable; using staged local preparation.', error);
        prepareFallback();
      }
    };

    const cancelSchedule = deferUntilAfterFirstPaint(preparePools, { timeout: 1400 });
    return () => {
      cancelled = true;
      cancelSchedule();
      worker?.terminate();
      if (fallbackTimer != null) globalThis.clearTimeout(fallbackTimer);
      if (quickPickWorkerRequestRef.current === requestId) {
        quickPickWorkerRef.current = null;
        quickPickWorkerRequestRef.current = '';
      }
    };
  }, [recommendationContext, joeAIState]);

  useEffect(() => {
    if (!activeIntent) return;
    const pool = quickPickPoolsRef.current[activeIntent];
    if (!Array.isArray(pool)) return;
    const selectionStartedAt = globalThis.performance?.now?.() ?? Date.now();
    const otherIntentKeys = Object.entries(quickPickSelectionsRef.current)
      .filter(([intentId]) => intentId !== activeIntent)
      .map(([, itemKey]) => itemKey);
    const selected = selectQuickPickFromPool(pool, activeIntent, {
      daySeed: localDaySeed(),
      selectionNonce: quickPickNonces[activeIntent] || 0,
      joeAIState,
      excludeKeys: [...(quickPickHistoryRef.current[activeIntent] || []), ...otherIntentKeys],
      currentKey: quickPickSelectionsRef.current[activeIntent]
    });
    setIntentRecommendation(selected);
    setPreparingIntent((current) => current === activeIntent ? '' : current);
    if (quickPickInteractionRef.current?.intent === activeIntent) {
      quickPickInteractionRef.current.dataReadyAt = globalThis.performance?.now?.() ?? Date.now();
      quickPickInteractionRef.current.selectionMs =
        (globalThis.performance?.now?.() ?? Date.now()) - selectionStartedAt;
    }
  }, [activeIntent, joeAIState, quickPickNonces, quickPickPoolsVersion]);

  const quickPickRecommendation = activeIntent
    ? (intentRecommendation || dailyRecommendation)
    : dailyRecommendation;
  const quickPick = quickPickRecommendation?.item || null;

  useEffect(() => {
    if (!activeIntent || !intentRecommendation?.item || intentRecommendation.intent?.id !== activeIntent) return;
    const itemKey = quickPickItemKey(intentRecommendation.item);
    if (!itemKey) return;
    quickPickSelectionsRef.current[activeIntent] = itemKey;
    const intentHistory = intentRecommendation?.resetCycle
      ? []
      : (quickPickHistoryRef.current[activeIntent] || []);
    if (!intentHistory.includes(itemKey)) {
      quickPickHistoryRef.current[activeIntent] = [...intentHistory, itemKey];
    }
  }, [activeIntent, intentRecommendation]);

  useEffect(() => {
    const interaction = quickPickInteractionRef.current;
    if (!interaction || intentRecommendation?.intent?.id !== interaction.intent) return;
    const itemKey = quickPickItemKey(intentRecommendation.item);
    const dataReadyAt = interaction.dataReadyAt || (globalThis.performance?.now?.() ?? Date.now());
    const frameId = requestAnimationFrame(() => {
      const committedAt = globalThis.performance?.now?.() ?? Date.now();
      recordQuickPickPerformance({
        phase: 'intent-interaction',
        intent: interaction.intent,
        cacheHit: interaction.cacheHit,
        handlerMs: interaction.handlerMs,
        selectionMs: interaction.selectionMs || intentRecommendation.selectionMs || 0,
        reactCommitMs: committedAt - dataReadyAt,
        totalToPaintMs: committedAt - interaction.startedAt,
        itemKey
      });
      quickPickInteractionRef.current = { ...interaction, itemKey, committedAt };
    });
    return () => cancelAnimationFrame(frameId);
  }, [intentRecommendation]);

  function sendQuickAsk(prompt) {
    const cleanPrompt = String(prompt || '').trim();
    if (!cleanPrompt) return;
    try { localStorage.setItem('joeanime-pending-joeai-prompt', cleanPrompt); } catch (error) {
      console.warn('Could not store JoeAI Quick Ask prompt:', error);
    }
    onQuickAsk?.(cleanPrompt);
    setView?.('assistant');
  }

  function chooseQuickPickIntent(intent) {
    const startedAt = globalThis.performance?.now?.() ?? Date.now();
    const cacheHit = Array.isArray(quickPickPoolsRef.current[intent.id]);
    setQuickPickNonces((current) => ({
      ...current,
      [intent.id]: (current[intent.id] || 0) + 1
    }));
    setActiveIntent(intent.id);
    setPreparingIntent(cacheHit ? '' : intent.id);
    if (!cacheHit && quickPickWorkerRef.current) {
      quickPickWorkerRef.current.postMessage({
        type: 'prioritize',
        requestId: quickPickWorkerRequestRef.current,
        intentId: intent.id
      });
    }
    quickPickInteractionRef.current = {
      intent: intent.id,
      startedAt,
      cacheHit,
      handlerMs: (globalThis.performance?.now?.() ?? Date.now()) - startedAt
    };
  }

  function recordQuickPickPosterLoad() {
    const interaction = quickPickInteractionRef.current;
    if (!interaction?.committedAt || interaction.posterRecorded) return;
    recordQuickPickPerformance({
      phase: 'poster-load',
      intent: interaction.intent,
      itemKey: interaction.itemKey,
      imageLoadAfterPaintMs: (globalThis.performance?.now?.() ?? Date.now()) - interaction.committedAt
    });
    quickPickInteractionRef.current = { ...interaction, posterRecorded: true };
  }

  async function toggleFollow(item) {
    if (!updateCatalogAnime) return;
    const existing = rawCatalog.find((candidate) => sameAnimeIdentity(candidate, item));
    const persisted = existing || item;
    const followed = !Boolean(persisted.followed);
    await updateCatalogAnime({
      ...item,
      ...persisted,
      id: persisted.id || item.id,
      kitsuId: persisted.kitsuId || item.kitsuId,
      followed,
      ignored: false,
      followedAt: followed ? (persisted.followedAt || new Date().toISOString()) : '',
      listUpdatedAt: new Date().toISOString()
    });
  }

  async function addToLibrary(item, status = 'Plan to Watch') {
    if (!updateAnime || !item) return;

    const actionKey = `${item.kitsuId || item.id || titleOf(item)}:${status}`;
    setLibraryActionKey(actionKey);

    try {
      const existing = anime.find((libraryItem) => sameAnimeIdentity(libraryItem, item));
      if (existing) {
        if (status === 'Completed' && normalizeStatus(existing.status) !== 'completed') {
          await updateAnime({ ...existing, status: 'Completed', listUpdatedAt: new Date().toISOString() });
        }
        return;
      }

      await updateAnime(buildQuickAddEntry(item, {
        source: 'Home Decision',
        librarySize: anime.length,
        status
      }));
    } catch (error) {
      console.warn(`Could not add ${titleOf(item)} from Home:`, error);
    } finally {
      setLibraryActionKey('');
    }
  }

  function libraryActions(item, extraActions = []) {
    const key = String(item.kitsuId || item.id || titleOf(item));
    return [
      { label: 'Add', busyLabel: 'Adding', onClick: () => addToLibrary(item) },
      { label: 'Watched', busyLabel: 'Saving', onClick: () => addToLibrary(item, 'Completed') },
      ...extraActions
    ].map((action) => ({ ...action, itemKey: key }));
  }

  function serviceActions(item, preferredProvider) {
    const key = String(item.kitsuId || item.id || titleOf(item));
    const existing = anime.find((libraryItem) => sameAnimeIdentity(libraryItem, item));
    const actions = [];

    if (!existing) {
      actions.push({ label: 'Add', busyLabel: 'Adding', onClick: () => addToLibrary(item) });
    }
    if (!existing || normalizeStatus(existing.status) !== 'completed') {
      actions.push({ label: 'Watched', busyLabel: 'Saving', onClick: () => addToLibrary(item, 'Completed') });
    }
    actions.push({ label: 'Watch', onClick: () => openExternalUrl(preferredProvider?.url) });

    return actions.map((action) => ({ ...action, itemKey: key }));
  }

  const firstService = onServices[0] || null;
  const hero = measureStartupTask('homeHeroDecision', () => returning[0]
    ? {
        eyebrow: 'Returning for you', title: titleOf(returning[0]), body: returning[0].returningReason, item: returning[0],
        primary: returning[0].followed ? 'Following' : 'Follow', onPrimary: () => toggleFollow(returning[0]),
        secondary: 'Open details', onSecondary: () => setSelected?.(returning[0])
      }
    : watching[0]
      ? {
          eyebrow: 'Continue watching', title: titleOf(watching[0]),
          body: progressOf(watching[0]) ? `You are ${progressOf(watching[0])}${totalEpisodesOf(watching[0]) ? ` of ${totalEpisodesOf(watching[0])}` : ''} episodes in.` : 'Pick up the title already at the front of your queue.',
          item: watching[0], primary: 'Continue', onPrimary: () => setSelected?.(watching[0]),
          secondary: 'Something else', onSecondary: () => sendQuickAsk('recommend something different from what I am currently watching')
        }
      : dailyPick
        ? {
            eyebrow: 'JoeAI quick pick', title: titleOf(dailyPick),
            body: dailyRecommendation?.reasons?.[0] || 'A strong unseen match based on the taste signals in your library.',
            item: dailyPick, primary: 'Open pick', onPrimary: () => setSelected?.(dailyPick),
            secondary: 'Why this?', onSecondary: () => sendQuickAsk(`why did you recommend ${titleOf(dailyPick)}?`)
          }
        : firstService
          ? {
              eyebrow: `On ${firstService.preferredProvider?.name || 'your services'}`, title: titleOf(firstService.item),
              body: 'A strong library match you can stream on a service you already use.', item: firstService.item,
              primary: 'Quick watch', onPrimary: () => openExternalUrl(firstService.preferredProvider?.url),
              secondary: 'Open details', onSecondary: () => setSelected?.(firstService.item)
            }
          : {
              eyebrow: anime.length ? 'Ready when you are' : `Welcome, ${displayName}`,
              title: anime.length ? 'Find your next anime.' : 'Build your Anime DNA.',
              body: anime.length ? 'JoeAI will turn your library into a clear next action as new signals become available.' : 'Import a list or add your first titles to unlock personal recommendations.',
              primary: anime.length ? 'Open Discover' : 'Add anime', onPrimary: () => setView?.(anime.length ? 'discover' : 'library'),
              secondary: 'Ask JoeAI', onSecondary: () => setView?.('assistant')
            }, { watchingCount: watching.length, returningCount: returning.length });

  return (
    <section className="homeV3 homeDecisionHome">
      <section className="homeV3Hero homeDecisionHero">
        <div className="homeV3HeroShade" />
        <div className="homeV3HeroCopy">
          <p className="homeV3Eyebrow">{hero.eyebrow}</p>
          <h1>{hero.title}</h1>
          <p className="homeV3HeroBody">{hero.body}</p>
          <div className="homeV3HeroActions">
            <button type="button" className="primary" onClick={hero.onPrimary}>{hero.primary}</button>
            <button type="button" onClick={hero.onSecondary}>{hero.secondary}</button>
          </div>
        </div>
        <div className="homeV3HeroStats">
          <ActionStat value={watching.length} label="Watching" />
          <ActionStat value={returning.length} label="Returning" />
          <ActionStat value={missedSequels.length} label="Missed Sequels" />
          <ActionStat value={onServices.length} label="On Services" />
        </div>
      </section>

      <section className="homeV3Grid homeDecisionGrid">
        {watching.length > 0 && (
          <Panel
            className="homeV3Continue homeDecisionContinue"
            eyebrow="Pick up where you left off"
            title="Continue Watching"
            action="Library"
            onAction={() => setView?.('library')}
            headerActions={watching.length > 1 ? [
              { label: '‹', ariaLabel: 'Scroll Continue Watching left', className: 'homeDecisionScrollButton', onClick: () => scrollContinueWatching(-1) },
              { label: '›', ariaLabel: 'Scroll Continue Watching right', className: 'homeDecisionScrollButton', onClick: () => scrollContinueWatching(1) }
            ] : []}
          >
            <div className="homeDecisionRail homeV3TvContinue" ref={continueWatchingRailRef}>
              {watching.slice(0, 8).map((item) => {
                const progress = progressOf(item);
                const total = totalEpisodesOf(item);
                return <DecisionCard key={item.id || titleOf(item)} anime={item} badge={progress ? `EP ${progress}` : 'WATCHING'} detail={progress ? `${progress}${total ? ` / ${total}` : ''} episodes` : 'Currently watching'} showOpenAction={false} onOpen={() => setSelected?.(item)} />;
              })}
            </div>
          </Panel>
        )}

        {returning.length > 0 && (
          <Panel className="homeDecisionReturning" title="Returning For You" pending={returningPending}>
            <div className={`homeDecisionRail${returning.length === 1 ? ' is-single' : ''}`}>
              {returning.map((item) => <DecisionCard key={item.id || titleOf(item)} anime={item} badge={item.continuationTiming === 'current' ? 'AIRING' : item.continuationTiming === 'upcoming' ? 'UPCOMING' : 'RECENT'} detail={`After ${item.returningFromTitle}`} reason={item.returningReason} actions={libraryActions(item, [{ label: item.followed ? 'Following' : 'Follow', onClick: () => toggleFollow(item) }])} busy={libraryActionKey.startsWith(`${item.kitsuId || item.id || titleOf(item)}:`)} onOpen={() => setSelected?.(item)} />)}
            </div>
          </Panel>
        )}

        {missedSequels.length > 0 && (
          <Panel className="homeDecisionMissed" title="You Missed a Sequel" pending={returningPending}>
            <div className={`homeDecisionRail${missedSequels.length === 1 ? ' is-single' : ''}`}>
              {missedSequels.map((item) => <DecisionCard key={item.id || titleOf(item)} anime={item} badge="MISSED" detail={`After ${item.returningFromTitle}`} reason={item.returningReason} actions={libraryActions(item)} busy={libraryActionKey.startsWith(`${item.kitsuId || item.id || titleOf(item)}:`)} onOpen={() => setSelected?.(item)} />)}
            </div>
          </Panel>
        )}

        {(hasStreamingApps && onServices.length > 0) && (
          <Panel className="homeDecisionServices" eyebrow="Personal matches available now" title="On Your Services" subtitle="Saved streaming links, with regional verification when available." pending={servicesPending} action="View All" onAction={() => setView?.('discover')}>
            <div className={`homeDecisionRail${onServices.length === 1 ? ' is-single' : ''}`}>
              {onServices.map(({ item, preferredProvider }) => <DecisionCard key={item.id || titleOf(item)} anime={item} badge="STREAM" detail={(item.genres || []).slice(0, 2).join(' + ') || 'Personal match'} provider={preferredProvider?.name} actions={serviceActions(item, preferredProvider)} busy={libraryActionKey.startsWith(`${item.kitsuId || item.id || titleOf(item)}:`)} onOpen={() => setSelected?.(item)} />)}
            </div>
          </Panel>
        )}

        <Panel className="homeDecisionQuickPick" eyebrow="JoeAI Quick Pick" title="WHAT ARE WE WATCHING?" subtitle="Pick a mood or let Joe decide." pending={!activeIntent && dailyPending} action="Open JoeAI" onAction={() => setView?.('assistant')}>
          <div className="homeDecisionQuickLayout">
            <div className="homeDecisionIntentGrid">
              {QUICK_PICK_INTENTS.map((intent) => {
                const IntentIcon = QUICK_PICK_ICONS[intent.id] || Zap;
                const isPreparing = preparingIntent === intent.id;
                return (
                  <button type="button" key={intent.id} data-intent={intent.id} data-tv-card="true" aria-pressed={activeIntent === intent.id} aria-busy={isPreparing} onClick={() => chooseQuickPickIntent(intent)}>
                    <span className="homeDecisionIntentIcon" aria-hidden="true"><IntentIcon strokeWidth={2.15} /></span>
                    <span className="homeDecisionIntentCopy">
                      <strong>{intent.label}</strong>
                      <small>{isPreparing ? <><i className="homeDecisionPreparingDot" />Preparing picks...</> : ({ quick: 'Short commitment', movie: 'One sitting', binge: 'Easy to sink into', dark: 'Something heavier', comfort: 'Familiar vibes', different: 'Break my pattern', surprise: 'Joe decides' })[intent.id]}</small>
                    </span>
                  </button>
                );
              })}
            </div>
            {quickPick ? (
              <DecisionCard className="homeDecisionFeaturedPick" anime={quickPick} badge={Number.isFinite(Number(quickPickRecommendation?.confidence)) ? `${Math.round(Number(quickPickRecommendation.confidence))}% MATCH` : 'JOEAI PICK'} detail={quickPickRecommendation?.intent ? `${quickPickRecommendation.intent.label} pick` : 'JoeAI pick of the day'} reasonLabel="Why Joe picked it" reason={quickPickRecommendation?.reasons?.[0]} actions={libraryActions(quickPick, [{ label: 'Why this?', onClick: () => sendQuickAsk(`why did you recommend ${titleOf(quickPick)}?`) }])} busy={libraryActionKey.startsWith(`${quickPick.kitsuId || quickPick.id || titleOf(quickPick)}:`)} onOpen={() => setSelected?.(quickPick)} onPosterLoad={recordQuickPickPosterLoad} />
            ) : activeIntent ? <EmptyAction title="No strong match yet" body="JoeAI could not find an unseen title that honestly fits this intent. Try another pick." /> : !dailyPending ? <EmptyAction title="JoeAI needs a few signals" body="Add or import anime, then rate a few titles to unlock a personal quick pick." action="Add Anime" onAction={() => setView?.('library')} /> : null}
          </div>
        </Panel>
      </section>
    </section>
  );
}
