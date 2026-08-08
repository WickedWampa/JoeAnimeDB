import './styles/rank-badge-v3-premium.css';
import './styles/mmorpg-percent-ranks.css';
import './styles/mmorpg-rank-borders.css';
import './styles/rank-badge-tiers.css';
import './styles/rank-badge-fix.css';
import './styles/not-rated.css';
import './styles/add-anime.css';
import './styles/library-card-fix.css';
import './styles/library-neon-archive.css';
import './styles/library-neon-archive-v4.css';
import './styles/joeai-cards.css';
import './styles/joeai-recommendations.css';
import './styles/progress-overlay.css';
import './styles/joeanime-home-v2.css';
import './styles/analytics-lab.css';
import './styles/library-cleanup.css';
import './styles/library-integrity.css';
import './styles/settings-art.css';
import './styles/update-notification.css';
import './styles/content-safety.css';
import './styles/where-to-watch.css';
import './styles/detail-themed.css';
import './styles/web-data-safety.css';
import React, { useEffect, useMemo, useState } from 'react';

import { Sidebar } from './components/Sidebar';
import { MobileNavigation } from './components/MobileNavigation';
import { SearchBar } from './components/SearchBar';
import { DetailModal } from './components/DetailModal';
import { FirstTimeOnboarding, OnboardingPageTip } from './components/FirstTimeOnboarding';
import { WebDataSafetyNotice } from './components/WebDataSafetyNotice';
import { Dashboard } from './pages/Dashboard';
import { LibraryPage } from './pages/LibraryPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { Discover } from './pages/Discover';
import { FollowingPage } from './pages/FollowingPage';
import { UpcomingAnime } from './pages/UpcomingAnime';
import { AboutHelpPage } from './pages/AboutHelpPage';
import { LibraryCleanup } from './pages/LibraryCleanup';
import { Universe, Assistant, Analytics, BleachShrine, SettingsPage } from './pages/PlaceholderPages';
import { useAnimeLibrary } from './hooks/useAnimeLibrary';
import { sortAnimeByUserScore } from './utils/animeUtils';
import {
  beginOnboarding,
  clearOnboardingState,
  dismissOnboardingTip,
  finishOnboarding,
  markExistingUserOnboardingComplete,
  readOnboardingState,
  updateOnboardingStep
} from './services/onboardingState';
import { installAndroidBackHandler } from './platform/runtime';
import { normalizeContentSafetyMode } from './services/contentSafety';

const UPDATE_THEME_APPEARANCE = {
  neon: { icon: '⚡', label: 'Neon Signal' },
  sakura: { icon: '🌸', label: 'Sakura Bloom' },
  vapor: { icon: '💿', label: 'Vapor Wave' },
  inferno: { icon: '🔥', label: 'Inferno Drive' },
  ramen: { icon: '🍜', label: 'Ramen Mode' },
  amoled: { icon: '◉', label: 'AMOLED Black' }
};

function UpdateProgressOverlay({ syncText, syncProgress, theme = 'neon' }) {
  const percent = Math.max(0, Math.min(100, Math.round(syncProgress?.percent || 0)));
  const appearance = UPDATE_THEME_APPEARANCE[theme] || UPDATE_THEME_APPEARANCE.neon;

  return (
    <div className="syncOverlay">
      <div className="syncCard">
        <div className="syncTitleRow">
          <h2><span className="syncThemeIcon" aria-hidden="true">{appearance.icon}</span> Updating JoeAnimeDB</h2>
          <span className="syncThemeBadge">{appearance.label}</span>
        </div>

        <div className="syncStep">
          Step {syncProgress?.step || 1} of {syncProgress?.stepTotal || 2}
        </div>

        <h3>{syncProgress?.label || 'Working...'}</h3>

        <div className="syncBar" aria-label="Update progress">
          <div className="syncBarFill" style={{ width: `${percent}%` }} />
        </div>

        <div className="syncMeta">
          <span>{percent}%</span>
          <span>
            {syncProgress?.processed || 0} / {syncProgress?.total || 0}
          </span>
        </div>

        <p>{syncText}</p>

        {syncProgress?.current && (
          <p className="syncCurrent">Current: {syncProgress.current}</p>
        )}
      </div>
    </div>
  );
}

function DatabaseUpdateConfirm({ open, theme = 'neon', onCancel, onConfirm }) {
  const appearance = UPDATE_THEME_APPEARANCE[theme] || UPDATE_THEME_APPEARANCE.neon;

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCancel?.();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="updateConfirmOverlay" role="presentation" onClick={onCancel}>
      <section
        className="updateConfirmCard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="database-update-title"
        aria-describedby="database-update-description"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="updateConfirmGlow" aria-hidden="true" />
        <p className="updateConfirmEyebrow">
          <span aria-hidden="true">{appearance.icon}</span> {appearance.label}
        </p>
        <h2 id="database-update-title">Update the anime catalog?</h2>
        <p id="database-update-description">
          JoeAnimeDB will download public anime metadata and rebuild your recommendation catalog.
        </p>

        <div className="updateConfirmList" aria-label="Before you start">
          <span><b aria-hidden="true">📶</b> Wi-Fi recommended. Mobile data may be used.</span>
          <span><b aria-hidden="true">⏱</b> Usually takes a few minutes.</span>
          <span className="updateConfirmWide"><b aria-hidden="true">📱</b> Keep JoeAnimeDB open until the progress bar finishes.</span>
        </div>

        <div className="updateConfirmActions">
          <button type="button" onClick={onCancel}>Not Now</button>
          <button type="button" className="primary" onClick={onConfirm} autoFocus>
            Update Catalog
          </button>
        </div>
      </section>
    </div>
  );
}

function AppUpdateNotice({ status, onOpen, onDismiss }) {
  const state = status?.state || '';
  const version = status?.availableVersion || '';
  const isAndroidUpdate = status?.platform === 'android';

  if (!['available', 'downloading', 'downloaded'].includes(state)) return null;

  const title = state === 'downloaded'
    ? `JoeAnimeDB v${version || 'Next'} is ready`
    : state === 'downloading'
      ? `Downloading v${version || 'Next'}`
      : `JoeAnimeDB v${version || 'Next'} is available`;

  const detail = state === 'downloaded'
    ? 'Restart JoeAnimeDB to finish installing the update.'
    : state === 'downloading'
      ? `${Math.max(0, Math.min(100, Math.round(status?.percent || 0)))}% downloaded`
      : isAndroidUpdate
        ? 'A new Android APK is ready to download.'
        : 'A new desktop release is ready to download.';

  return (
    <aside className={`appUpdateNotice state-${state}`} role="status" aria-live="polite">
      <span className="appUpdateNoticeIcon" aria-hidden="true">🍜</span>
      <div className="appUpdateNoticeCopy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <button type="button" className="appUpdateNoticeOpen" onClick={onOpen}>
        {state === 'downloaded' ? 'Install' : 'View Update'}
      </button>
      <button
        type="button"
        className="appUpdateNoticeDismiss"
        onClick={onDismiss}
        aria-label="Dismiss update notification"
        title="Dismiss"
      >
        ×
      </button>
    </aside>
  );
}

export function App() {
  const [view, setView] = useState('dashboard');
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('poster');
  const [onboardingState, setOnboardingState] = useState(() => readOnboardingState());
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [appUpdateStatus, setAppUpdateStatus] = useState(null);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState('');
  const [databaseUpdateRequest, setDatabaseUpdateRequest] = useState(null);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('joeanime-theme') || 'neon';
    } catch {
      return 'neon';
    }
  });
  const [contentSafetyMode, setContentSafetyMode] = useState(() => {
    try {
      return normalizeContentSafetyMode(
        localStorage.getItem('joeanime-content-safety-mode-v1') || 'unrestricted'
      );
    } catch {
      return 'unrestricted';
    }
  });

  const library = useAnimeLibrary();
  const {
    data,
    anime,
    catalog,
    joeAI,
    filtered,
    stats,
    loading,
    query,
    setQuery,
    syncing,
    syncText,
    syncProgress,
    syncMetadata,


    updateData, updateAnime, updateCatalogAnime, recordJoeAIFeedback, setJoeAIPreference,
    deleteJoeAIFeedback, deleteJoeAIPreference, resetJoeAILearning,
    setJoeAIConversationContext, clearJoeAIConversationContext,
    deleteAnime, fetchMoreCatalogTitles, refreshLiveDiscover,
    restoreBackup, resetDatabase
  } = library;

  useEffect(() => {
    const savedMode = data?.settings?.contentSafetyMode;
    if (savedMode) setContentSafetyMode(normalizeContentSafetyMode(savedMode));
  }, [data?.settings?.contentSafetyMode]);

  async function handleContentSafetyModeChange(nextMode) {
    const normalizedMode = normalizeContentSafetyMode(nextMode);
    setContentSafetyMode(normalizedMode);

    try {
      localStorage.setItem('joeanime-content-safety-mode-v1', normalizedMode);
    } catch {}

    return updateData((current) => ({
      ...(current || {}),
      settings: {
        ...(current?.settings || {}),
        contentSafetyMode: normalizedMode
      }
    }));
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

      // Most pages use the window scroll, but resetting the content element too
      // keeps navigation correct if a platform shell gives it its own scroller.
      document.querySelector('.content')?.scrollTo?.({
        top: 0,
        left: 0,
        behavior: 'auto'
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [view]);

  useEffect(() => installAndroidBackHandler(() => {
    if (selected) {
      setSelected(null);
      return true;
    }

    if (view !== 'dashboard') {
      setView('dashboard');
      return true;
    }

    return false;
  }), [selected, view]);

  useEffect(() => {
    const updates = window.JoeAnimeDB?.updates;
    if (!updates) return undefined;

    let active = true;
    const receiveStatus = (nextStatus) => {
      if (!active || !nextStatus) return;
      setAppUpdateStatus(nextStatus);
    };
    const unsubscribe = updates.onStatus?.(receiveStatus);

    updates.getStatus?.()
      .then(receiveStatus)
      .catch((error) => {
        console.warn('Could not load application update status:', error);
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  function handleThemeChange(nextTheme) {
    setTheme(nextTheme);
    try {
      localStorage.setItem('joeanime-theme', nextTheme);
    } catch (error) {
      console.warn('Could not save theme preference:', error);
    }
  }

  function requestDatabaseUpdate() {
    if (syncing || databaseUpdateRequest) return Promise.resolve(false);

    return new Promise((resolve, reject) => {
      setDatabaseUpdateRequest({ resolve, reject });
    });
  }

  function cancelDatabaseUpdate() {
    databaseUpdateRequest?.resolve(false);
    setDatabaseUpdateRequest(null);
  }

  async function confirmDatabaseUpdate() {
    const request = databaseUpdateRequest;
    setDatabaseUpdateRequest(null);

    try {
      const summary = await syncMetadata();
      request?.resolve(summary);
    } catch (error) {
      request?.reject(error);
    }
  }

  const favoriteAnime = useMemo(
    () => filtered.filter((item) => Boolean(item.favorite)),
    [filtered]
  );

  const followingCount = useMemo(
    () => catalog.filter((item) => Boolean(item.followed)).length,
    [catalog]
  );

  const detailNavigationItems = useMemo(() => {
    if (!selected) return [];

    const selectedIsCatalog = String(selected.id || '').startsWith('catalog-') || Boolean(selected.catalogSource);
    if (selectedIsCatalog) {
      if (view === 'following') return catalog.filter((item) => Boolean(item.followed));
      return catalog;
    }

    if (view === 'library' || view === 'rankings') return sortAnimeByUserScore(filtered);
    if (view === 'favorites') return sortAnimeByUserScore(favoriteAnime);
    return anime;
  }, [selected, view, catalog, filtered, favoriteAnime, anime]);

  const selectedNavigationIndex = useMemo(() => {
    if (!selected) return -1;
    return detailNavigationItems.findIndex((item) => String(item.id) === String(selected.id));
  }, [detailNavigationItems, selected]);

  function navigateDetail(direction) {
    if (selectedNavigationIndex < 0) return;
    const nextIndex = selectedNavigationIndex + direction;
    if (nextIndex < 0 || nextIndex >= detailNavigationItems.length) return;
    setSelected(detailNavigationItems[nextIndex]);
  }

  const [profileDisplayName, setProfileDisplayName] = useState(() => {
    try {
      return String(localStorage.getItem('joeanime-display-name') || '').trim();
    } catch {
      return '';
    }
  });

  useEffect(() => {
    const databaseName = String(data?.profile?.displayName || '').trim();
    if (!profileDisplayName && databaseName) {
      setProfileDisplayName(databaseName);
      try {
        localStorage.setItem('joeanime-display-name', databaseName);
      } catch (error) {
        console.warn('Could not cache display name:', error);
      }
    }
  }, [data?.profile?.displayName, profileDisplayName]);

  const displayName = profileDisplayName || String(data?.profile?.displayName || '').trim();

  useEffect(() => {
    if (loading) return;

    const current = onboardingState || readOnboardingState();
    if (current?.status === 'in-progress') {
      setOnboardingState(current);
      setOnboardingOpen(true);
      return;
    }

    if (current) {
      setOnboardingState(current);
      return;
    }

    if (anime.length === 0 && !displayName) {
      const started = beginOnboarding();
      setOnboardingState(started);
      setOnboardingOpen(true);
      return;
    }

    setOnboardingState(markExistingUserOnboardingComplete());
  }, [loading]);

  async function handleSaveDisplayName(nextName) {
    const cleanName = String(nextName || '').trim().slice(0, 32);
    if (!cleanName) return null;

    // Update immediately so the onboarding modal closes before the SQLite
    // repository round-trip. The current desktop replaceAll path only persists
    // anime rows, so profile data also needs its own durable preference key.
    setProfileDisplayName(cleanName);

    try {
      localStorage.setItem('joeanime-display-name', cleanName);
    } catch (error) {
      console.warn('Could not save display name preference:', error);
    }

    try {
      return await updateData((current) => ({
        ...current,
        profile: {
          ...(current?.profile || {}),
          displayName: cleanName,
          profileUpdatedAt: new Date().toISOString()
        }
      }));
    } catch (error) {
      console.warn('Display name saved locally, but database profile update failed:', error);
      return {
        ...(data || {}),
        profile: {
          ...(data?.profile || {}),
          displayName: cleanName
        }
      };
    }
  }

  async function handleRestoreBackup(database) {
    return restoreBackup(database);
  }

  async function handleResetDatabase() {
    const reset = await resetDatabase();
    [
      'joeanime-display-name',
      'joeanime-onboarding-state-v1',
      'joeanime-onboarding-version',
      'joeanime-library-import-review-v1',
      'joeanime-last-update-summary-v1',
      'joeanime-discover-next-page',
      'joeanime-live-discover-cache-v1',
      'joeanime-discover-live-synced-at',
      'joeanime-following-summary',
      'joeanime-following-notifications-enabled',
      'joeanime-pending-joeai-prompt',
      'joeanime-joeai-feedback-v1',
      'joeanime-joeai-preferences-v1',
      'joeanime-joeai-conversation-v1',
      'joeanime-content-safety-mode-v1',
      'joeai.memory.profile.v1',
      'joeai.memory.journal.v1',
      'joeai.memory.events.v1'
    ].forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {}
    });
    clearOnboardingState();
    setContentSafetyMode('unrestricted');
    const restartedOnboarding = beginOnboarding();
    setOnboardingState(restartedOnboarding);
    setOnboardingOpen(true);
    setProfileDisplayName('');
    setSelected(null);
    setView('dashboard');
    return reset;
  }

  function handleReplayTutorial() {
    setView('dashboard');
    setSelected(null);
    const replay = beginOnboarding({ replay: true });
    setOnboardingState(replay);
    setOnboardingOpen(true);
  }

  function handleOnboardingStep(nextStep) {
    setOnboardingState((current) => updateOnboardingStep(current, nextStep));
  }

  function handleFinishOnboarding(targetView = 'dashboard') {
    const completed = finishOnboarding(onboardingState, 'completed');
    setOnboardingState(completed);
    setOnboardingOpen(false);
    setView(targetView);
  }

  function handleSkipOnboarding() {
    const skipped = finishOnboarding(onboardingState, 'skipped');
    setOnboardingState(skipped);
    setOnboardingOpen(false);
    setView('dashboard');
  }

  function handleDismissOnboardingTip(tipId) {
    setOnboardingState((current) => dismissOnboardingTip(current, tipId));
  }

  function handleOpenFilter(type, value) {
    const cleanValue = String(value || '').trim();
    if (!cleanValue) return;

    // The library hook already searches metadata such as genres and studios.
    // Populate the visible search field first, then open Library so the user
    // immediately sees the matching collection and can clear/change it there.
    setQuery(cleanValue);
    setView('library');
  }

  async function handleUpdateAnime(updatedAnime) {
    const saved = await updateAnime(updatedAnime);
    const savedAnime = saved.anime || [];
    const refreshed = savedAnime.find((item) => String(item.id) === String(updatedAnime.id));

    setSelected((current) => {
      if (!current || String(current.id) !== String(updatedAnime.id)) return current;
      return refreshed || updatedAnime;
    });

    return saved;
  }

  if (loading) {
    return (
      <main className={`shell theme-${theme} bootScreen`}>
        <div className="bootCard">
          <h1>JoeAnimeDB</h1>
          <p>Remember Every Anime.</p>
          <p className="bootSubline">Loading your library...</p>
          <div className="loader" />
        </div>
      </main>
    );
  }

  return (
    <main className={`shell theme-${theme}`}>
      <Sidebar
        view={view}
        setView={setView}
        syncMetadata={requestDatabaseUpdate}
        followingCount={followingCount}
      />

      <MobileNavigation
        view={view}
        setView={setView}
        followingCount={followingCount}
      />

      <section className="content">
        <AppUpdateNotice
          status={
            dismissedUpdateVersion &&
            dismissedUpdateVersion === appUpdateStatus?.availableVersion
              ? null
              : appUpdateStatus
          }
          onOpen={() => {
            setSelected(null);
            setView('about');
          }}
          onDismiss={() => setDismissedUpdateVersion(
            appUpdateStatus?.availableVersion || 'current'
          )}
        />

        {['library', 'favorites', 'rankings'].includes(view) && (
          <header className="topbar">
            <SearchBar query={query} setQuery={setQuery} view={view} setView={setView} />
            <div className="viewModes">
              <button className={mode === 'poster' ? 'active' : ''} onClick={() => setMode('poster')}>Poster</button>
              <button className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}>List</button>
              <button onClick={requestDatabaseUpdate}>Update Database</button>
            </div>
          </header>
        )}

        {view === 'dashboard' && (
          <Dashboard
            anime={anime}
            stats={stats}
            setSelected={setSelected}
            updateAnime={handleUpdateAnime}
            setView={setView}
            onOpenFilter={handleOpenFilter}
            displayName={displayName || (anime.length ? 'Joe' : 'Anime Fan')}
          />
        )}
        {(view === 'library' || view === 'rankings') && (
          <LibraryPage
            anime={filtered}
            allAnime={anime}
            mode={mode}
            setSelected={setSelected}
            updateAnime={handleUpdateAnime}
            deleteAnime={deleteAnime}
            query={query}
            onClearSearch={() => setQuery('')}
            title={view === 'rankings' ? 'Rankings' : 'Library'}
          />
        )}
        {view === 'discover' && (
          <Discover
            anime={anime}
            catalog={catalog}
            setSelected={setSelected}
            setView={setView}
            updateAnime={handleUpdateAnime}
            updateCatalogAnime={updateCatalogAnime}
            joeAIState={joeAI}
            onRecommendationFeedback={recordJoeAIFeedback}
            fetchMoreCatalogTitles={fetchMoreCatalogTitles}
            refreshLiveDiscover={refreshLiveDiscover}
            contentSafetyMode={contentSafetyMode}
          />
        )}
        {view === 'favorites' && (
          <FavoritesPage
            anime={favoriteAnime}
            allAnime={anime}
            mode={mode}
            setSelected={setSelected}
            updateAnime={handleUpdateAnime}
            query={query}
            onClearSearch={() => setQuery('')}
          />
        )}
        {view === 'universe' && <Universe anime={anime} setQuery={setQuery} setView={setView} />}
        {view === 'assistant' && (
          <Assistant
            anime={anime}
            catalog={catalog}
            updateAnime={handleUpdateAnime}
            joeAIState={joeAI}
            onRecommendationFeedback={recordJoeAIFeedback}
            onJoeAIPreference={setJoeAIPreference}
            onJoeAIConversation={setJoeAIConversationContext}
            contentSafetyMode={contentSafetyMode}
          />
        )}
        {view === 'following' && (
          <FollowingPage
            catalog={catalog}
            setSelected={setSelected}
            updateCatalogAnime={updateCatalogAnime}
          />
        )}
        {view === 'analytics' && <Analytics anime={anime} />}
        {view === 'upcoming' && (
          <UpcomingAnime
            anime={anime}
            catalog={catalog}
            setSelected={setSelected}
            updateAnime={handleUpdateAnime}
            updateCatalogAnime={updateCatalogAnime}
            refreshLiveDiscover={refreshLiveDiscover}
          />
        )}
        {view === 'bleach' && <BleachShrine anime={anime} setSelected={setSelected} />}
        {view === 'library-integrity' && (
          <LibraryCleanup
            anime={anime}
            updateData={updateData}
            setSelected={setSelected}
            syncMetadata={requestDatabaseUpdate}
            onBack={() => setView('settings')}
          />
        )}
        {view === 'settings' && (
          <SettingsPage
            data={data}
            updateAnime={handleUpdateAnime}
            syncMetadata={requestDatabaseUpdate}
            stats={stats}
            theme={theme}
            onThemeChange={handleThemeChange}
            joeAIState={joeAI}
            onDeleteJoeAIFeedback={deleteJoeAIFeedback}
            onDeleteJoeAIPreference={deleteJoeAIPreference}
            onResetJoeAILearning={resetJoeAILearning}
            onClearJoeAIConversation={clearJoeAIConversationContext}
            displayName={displayName || (anime.length ? 'Joe' : '')}
            onSaveDisplayName={handleSaveDisplayName}
            onRestoreBackup={handleRestoreBackup}
            onResetDatabase={handleResetDatabase}
            onReplayTutorial={handleReplayTutorial}
            syncing={syncing}
            syncText={syncText}
            syncProgress={syncProgress}
            onOpenIntegrity={() => setView('library-integrity')}
            onOpenMetadataHealth={() => setView('analytics')}
            contentSafetyMode={contentSafetyMode}
            onContentSafetyModeChange={handleContentSafetyModeChange}
          />
        )}
        {view === 'about' && (
          <AboutHelpPage
            data={data}
            stats={stats}
            onReplayTutorial={handleReplayTutorial}
          />
        )}
      </section>

      {selected && (
        <DetailModal
          anime={selected}
          library={anime}
          onClose={() => setSelected(null)}
          updateAnime={handleUpdateAnime}
          updateCatalogAnime={updateCatalogAnime}
          deleteAnime={deleteAnime}
          onPrevious={() => navigateDetail(-1)}
          onNext={() => navigateDetail(1)}
          navigationIndex={selectedNavigationIndex}
          navigationCount={detailNavigationItems.length}
        />
      )}
      <OnboardingPageTip
        view={view}
        dismissed={onboardingState?.dismissedTips || []}
        hidden={
          onboardingOpen ||
          Boolean(selected) ||
          syncing ||
          !['completed', 'skipped'].includes(onboardingState?.status)
        }
        onDismiss={handleDismissOnboardingTip}
      />
      <FirstTimeOnboarding
        open={onboardingOpen}
        initialStep={onboardingState?.step || 0}
        displayName={displayName}
        theme={theme}
        anime={anime}
        onThemeChange={handleThemeChange}
        onSaveDisplayName={handleSaveDisplayName}
        contentSafetyMode={contentSafetyMode}
        onContentSafetyModeChange={handleContentSafetyModeChange}
        onUpdateAnime={handleUpdateAnime}
        onStepChange={handleOnboardingStep}
        onComplete={handleFinishOnboarding}
        onSkip={handleSkipOnboarding}
      />
      <WebDataSafetyNotice
        data={data}
        hidden={
          onboardingOpen ||
          Boolean(selected) ||
          syncing ||
          !['completed', 'skipped'].includes(onboardingState?.status)
        }
        onOpenSettings={() => {
          setView('settings');
          setSelected(null);
        }}
      />
      <DatabaseUpdateConfirm
        open={Boolean(databaseUpdateRequest)}
        theme={theme}
        onCancel={cancelDatabaseUpdate}
        onConfirm={confirmDatabaseUpdate}
      />
      {syncing && <UpdateProgressOverlay syncText={syncText} syncProgress={syncProgress} theme={theme} />}
    </main>
  );
}
