import './styles/progress-overlay.css';
import React, { useMemo, useState } from 'react';

import { Sidebar } from './components/Sidebar';
import { SearchBar } from './components/SearchBar';
import { DetailModal } from './components/DetailModal';
import { Dashboard } from './pages/Dashboard';
import { LibraryPage } from './pages/LibraryPage';
import { Universe, Assistant, Analytics, Timeline, BleachShrine, SettingsPage } from './pages/PlaceholderPages';
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
    updateAnime
  } = library;

  const favoriteAnime = useMemo(
    () => filtered.filter((item) => Boolean(item.favorite)),
    [filtered]
  );

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
      <Sidebar view={view} setView={setView} syncMetadata={syncMetadata} theme={theme} setTheme={setTheme} />

      <section className="content">
        <header className="topbar">
          <SearchBar query={query} setQuery={setQuery} view={view} setView={setView} />
          <div className="viewModes">
            <button className={mode === 'poster' ? 'active' : ''} onClick={() => setMode('poster')}>Poster</button>
            <button className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}>List</button>
            <button onClick={syncMetadata}>Update Database</button>
          </div>
        </header>

        {view === 'dashboard' && <Dashboard anime={anime} stats={stats} setSelected={setSelected} updateAnime={handleUpdateAnime} setView={setView} />}
        {(view === 'library' || view === 'rankings') && (
          <LibraryPage anime={filtered} mode={mode} setSelected={setSelected} updateAnime={handleUpdateAnime} title={view === 'rankings' ? 'Rankings' : 'Library'} />
        )}
        {view === 'favorites' && (
          <LibraryPage anime={favoriteAnime} mode={mode} setSelected={setSelected} updateAnime={handleUpdateAnime} title="Favorites" emptyMessage="No favorites yet. Click a heart on any anime to add it here." />
        )}
        {view === 'universe' && <Universe anime={anime} setQuery={setQuery} setView={setView} />}
        {view === 'assistant' && <Assistant anime={anime} catalog={catalog} />}
        {view === 'analytics' && <Analytics anime={anime} />}
        {view === 'timeline' && <Timeline anime={anime} setSelected={setSelected} />}
        {view === 'bleach' && <BleachShrine anime={anime} setSelected={setSelected} />}
        {view === 'settings' && <SettingsPage data={data} syncMetadata={syncMetadata} stats={stats} />}
      </section>

      {selected && <DetailModal anime={selected} onClose={() => setSelected(null)} updateAnime={handleUpdateAnime} />}
      {syncing && <UpdateProgressOverlay syncText={syncText} syncProgress={syncProgress} />}
    </main>
  );
}
