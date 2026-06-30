import React from 'react';
import { Poster } from './Poster';
import { score } from '../utils/animeUtils';

export function DetailModal({ anime, onClose }) {
  return (
    <div className="modalBackdrop">
      <section className="detailModal">
        <button className="close" onClick={onClose}>×</button>
        <Poster anime={anime} className="detailPoster" />
        <div>
          <p className="eyebrow">Rank #{anime.finalRank}</p>
          <h1>{anime.title}</h1>
          <p className="muted">{anime.studio} · {anime.type || 'TV'} · {anime.year || ''}</p>
          <div className="detailStats">
            <div><strong>{score(anime).toFixed(1)}</strong><span>Joe Score</span></div>
            <div><strong>{anime.communityScore || '—'}</strong><span>Community</span></div>
            <div><strong>{anime.episodeCount || '—'}</strong><span>Episodes</span></div>
            <div><strong>{anime.rewatches || 0}</strong><span>Rewatches</span></div>
          </div>
          <div className="tags">{(anime.genres || []).map((g) => <span key={g}>{g}</span>)}</div>
          <p>{anime.synopsis}</p>
          {anime.trailerUrl && <a className="trailer" href={anime.trailerUrl} target="_blank">Watch Trailer</a>}
        </div>
      </section>
    </div>
  );
}
