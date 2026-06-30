import React from 'react';
import { Poster } from './Poster';
import { score } from '../utils/animeUtils';

const WATCH_STATUSES = [
  '',
  'Watching',
  'Completed',
  'On Hold',
  'Dropped',
  'Plan to Watch'
];

export function DetailModal({ anime, onClose, updateAnime }) {
  async function updateField(field, value) {
    if (!updateAnime) return;
    await updateAnime({
      ...anime,
      [field]: value
    });
  }

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
            <div><strong>{score(anime).toFixed(1)}</strong><span>My Score</span></div>
            <div><strong>{anime.communityScore || '—'}</strong><span>Community</span></div>
            <div><strong>{anime.episodeCount || '—'}</strong><span>Episodes</span></div>
            <div><strong>{anime.rewatches || 0}</strong><span>Rewatches</span></div>
          </div>

          <section className="personalPanel">
            <button
              className={`favoriteToggle ${anime.favorite ? 'active' : ''}`}
              type="button"
              onClick={() => updateField('favorite', !Boolean(anime.favorite))}
            >
              {anime.favorite ? '❤️ Favorite' : '🤍 Add Favorite'}
            </button>

            <label>
              <span>My Score</span>
              <input
                type="number"
                min="0"
                max="10"
                step="0.1"
                value={anime.joeScore ?? ''}
                placeholder="0-10"
                onChange={(event) => {
                  const value = event.target.value;
                  updateField('joeScore', value === '' ? null : Number(value));
                }}
              />
            </label>

            <label>
              <span>Status</span>
              <select
                value={anime.status || ''}
                onChange={(event) => updateField('status', event.target.value)}
              >
                {WATCH_STATUSES.map((status) => (
                  <option key={status || 'none'} value={status}>{status || 'Not Set'}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Rewatches</span>
              <input
                type="number"
                min="0"
                step="1"
                value={anime.rewatches ?? 0}
                onChange={(event) => updateField('rewatches', Number(event.target.value || 0))}
              />
            </label>

            <label className="notesField">
              <span>Notes</span>
              <textarea
                value={anime.notes || ''}
                placeholder="What did this anime mean to you?"
                onChange={(event) => updateField('notes', event.target.value)}
              />
            </label>
          </section>

          <div className="tags">{(anime.genres || []).map((g) => <span key={g}>{g}</span>)}</div>
          <p>{anime.synopsis}</p>
          {anime.trailerUrl && <a className="trailer" href={anime.trailerUrl} target="_blank" rel="noreferrer">Watch Trailer</a>}
        </div>
      </section>
    </div>
  );
}
