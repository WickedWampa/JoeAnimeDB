import React from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { Poster } from '../components/Poster';
import { score } from '../utils/animeUtils';

function normalizeStatus(status = '') {
  return String(status).toLowerCase().replace(/\s+/g, '');
}

function statusCount(anime, status) {
  return anime.filter((item) => normalizeStatus(item.status) === normalizeStatus(status)).length;
}

export function StatStrip({ stats, anime }) {
  const favorites = anime.filter((item) => Boolean(item.favorite)).length;
  const watching = statusCount(anime, 'Watching');
  const completed = statusCount(anime, 'Completed');

  return (
    <section className="stats homeStats">
      <div><strong>{stats.total}</strong><span>Total Anime</span></div>
      <div><strong>{favorites}</strong><span>Favorites</span></div>
      <div><strong>{watching}</strong><span>Watching</span></div>
      <div><strong>{completed}</strong><span>Completed</span></div>
      <div><strong>{stats.avg}</strong><span>Avg My Score</span></div>
    </section>
  );
}

function MiniAnimeRow({ anime, setSelected }) {
  return (
    <button className="miniAnimeRow" type="button" onClick={() => setSelected(anime)}>
      <Poster anime={anime} className="miniPoster" />
      <span>
        <strong>{anime.title}</strong>
        <small>#{anime.finalRank || '—'} · ★ {score(anime).toFixed(1)}</small>
      </span>
    </button>
  );
}

function EmptyHomeCard({ title, text, action, onClick }) {
  return (
    <div className="homeEmptyCard">
      <strong>{title}</strong>
      <p>{text}</p>
      {action && <button type="button" onClick={onClick}>{action}</button>}
    </div>
  );
}

export function Dashboard({ anime, stats, setSelected, updateAnime, setView }) {
  const favorites = anime.filter((item) => Boolean(item.favorite));
  const watching = anime.filter((item) => normalizeStatus(item.status) === 'watching');
  const topRated = [...anime]
    .filter((item) => Number(item.joeScore || 0) > 0)
    .sort((a, b) => Number(b.joeScore || 0) - Number(a.joeScore || 0))
    .slice(0, 6);

  const rankedFallback = [...anime]
    .sort((a, b) => Number(a.finalRank || 9999) - Number(b.finalRank || 9999));

  const recommendation = rankedFallback.find((item) => !item.favorite && normalizeStatus(item.status) !== 'completed') || rankedFallback[0];
  const daily = watching[0] || favorites[0] || rankedFallback[0];

  return (
    <>
      <section className="homeHero">
        <div className="homeHeroText">
          <p className="eyebrow">Welcome back</p>
          <h1>Remember Every Anime.</h1>
          <p>Your personal anime command center: watch status, favorites, scores, notes, rewatches, and recommendations built around your taste.</p>
          <div className="heroActions">
            <button type="button" onClick={() => setView('library')}>Open Library</button>
            <button type="button" onClick={() => setView('favorites')}>View Favorites</button>
          </div>
        </div>
        {daily && (
          <button className="daily spotlightCard" onClick={() => setSelected(daily)}>
            <Poster anime={daily} className="dailyPoster" />
            <div>
              <span>{watching[0] ? 'Continue Watching' : 'Today\'s Pick'}</span>
              <strong>{daily.title}</strong>
              <small>{daily.status || 'Ready when you are'} · ★ {score(daily).toFixed(1)}</small>
            </div>
          </button>
        )}
      </section>

      <StatStrip stats={stats} anime={anime} />

      <section className="homeGrid">
        <div className="panel homePanel continuePanel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Up Next</p>
              <h2>Continue Watching</h2>
            </div>
            <button type="button" onClick={() => setView('library')}>Browse</button>
          </div>
          {watching.length ? (
            <div className="miniList">
              {watching.slice(0, 5).map((item) => <MiniAnimeRow key={item.id} anime={item} setSelected={setSelected} />)}
            </div>
          ) : (
            <EmptyHomeCard title="Nothing marked Watching yet" text="Set a title to Watching from the detail modal and it will appear here." action="Open Library" onClick={() => setView('library')} />
          )}
        </div>

        <div className="panel homePanel recommendationPanel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Because You Loved...</p>
              <h2>Recommendation Seed</h2>
            </div>
          </div>
          {recommendation ? (
            <button className="recommendationCard" type="button" onClick={() => setSelected(recommendation)}>
              <Poster anime={recommendation} className="recommendationPoster" />
              <span>
                <strong>{recommendation.title}</strong>
                <small>Early match based on your rankings and scores.</small>
              </span>
            </button>
          ) : (
            <EmptyHomeCard title="Recommendations coming soon" text="Rate a few more shows and JoeAnimeDB will start learning your taste." />
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Personal Shelf</p>
            <h2>Favorites</h2>
          </div>
          <button type="button" onClick={() => setView('favorites')}>See All</button>
        </div>
        {favorites.length ? (
          <div className="posterGrid small">
            {favorites.slice(0, 6).map((item) => <AnimeCard key={item.id} anime={item} setSelected={setSelected} updateAnime={updateAnime} />)}
          </div>
        ) : (
          <EmptyHomeCard title="No favorites yet" text="Click a heart on any anime and your favorites will show up here." action="Open Library" onClick={() => setView('library')} />
        )}
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Your Taste</p>
            <h2>Top Rated</h2>
          </div>
        </div>
        <div className="posterGrid small">
          {(topRated.length ? topRated : rankedFallback.slice(0, 6)).slice(0, 6).map((item) => <AnimeCard key={item.id} anime={item} setSelected={setSelected} updateAnime={updateAnime} />)}
        </div>
      </section>
    </>
  );
}
