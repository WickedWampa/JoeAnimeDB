import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, RefreshCw, Search, Heart, Plus, ExternalLink } from 'lucide-react';
import { Poster } from '../components/Poster';
import { fetchKitsuLiveDiscoverFeeds } from '../services/kitsuProvider';
import '../styles/upcoming-anime.css';

const JIKAN_BASE = 'https://api.jikan.moe/v4';

function normalizeTitle(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function titleOf(item = {}) {
  return item.officialTitle || item.title || 'Unknown title';
}

function normalizeJikanAnime(item = {}, bucket = 'upcoming') {
  const title = item.title_english || item.title || item.title_japanese || 'Unknown title';
  const startDate = item.aired?.from || '';
  const genres = [
    ...(item.genres || []),
    ...(item.themes || []),
    ...(item.demographics || [])
  ].map((entry) => entry?.name).filter(Boolean);

  return {
    id: `catalog-mal-${item.mal_id}`,
    malId: item.mal_id,
    title,
    officialTitle: title,
    japaneseTitle: item.title_japanese || '',
    titleSynonyms: item.title_synonyms || [],
    cover: item.images?.webp?.large_image_url || item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '',
    synopsis: item.synopsis || '',
    type: item.type || 'TV',
    episodes: item.episodes || 0,
    episodeCount: item.episodes || 0,
    status: item.status || '',
    year: item.year || (startDate ? Number(startDate.slice(0, 4)) : ''),
    startDate,
    airedFrom: startDate,
    airedTo: item.aired?.to || '',
    communityScore: Number(item.score || 0) || 0,
    malScore: Number(item.score || 0) || 0,
    members: Number(item.members || 0) || 0,
    popularity: item.popularity || null,
    studio: (item.studios || []).map((studio) => studio.name).join(' / '),
    genres: [...new Set(genres)],
    trailerUrl: item.trailer?.url || item.trailer?.embed_url || '',
    discoverBucket: bucket,
    discoverSource: `Jikan ${bucket === 'current' ? 'Current Season' : 'Upcoming Season'}`,
    catalogSource: 'Jikan',
    metadataSource: 'jikan',
    metadataReady: true
  };
}

async function fetchJikanFeed(path, bucket) {
  const response = await fetch(`${JIKAN_BASE}${path}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Jikan ${response.status}`);
  const payload = await response.json();
  return (payload.data || []).map((item) => normalizeJikanAnime(item, bucket));
}

function mergeUnique(...groups) {
  const seen = new Set();
  const merged = [];

  groups.flat().forEach((item) => {
    const key = item.malId ? `mal:${item.malId}` : `title:${normalizeTitle(titleOf(item))}`;
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  });

  return merged;
}

function formatDate(value = '') {
  if (!value) return 'Date TBA';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Date TBA';
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function isLibraryMatch(item, anime = []) {
  const wantedMalId = String(item.malId || '');
  const wantedTitle = normalizeTitle(titleOf(item));
  return anime.some((entry) => {
    const entryMalId = String(entry.malId || entry.mal_id || '');
    if (wantedMalId && entryMalId && wantedMalId === entryMalId) return true;
    return normalizeTitle(titleOf(entry)) === wantedTitle;
  });
}

export function UpcomingAnime({ anime = [], catalog = [], setSelected, updateAnime, updateCatalogAnime }) {
  const [current, setCurrent] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [tab, setTab] = useState('upcoming');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sourceNote, setSourceNote] = useState('');

  async function loadFeeds() {
    setLoading(true);
    setError('');

    const results = await Promise.allSettled([
      fetchJikanFeed('/seasons/now?limit=24', 'current'),
      fetchJikanFeed('/seasons/upcoming?limit=24', 'upcoming'),
      fetchKitsuLiveDiscoverFeeds({ limit: 20 })
    ]);

    const jikanCurrent = results[0].status === 'fulfilled' ? results[0].value : [];
    const jikanUpcoming = results[1].status === 'fulfilled' ? results[1].value : [];
    const kitsu = results[2].status === 'fulfilled' ? results[2].value : { current: [], upcoming: [] };

    const nextCurrent = mergeUnique(jikanCurrent, kitsu.current || []);
    const nextUpcoming = mergeUnique(jikanUpcoming, kitsu.upcoming || []);

    setCurrent(nextCurrent);
    setUpcoming(nextUpcoming);

    const sources = [];
    if (jikanCurrent.length || jikanUpcoming.length) sources.push('Jikan');
    if ((kitsu.current || []).length || (kitsu.upcoming || []).length) sources.push('Kitsu');
    setSourceNote(sources.length ? `Live data from ${sources.join(' + ')}` : 'No live source available');

    if (!nextCurrent.length && !nextUpcoming.length) {
      setError('Upcoming anime could not be loaded right now. Jikan and Kitsu may be temporarily unavailable.');
    }

    setLoading(false);
  }

  useEffect(() => {
    loadFeeds();
  }, []);

  const followedKeys = useMemo(() => {
    const keys = new Set();
    catalog.filter((item) => item.followed).forEach((item) => {
      if (item.malId) keys.add(`mal:${item.malId}`);
      keys.add(`title:${normalizeTitle(titleOf(item))}`);
    });
    return keys;
  }, [catalog]);

  const visible = useMemo(() => {
    const source = tab === 'current' ? current : upcoming;
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? source.filter((item) => [titleOf(item), item.studio, ...(item.genres || [])].join(' ').toLowerCase().includes(needle))
      : source;

    return [...filtered].sort((a, b) => {
      const aDate = a.startDate ? new Date(a.startDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bDate = b.startDate ? new Date(b.startDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aDate - bDate;
    });
  }, [current, upcoming, query, tab]);

  async function toggleFollow(item) {
    if (!updateCatalogAnime || !item) return;

    const wantedMalId = String(item.malId || item.mal_id || '');
    const wantedTitle = normalizeTitle(titleOf(item));

    // Update the existing catalog row when one already represents this title.
    // Using the freshly fetched live-feed item directly can create a second row,
    // leaving the original followed row untouched and making "Following" appear
    // impossible to turn off.
    const existing = catalog.find((entry) => {
      const entryMalId = String(entry.malId || entry.mal_id || '');
      if (wantedMalId && entryMalId && wantedMalId === entryMalId) return true;
      return normalizeTitle(titleOf(entry)) === wantedTitle;
    });

    const followed = Boolean(existing?.followed);
    const nextFollowed = !followed;

    await updateCatalogAnime({
      ...item,
      ...existing,
      id: existing?.id || item.id,
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
      id: item.malId ? `anime-${item.malId}` : `anime-${Date.now()}`,
      status: tab === 'current' ? 'Watching' : 'Plan to Watch',
      followed: false,
      favorite: false,
      rewatches: 0,
      notes: item.notes || '',
      addedAt: new Date().toISOString()
    });
  }

  return (
    <section className="upcomingPage">
      <header className="upcomingHero">
        <div>
          <p className="eyebrow">Live release radar</p>
          <h1>Upcoming Anime</h1>
          <p>Track what is airing now and what premieres next, powered only by Jikan and Kitsu.</p>
          <small>{sourceNote}</small>
        </div>
        <CalendarClock size={72} aria-hidden="true" />
      </header>

      <div className="upcomingToolbar">
        <div className="upcomingTabs">
          <button className={tab === 'upcoming' ? 'active' : ''} onClick={() => setTab('upcoming')}>Coming Soon ({upcoming.length})</button>
          <button className={tab === 'current' ? 'active' : ''} onClick={() => setTab('current')}>Airing Now ({current.length})</button>
        </div>
        <label className="upcomingSearch">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, studio, or genre" />
        </label>
        <button className="upcomingRefresh" onClick={loadFeeds} disabled={loading}><RefreshCw size={17} /> Refresh</button>
      </div>

      {loading && <div className="upcomingState"><div className="loader" /><p>Loading live anime releases...</p></div>}
      {!loading && error && <div className="upcomingState error"><p>{error}</p><button onClick={loadFeeds}>Try Again</button></div>}

      {!loading && !error && (
        <div className="upcomingGrid">
          {visible.map((item) => {
            const followKey = item.malId ? `mal:${item.malId}` : `title:${normalizeTitle(titleOf(item))}`;
            const followed = followedKeys.has(followKey);
            const inLibrary = isLibraryMatch(item, anime);

            return (
              <article className="upcomingCard" key={`${tab}-${item.id}`}>
                <button className="upcomingPoster" onClick={() => setSelected?.(item)} aria-label={`Open ${titleOf(item)}`}>
                  <Poster anime={item} />
                </button>
                <div className="upcomingCardBody">
                  <div className="upcomingDate">{formatDate(item.startDate || item.airedFrom)}</div>
                  <h3>{titleOf(item)}</h3>
                  <p>{item.studio || item.type || 'Anime'}</p>
                  <div className="upcomingMeta">
                    {item.communityScore > 0 && <span>★ {Number(item.communityScore).toFixed(1)}</span>}
                    {item.episodeCount > 0 && <span>{item.episodeCount} eps</span>}
                    <span>{item.metadataSource === 'kitsu' ? 'Kitsu' : 'Jikan'}</span>
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

      {!loading && !error && !visible.length && <div className="upcomingState"><p>No titles match your search.</p></div>}
    </section>
  );
}
