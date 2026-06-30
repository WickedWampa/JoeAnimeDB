import React from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { Poster } from '../components/Poster';
import { score } from '../utils/animeUtils';

export function StatStrip({ stats }) {
  return (
    <section className="stats">
      <div><strong>{stats.total}</strong><span>Total Anime</span></div>
      <div><strong>{stats.avg}</strong><span>Avg Joe Score</span></div>
      <div><strong>{stats.posters}</strong><span>Posters Synced</span></div>
      <div><strong>{stats.topGenre}</strong><span>Top Genre</span></div>
      <div><strong>{stats.rewatches}</strong><span>Rewatches</span></div>
    </section>
  );
}

export function Dashboard({ anime, stats, setSelected }) {
  const top = [...anime].sort((a, b) => Number(a.finalRank) - Number(b.finalRank)).slice(0, 6);
  const daily = top[0];

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Welcome back, Joe</p>
          <h1>Anime command center.</h1>
          <p>Real 108-title database, metadata, posters, rankings, analytics, and the sacred Bleach Shrine.</p>
        </div>
        {daily && (
          <button className="daily" onClick={() => setSelected(daily)}>
            <Poster anime={daily} className="dailyPoster" />
            <div>
              <span>Daily GOAT</span>
              <strong>{daily.title}</strong>
              <small>#{daily.finalRank} · ★ {score(daily).toFixed(1)}</small>
            </div>
          </button>
        )}
      </section>

      <StatStrip stats={stats} />

      <section className="panel">
        <h2>Top 6</h2>
        <div className="posterGrid small">
          {top.map((item) => <AnimeCard key={item.id} anime={item} setSelected={setSelected} />)}
        </div>
      </section>
    </>
  );
}
