import React from 'react';
import { Poster } from './Poster';
import { score } from '../utils/animeUtils';

export function AnimeCard({ anime, setSelected, updateAnime }) {
  const ribbon = Number(anime.finalRank) === 1 ? 'GOAT' : Number(anime.finalRank) <= 10 ? `#${anime.finalRank}` : '';
  const isFavorite = Boolean(anime.favorite);

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
    await updateAnime({
      ...anime,
      favorite: !isFavorite
    });
  }

  return (
    <article
      className={`animeCard ${isFavorite ? 'isFavorite' : ''}`}
      role="button"
      tabIndex={0}
      onClick={openDetails}
      onKeyDown={handleKeyDown}
    >
      <Poster anime={anime} />
      <button
        className="favoriteButton"
        type="button"
        aria-label={isFavorite ? `Remove ${anime.title} from favorites` : `Add ${anime.title} to favorites`}
        title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        onClick={handleFavoriteClick}
      >
        {isFavorite ? '❤️' : '🤍'}
      </button>
      {ribbon && <span className="ribbon">{ribbon}</span>}
      <span className="score">★ {score(anime).toFixed(1)}</span>
      <div className="cardInfo">
        <h3>{anime.title}</h3>
        <p>#{anime.finalRank} · {anime.studio}</p>
        <div className="miniMeta">
          {anime.year && <span>{anime.year}</span>}
          {anime.episodeCount > 0 && <span>{anime.episodeCount} eps</span>}
          {anime.communityScore && <span>MAL {anime.communityScore}</span>}
        </div>
        <div className="tags">{(anime.genres || []).slice(0, 3).map((g) => <span key={g}>{g}</span>)}</div>
      </div>
    </article>
  );
}
