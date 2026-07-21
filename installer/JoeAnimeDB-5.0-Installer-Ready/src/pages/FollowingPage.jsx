import React, { useMemo, useState } from 'react';
import { Bell, Search, CalendarClock, Radio, Radar } from 'lucide-react';
import { Poster } from '../components/Poster';
import '../styles/following.css';

function titleOf(item = {}) {
  return item.officialTitle || item.title || 'Unknown title';
}

function knownReleaseText(item = {}) {
  if (item.airedFrom) return item.airedFrom;
  if (item.year) return String(item.year);
  if (item.status) return item.status;
  return 'Release information not available yet';
}

export function FollowingPage({ catalog = [], setSelected, updateCatalogAnime }) {
  const [query, setQuery] = useState('');

  const followed = useMemo(() => {
    const clean = query.trim().toLowerCase();

    return (catalog || [])
      .filter((item) => Boolean(item.followed))
      .filter((item) => {
        if (!clean) return true;
        return [
          titleOf(item),
          item.studio,
          ...(item.genres || [])
        ].filter(Boolean).join(' ').toLowerCase().includes(clean);
      })
      .sort((a, b) =>
        String(b.followedAt || '').localeCompare(String(a.followedAt || '')) ||
        titleOf(a).localeCompare(titleOf(b))
      );
  }, [catalog, query]);

  async function unfollow(item) {
    await updateCatalogAnime?.({
      ...item,
      followed: false,
      followedAt: '',
      listUpdatedAt: new Date().toISOString()
    });
  }

  return (
    <section className="followingPage">
      <header className="followingHero">
        <div className="followingHeroContent">
          <p>JoeAI Watch Network</p>
          <h1><Bell /> Release Watch</h1>
          <span>
            JoeAI is watching the horizon for new episodes, trailers, announcements, and release updates.
          </span>

          <div className="followingHeroStats" aria-label="Release watch status">
            <div>
              <Radio />
              <strong>{followed.length}</strong>
              <small>Being Watched</small>
            </div>
            <div>
              <Radar />
              <strong>Online</strong>
              <small>Watch Network</small>
            </div>
          </div>
        </div>
      </header>

      <label className="followingSearch">
        <Search />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search followed titles..."
        />
      </label>

      {followed.length ? (
        <div className="followingGrid">
          {followed.map((item) => (
            <article key={item.id || item.malId || item.title} className="followingCard">
              <button type="button" onClick={() => setSelected?.(item)}>
                <Poster anime={item} className="followingPoster" />
              </button>

              <div>
                <p className="followingStatus"><CalendarClock /> {knownReleaseText(item)}</p>
                <h2>{titleOf(item)}</h2>
                <span>{item.studio || 'Studio not available'}</span>
                <small>{(item.genres || []).slice(0, 3).join(' • ')}</small>

                <div className="followingActions">
                  <button type="button" onClick={() => setSelected?.(item)}>View Details</button>
                  <button type="button" className="danger" onClick={() => unfollow(item)}>Unfollow</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="followingEmpty">
          <Bell />
          <h2>No followed anime yet</h2>
          <p>Open Discover and click 🔔 Follow on any upcoming or interesting title.</p>
        </section>
      )}
    </section>
  );
}
