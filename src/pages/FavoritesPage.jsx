import React, { useMemo } from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { Poster } from '../components/Poster';
import { hasUserScore, score, scoreLabel, sortAnimeByUserScore } from '../utils/animeUtils';
import '../styles/favorites.css';
import '../styles/library-release-readiness.css';

export function FavoritesPage({
  anime = [],
  allAnime = [],
  mode = 'poster',
  setSelected,
  updateAnime,
  query = '',
  onClearSearch
}) {
  const rankedFavorites = useMemo(
    () => sortAnimeByUserScore(anime),
    [anime]
  );

  const totalTitles = allAnime.length || anime.length;
  const totalRewatches = allAnime.reduce((sum, item) => sum + Number(item.rewatches || 0), 0);
  const ratedFavorites = rankedFavorites.filter(hasUserScore);
  const averageFavoriteScore = ratedFavorites.length
    ? (ratedFavorites.reduce((sum, item) => sum + score(item), 0) / ratedFavorites.length).toFixed(2)
    : '—';
  const totalFavoriteCount = allAnime.filter((item) => item.favorite).length;
  const hasNoResults = Boolean(query.trim()) && totalFavoriteCount > 0 && rankedFavorites.length === 0;

  async function removeFavorite(event, item) {
    event.stopPropagation();
    await updateAnime({ ...item, favorite: false });
  }

  return (
    <section className="favoritesPage">
      <header className="favoritesHero">
        <div className="favoritesHeroArt" aria-hidden="true" />
        <div className="favoritesHeroShade" />

        <div className="favoritesHeroCopy">
          <p className="favoritesEyebrow">Your Anime Hall of Fame <span aria-hidden="true">♔</span></p>
          <h1>Favorites</h1>
          <div className="favoritesTitleRule" aria-hidden="true"><i>♡</i></div>
          <p className="favoritesLead">The stories that earned a permanent<br />place in your collection.</p>
          <blockquote>
            <strong>“</strong>
            <span>Some stories entertain us.<br />These stories become part of <b>who we are.</b></span>
          </blockquote>

          <div className="favoritesStats">
            <div><span>▤</span><strong>{totalTitles}</strong><small>In Library</small></div>
            <div><span>♡</span><strong>{rankedFavorites.length}</strong><small>Favorites</small></div>
            <div><span>↻</span><strong>{totalRewatches}</strong><small>Rewatches</small></div>
            <div><span>★</span><strong>{averageFavoriteScore}</strong><small>Avg Rating<br />(Favorites)</small></div>
          </div>
        </div>
      </header>

      {rankedFavorites.length === 0 ? (
        <section className={`libraryStateCard ${hasNoResults ? 'noResults' : 'emptyLibrary'}`} role="status">
          <span className="libraryStateIcon" aria-hidden="true">{hasNoResults ? '⌕' : '♡'}</span>
          <p className="eyebrow">{hasNoResults ? 'No Matches' : 'Your Hall of Fame'}</p>
          <h2>{hasNoResults ? 'No favorites match this search' : 'Your Hall of Fame is waiting'}</h2>
          <p>
            {hasNoResults
              ? `None of your favorites match “${query.trim()}”.`
              : 'Click the heart on an anime in your Library to give it a permanent place here.'}
          </p>
          {hasNoResults && onClearSearch && (
            <div className="libraryStateActions">
              <button type="button" onClick={onClearSearch}>Clear Search</button>
            </div>
          )}
        </section>
      ) : mode === 'list' ? (
        <section className="favoritesTablePanel">
          <table>
            <thead>
              <tr>
                <th>Hall</th><th>#</th><th>Anime</th><th>Your Score</th><th>Studio</th><th>Genres</th><th>Rewatches</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rankedFavorites.map((item, index) => (
                <tr key={item.id || item.title} onClick={() => setSelected(item)}>
                  <td><button type="button" className="favoritesHeartButton" title="Remove from Hall of Fame" onClick={(event) => removeFavorite(event, item)}>♥</button></td>
                  <td><span className="favoritesListRank">#{index + 1}</span></td>
                  <td className="titleCell">
                    <Poster anime={item} className="thumb" />
                    <span className="libraryTitleStack">
                      <strong>{item.title}</strong>
                      {(item.metadataNeedsReview || item.metadataNeedsRefresh) && (
                        <span className={`metadataReviewBadge ${item.metadataNeedsReview ? 'identityReview' : ''}`}>
                          ⚠ {item.metadataNeedsReview ? 'Needs Review' : 'Metadata Incomplete'}
                        </span>
                      )}
                    </span>
                  </td>
                  <td>{hasUserScore(item) ? `★ ${score(item).toFixed(1)}` : scoreLabel(item)}</td>
                  <td>{item.studio || 'Unknown Studio'}</td>
                  <td>{(item.genres || []).slice(0, 3).join(', ') || '—'}</td>
                  <td>{Number(item.rewatches || 0)}</td>
                  <td>{item.status ? <span className={`statusPill compact ${item.status.replace(/\s+/g, '').toLowerCase()}`}>{item.status}</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="favoritesGrid" aria-label="Ranked favorites">
          {rankedFavorites.map((item, index) => (
            <AnimeCard
              key={item.id || item.title}
              anime={item}
              displayRank={index + 1}
              totalCount={rankedFavorites.length}
              setSelected={setSelected}
              updateAnime={updateAnime}
            />
          ))}
        </section>
      )}
    </section>
  );
}
