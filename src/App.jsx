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
import React, { useEffect, useMemo, useState } from 'react';

import { Sidebar } from './components/Sidebar';
import { SearchBar } from './components/SearchBar';
import { DetailModal } from './components/DetailModal';
import { Dashboard } from './pages/Dashboard';
import { LibraryPage } from './pages/LibraryPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { Discover } from './pages/Discover';
import { FollowingPage } from './pages/FollowingPage';
import { UpcomingAnime } from './pages/UpcomingAnime';
import { LibraryCleanup } from './pages/LibraryCleanup';
import { Universe, Assistant, Analytics, BleachShrine, SettingsPage } from './pages/PlaceholderPages';
import { useAnimeLibrary } from './hooks/useAnimeLibrary';

function UpdateProgressOverlay({ syncText, syncProgress }) {
  const percent = Math.max(0, Math.min(100, Math.round(syncProgress?.percent || 0)));

  return (
    <div className="syncOverlay">
      <div className="syncCard">
        <h2>🍜 Updating JoeAnimeDB</h2>

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

export function App() {
  const [view, setView] = useState('dashboard');
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('poster');
  const [theme, setTheme] = useState('neon');

  const library = useAnimeLibrary();
  const {
    data,
    anime,
    catalog,
    filtered,
    stats,
    loading,
    query,
    setQuery,
    syncing,
    syncText,
    syncProgress,
    syncMetadata,


    updateData, updateAnime, updateCatalogAnime, deleteAnime, fetchMoreCatalogTitles, refreshLiveDiscover
  } = library;

  const favoriteAnime = useMemo(
    () => filtered.filter((item) => Boolean(item.favorite)),
    [filtered]
  );

  const followingCount = useMemo(
    () => catalog.filter((item) => Boolean(item.followed)).length,
    [catalog]
  );

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
  const isNewUser = anime.length === 0 && !displayName;

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
          onboardingCompletedAt: current?.profile?.onboardingCompletedAt || new Date().toISOString(),
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
        syncMetadata={syncMetadata}
        theme={theme}
        setTheme={setTheme}
        followingCount={followingCount}
      />

      <section className="content">
        {['library', 'favorites', 'rankings'].includes(view) && (
          <header className="topbar">
            <SearchBar query={query} setQuery={setQuery} view={view} setView={setView} />
            <div className="viewModes">
              <button className={mode === 'poster' ? 'active' : ''} onClick={() => setMode('poster')}>Poster</button>
              <button className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}>List</button>
              <button onClick={syncMetadata}>Update Database</button>
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
            isNewUser={isNewUser}
            onSaveDisplayName={handleSaveDisplayName}
          />
        )}
        {(view === 'library' || view === 'rankings') && (
          <LibraryPage anime={filtered} allAnime={anime} mode={mode} setSelected={setSelected} updateAnime={handleUpdateAnime} title={view === 'rankings' ? 'Rankings' : 'Library'} />
        )}
        {view === 'discover' && (
          <Discover
            anime={anime}
            catalog={catalog}
            setSelected={setSelected}
            setView={setView}
            updateAnime={handleUpdateAnime}
            updateCatalogAnime={updateCatalogAnime}
            fetchMoreCatalogTitles={fetchMoreCatalogTitles}
            refreshLiveDiscover={refreshLiveDiscover}
          />
        )}
        {view === 'favorites' && (
          <FavoritesPage
            anime={favoriteAnime}
            allAnime={anime}
            mode={mode}
            setSelected={setSelected}
            updateAnime={handleUpdateAnime}
          />
        )}
        {view === 'universe' && <Universe anime={anime} setQuery={setQuery} setView={setView} />}
        {view === 'assistant' && <Assistant anime={anime} catalog={catalog} updateAnime={handleUpdateAnime} />}
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
          />
        )}
        {view === 'bleach' && <BleachShrine anime={anime} setSelected={setSelected} />}
        {view === 'library-integrity' && (
          <LibraryCleanup
            anime={anime}
            updateData={updateData}
            setSelected={setSelected}
            syncMetadata={syncMetadata}
            onBack={() => setView('settings')}
          />
        )}
        {view === 'settings' && (
          <SettingsPage
            data={data}
            updateAnime={handleUpdateAnime}
            syncMetadata={syncMetadata}
            stats={stats}
            displayName={displayName || (anime.length ? 'Joe' : '')}
            onSaveDisplayName={handleSaveDisplayName}
            onOpenIntegrity={() => setView('library-integrity')}
            onOpenMetadataHealth={() => setView('analytics')}
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
        />
      )}
      {syncing && <UpdateProgressOverlay syncText={syncText} syncProgress={syncProgress} />}
    </main>
  );
}
