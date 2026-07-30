import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, RefreshCw, Search, Heart, Plus, ExternalLink } from 'lucide-react';
import { Poster } from '../components/Poster';
import { fetchLiveDiscoverCatalog } from '../services/catalogService';
import { classifyAnimeRelease } from '../services/releaseState';
import '../styles/upcoming-anime.css';

function normalizeTitle(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function titleOf(item = {}) {
  return item.officialTitle || item.title || 'Unknown title';
}

function mergeUnique(...groups) {
  const seen = new Set();
  const merged = [];

  groups.flat().forEach((item) => {
    const key = item.kitsuId
      ? `kitsu:${item.kitsuId}`
      : item.malId
        ? `mal:${item.malId}`
        : `title:${normalizeTitle(titleOf(item))}`;
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  });

  return merged;
}

function cachedRows(catalog = [], bucket) {
  return mergeUnique(
    (catalog || []).filter((item) => item?.discoverBucket === bucket)
  );
}

function isLibraryMatch(item, anime = []) {
  const wantedKitsuId = String(item.kitsuId || '');
  const wantedMalId = String(item.malId || '');
  const wantedTitle = normalizeTitle(titleOf(item));
  return anime.some((entry) => {
    const entryKitsuId = String(entry.kitsuId || '');
    const entryMalId = String(entry.malId || entry.mal_id || '');
    if (wantedKitsuId && entryKitsuId && wantedKitsuId === entryKitsuId) return true;
    if (wantedMalId && entryMalId && wantedMalId === entryMalId) return true;
    return normalizeTitle(titleOf(entry)) === wantedTitle;
  });
}

export function UpcomingAnime({
  anime = [],
  catalog = [],
  setSelected,
  updateAnime,
  updateCatalogAnime,
  refreshLiveDiscover
}) {
  const [current, setCurrent] = useState(() => cachedRows(catalog, 'current'));
  const [upcoming, setUpcoming] = useState(() => cachedRows(catalog, 'upcoming'));
  const [tab, setTab] = useState('upcoming');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sourceNote, setSourceNote] = useState(
    current.length || upcoming.length ? 'Saved Kitsu catalog' : ''
  );
  const [dataState, setDataState] = useState(
    current.length || upcoming.length ? 'cached' : 'loading'
  );

  async function loadFeeds() {
    const savedCurrent = cachedRows(catalog, 'current');
    const savedUpcoming = cachedRows(catalog, 'upcoming');
    if (savedCurrent.length) setCurrent(savedCurrent);
    if (savedUpcoming.length) setUpcoming(savedUpcoming);

    setLoading(true);
    setError('');
    setDataState('loading');

    try {
      const result = refreshLiveDiscover
        ? await refreshLiveDiscover({ limitPerFeed: 80 })
        : await fetchLiveDiscoverCatalog({
            library: anime,
            catalog,
            limitPerFeed: 80
          });
      const rows = result.catalog || result.saved?.catalog || catalog;
      const nextCurrent = cachedRows(rows, 'current');
      const nextUpcoming = cachedRows(rows, 'upcoming');

      setCurrent(nextCurrent);
      setUpcoming(nextUpcoming);
      setDataState(result.state || (result.partial ? 'partial' : 'live'));
      setSourceNote(
        result.state === 'offline'
          ? 'Kitsu is offline — showing the last saved release catalog'
          : result.partial
            ? 'Kitsu returned partial data — saved rows filled the gaps'
            : 'Live release data from Kitsu'
      );

      if (!nextCurrent.length && !nextUpcoming.length) {
        setError('Upcoming anime could not be loaded from Kitsu right now.');
      }
    } catch (feedError) {
      console.warn('Kitsu upcoming feed failed.', feedError);
      const hasCachedRows =
        savedCurrent.length ||
        savedUpcoming.length ||
        current.length ||
        upcoming.length;
      setDataState(hasCachedRows ? 'offline' : 'error');
      setSourceNote(
        hasCachedRows
          ? 'Kitsu is offline — showing the last saved release catalog'
          : 'Kitsu is temporarily unavailable'
      );
      setError(
        hasCachedRows
          ? 'Live refresh failed. No saved titles were removed.'
          : 'Upcoming anime could not be loaded from Kitsu, and no saved catalog exists yet.'
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadFeeds();
  }, []);

  useEffect(() => {
    const nextCurrent = cachedRows(catalog, 'current');
    const nextUpcoming = cachedRows(catalog, 'upcoming');
    setCurrent(nextCurrent);
    setUpcoming(nextUpcoming);
  }, [catalog]);

  const followedKeys = useMemo(() => {
    const keys = new Set();
    catalog.filter((item) => item.followed).forEach((item) => {
      if (item.kitsuId) keys.add(`kitsu:${item.kitsuId}`);
      if (item.malId) keys.add(`mal:${item.malId}`);
      keys.add(`title:${normalizeTitle(titleOf(item))}`);
    });
    return keys;
  }, [catalog]);

  const releaseGroups = useMemo(() => {
    const groups = {
      airing: [],
      upcoming: [],
      delayed: [],
      tba: []
    };

    mergeUnique(current, upcoming).forEach((item) => {
      const release = classifyAnimeRelease(item);
      if (groups[release.key]) groups[release.key].push(item);
    });

    return groups;
  }, [current, upcoming]);

  const visible = useMemo(() => {
    const source = releaseGroups[tab] || [];
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? source.filter((item) => [titleOf(item), item.studio, ...(item.genres || [])].join(' ').toLowerCase().includes(needle))
      : source;

    return [...filtered].sort((a, b) => {
      const aDate = a.startDate ? new Date(a.startDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bDate = b.startDate ? new Date(b.startDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aDate - bDate;
    });
  }, [query, releaseGroups, tab]);

  async function toggleFollow(item) {
    if (!updateCatalogAnime || !item) return;

    const wantedKitsuId = String(item.kitsuId || '');
    const wantedMalId = String(item.malId || item.mal_id || '');
    const wantedTitle = normalizeTitle(titleOf(item));

    // Update the existing catalog row when one already represents this title.
    // Using the freshly fetched live-feed item directly can create a second row,
    // leaving the original followed row untouched and making "Following" appear
    // impossible to turn off.
    const existing = catalog.find((entry) => {
      const entryKitsuId = String(entry.kitsuId || '');
      const entryMalId = String(entry.malId || entry.mal_id || '');
      if (wantedKitsuId && entryKitsuId && wantedKitsuId === entryKitsuId) return true;
      if (wantedMalId && entryMalId && wantedMalId === entryMalId) return true;
      return normalizeTitle(titleOf(entry)) === wantedTitle;
    });

    const followed = Boolean(existing?.followed);
    const nextFollowed = !followed;

    await updateCatalogAnime({
      ...item,
      ...existing,
      id: existing?.id || item.id,
      kitsuId: existing?.kitsuId || item.kitsuId,
      malId: existing?.malId || existing?.mal_id || item.malId || item.mal_id,
      officialTitle: existing?.officialTitle || item.officialTitle || titleOf(item),
      followed: nextFollowed,
      ignored: false,
      followedAt: nextFollowed
        ? (existing?.followedAt || new Date().toISOString())
        : '',
      listUpdatedAt: new Date().toISOString()
    });
  }

  async function addToLibrary(item) {
    if (isLibraryMatch(item, anime)) return;
    await updateAnime?.({
      ...item,
      id: item.kitsuId
        ? `anime-kitsu-${item.kitsuId}`
        : item.malId
          ? `anime-${item.malId}`
          : `anime-${Date.now()}`,
      status: classifyAnimeRelease(item).key === 'airing' ? 'Watching' : 'Plan to Watch',
      followed: false,
      favorite: false,
      rewatches: 0,
      notes: item.notes || '',
      addedAt: new Date().toISOString(),
      addedFrom: 'Upcoming'
    });
  }

  return (
    <section className="upcomingPage">
      <header className="upcomingHero">
        <div>
          <p className="eyebrow">Live release radar</p>
          <h1>Upcoming Anime</h1>
          <p>Track what is airing now and what premieres next with live Kitsu data.</p>
          <small className={`upcomingSource state-${dataState}`}>{sourceNote}</small>
        </div>
        <CalendarClock size={72} aria-hidden="true" />
      </header>

      <div className="upcomingToolbar">
        <div className="upcomingTabs">
          <button className={tab === 'airing' ? 'active' : ''} onClick={() => setTab('airing')}>Airing Now ({releaseGroups.airing.length})</button>
          <button className={tab === 'upcoming' ? 'active' : ''} onClick={() => setTab('upcoming')}>Upcoming ({releaseGroups.upcoming.length})</button>
          <button className={tab === 'delayed' ? 'active' : ''} onClick={() => setTab('delayed')}>Delayed ({releaseGroups.delayed.length})</button>
          <button className={tab === 'tba' ? 'active' : ''} onClick={() => setTab('tba')}>Date TBA ({releaseGroups.tba.length})</button>
        </div>
        <label className="upcomingSearch">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, studio, or genre" />
        </label>
        <button className="upcomingRefresh" onClick={loadFeeds} disabled={loading}><RefreshCw size={17} /> Refresh</button>
      </div>

      {loading && !current.length && !upcoming.length && <div className="upcomingState"><div className="loader" /><p>Loading the Kitsu release catalog...</p></div>}
      {loading && (current.length > 0 || upcoming.length > 0) && (
        <div className="upcomingNotice">Refreshing Kitsu now. Saved release data remains available below.</div>
      )}
      {!loading && error && (current.length > 0 || upcoming.length > 0) && (
        <div className="upcomingNotice warning">{error}</div>
      )}
      {!loading && error && !current.length && !upcoming.length && <div className="upcomingState error"><p>{error}</p><button onClick={loadFeeds}>Try Again</button></div>}

      {(current.length > 0 || upcoming.length > 0) && (
        <div className="upcomingGrid">
          {visible.map((item) => {
            const release = classifyAnimeRelease(item);
            const followKey = item.kitsuId
              ? `kitsu:${item.kitsuId}`
              : item.malId
                ? `mal:${item.malId}`
                : `title:${normalizeTitle(titleOf(item))}`;
            const followed = followedKeys.has(followKey);
            const inLibrary = isLibraryMatch(item, anime);

            return (
              <article className="upcomingCard" key={`${tab}-${item.kitsuId || item.id}`}>
                <button className="upcomingPoster" onClick={() => setSelected?.(item)} aria-label={`Open ${titleOf(item)}`}>
                  <Poster anime={item} />
                </button>
                <div className="upcomingCardBody">
                  <div className={`upcomingDate release-${release.key}`}>
                    <strong>{release.label}</strong>
                    <span>{release.dateText}</span>
                  </div>
                  <h3>{titleOf(item)}</h3>
                  <p>{item.studio || item.type || 'Anime'}</p>
                  <div className="upcomingMeta">
                    {item.communityScore > 0 && <span>★ {Number(item.communityScore).toFixed(1)}</span>}
                    {item.episodeCount > 0 && <span>{item.episodeCount} eps</span>}
                    <span>Kitsu</span>
                  </div>
                  <div className="upcomingActions">
                    <button className={followed ? 'active' : ''} onClick={() => toggleFollow(item)}><Heart size={16} fill={followed ? 'currentColor' : 'none'} /> {followed ? 'Following' : 'Follow'}</button>
                    <button disabled={inLibrary} onClick={() => addToLibrary(item)}><Plus size={16} /> {inLibrary ? 'In Library' : 'Add'}</button>
                    {item.trailerUrl && <button onClick={() => window.open(item.trailerUrl, '_blank')} title="Open trailer"><ExternalLink size={16} /></button>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!loading && (current.length > 0 || upcoming.length > 0) && !visible.length && (
        <div className="upcomingState">
          <p>{query.trim() ? 'No titles match your search.' : `No ${tab === 'tba' ? 'date-TBA' : tab} titles are in the saved Kitsu catalog.`}</p>
        </div>
      )}
    </section>
  );
}
