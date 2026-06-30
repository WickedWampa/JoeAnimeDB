import React from 'react';
import { Poster } from './Poster';
import { score } from '../utils/animeUtils';

export function AnimeCard({ anime, setSelected }) {
  const ribbon = Number(anime.finalRank) === 1 ? 'GOAT' : Number(anime.finalRank) <= 10 ? `#${anime.finalRank}` : '';

  return (
    <button className="animeCard" onClick={() => setSelected(anime)}>
      <Poster anime={anime} />
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
    </button>
  );
}
