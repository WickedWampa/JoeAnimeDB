import React from 'react';
import { Poster } from './Poster';
import { hasUserScore, score, scoreLabel } from '../utils/animeUtils';
import '../styles/library-collector-cards.css';
import '../styles/library-release-readiness.css';

function rankTierClass(rank, totalCount = 0) {
  const total = Math.max(Number(totalCount || 0), rank || 0, 1);
  const pct = rank / total;

  if (rank <= 10) return 'rank-gold';
  if (pct <= 0.20) return 'rank-purple';
  if (pct <= 0.40) return 'rank-blue';
  if (pct <= 0.60) return 'rank-teal';
  if (pct <= 0.80) return 'rank-green';
  return 'rank-common';
}

export function AnimeCard({ anime, setSelected, updateAnime, displayRank, totalCount, showRank = true }) {
  const rank = showRank ? Number(displayRank || anime.finalRank || 0) : 0;
  const ribbon = rank > 0 ? `#${rank}` : '';
  const rankTier = rankTierClass(rank, totalCount);
  const isFavorite = Boolean(anime.favorite);
  const rated = hasUserScore(anime);
  const reviewLabel = anime.libraryNeedsReview
    ? 'Needs Review'
    : anime.metadataNeedsReview
    ? 'Needs Review'
    : anime.metadataNeedsRefresh
      ? 'Metadata Incomplete'
      : '';

  function openDetails() {
    setSelected(anime);
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openDetails();
    }
  }

  async function handleFavoriteClick(event) {
    event.stopPropagation();
    await updateAnime({ ...anime, favorite: !isFavorite });
  }

  return (
    <article
      className={`animeCard ${rankTier}`}
      role="button"
      tabIndex={0}
      onClick={openDetails}
      onKeyDown={handleKeyDown}
    >
      <Poster anime={anime} className="animePoster" mode="library" />

      <button
        className="favoriteButton"
        type="button"
        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        onClick={handleFavoriteClick}
      >
        {isFavorite ? '❤️' : '🤍'}
      </button>

      {ribbon && <div className="rankRibbon">{ribbon}</div>}

      {reviewLabel && (
        <div
          className={`metadataReviewBadge cardReviewBadge ${anime.metadataNeedsReview ? 'identityReview' : ''}`}
          title={anime.libraryReviewReason || anime.metadataReviewReason || 'Some details still need review'}
        >
          ⚠ {reviewLabel}
        </div>
      )}

      <div className={`scoreBadge ${rated ? '' : 'notRated'}`}>
        {rated ? `★ ${score(anime).toFixed(1)}` : scoreLabel(anime)}
      </div>

      <div className="cardGradient" />

      <div className="cardInfo">
        <h3>{anime.title}</h3>
        <div className="metaPills">
          {anime.year && <span>{anime.year}</span>}
          {Number(anime.episodeCount) > 0 && <span>{anime.episodeCount} eps</span>}
          {anime.communityScore && <span>MAL {anime.communityScore}</span>}
        </div>

        <div className="tags">
          {(anime.genres || []).slice(0, 3).map((g) => <span key={g}>{g}</span>)}
        </div>
      </div>
    </article>
  );
}
