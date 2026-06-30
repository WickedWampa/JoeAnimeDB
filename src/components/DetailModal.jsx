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

const STATUS_CLASS = {
  Watching: 'watching',
  Completed: 'completed',
  'On Hold': 'hold',
  Dropped: 'dropped',
  'Plan to Watch': 'plan'
};

function Stars({ value }) {
  const rounded = Math.round(Number(value || 0));
  return (
    <span className="starDisplay" aria-hidden="true">
      {Array.from({ length: 10 }).map((_, index) => (
        <span key={index} className={index < rounded ? 'filled' : ''}>★</span>
      ))}
    </span>
  );
}

export function DetailModal({ anime, onClose, updateAnime }) {
  const currentScore = Number(anime.joeScore ?? score(anime) ?? 0);
  const currentStatus = anime.status || '';

  async function updateField(field, value) {
    if (!updateAnime) return;
    await updateAnime({
      ...anime,
      [field]: value
    });
  }

  function updateRewatches(delta) {
    const next = Math.max(0, Number(anime.rewatches || 0) + delta);
    updateField('rewatches', next);
  }

  return (
    <div className="modalBackdrop">
      <section className="detailModal upgradedModal">
        <button className="close" onClick={onClose}>×</button>
        <aside className="detailArtRail">
          <Poster anime={anime} className="detailPoster" />
          <button
            className={`favoriteToggle heroFavorite ${anime.favorite ? 'active' : ''}`}
            type="button"
            onClick={() => updateField('favorite', !Boolean(anime.favorite))}
          >
            {anime.favorite ? '❤️ Favorite' : '🤍 Add Favorite'}
          </button>
        </aside>

        <div className="detailBody">
          <p className="eyebrow">Rank #{anime.finalRank}</p>
          <h1>{anime.title}</h1>
          <p className="muted">{anime.studio} · {anime.type || 'TV'} · {anime.year || ''}</p>

          <section className="scoreEditor">
            <div>
              <span className="controlLabel">My Score</span>
              <Stars value={currentScore} />
            </div>
            <strong>{currentScore.toFixed(1)}</strong>
            <input
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={currentScore}
              aria-label="My Score"
              onChange={(event) => updateField('joeScore', Number(event.target.value))}
            />
          </section>

          <div className="detailStats">
            <div><strong>{currentScore.toFixed(1)}</strong><span>My Score</span></div>
            <div><strong>{anime.communityScore || '—'}</strong><span>Community</span></div>
            <div><strong>{anime.episodeCount || '—'}</strong><span>Episodes</span></div>
            <div><strong>{anime.rewatches || 0}</strong><span>Rewatches</span></div>
          </div>

          <section className="personalPanel glowPanel">
            <label className="statusControl">
              <span className="controlLabel">Watch Status</span>
              <div className={`statusPill ${STATUS_CLASS[currentStatus] || 'unset'}`}>
                {currentStatus || 'Not Set'}
              </div>
              <select
                value={currentStatus}
                onChange={(event) => updateField('status', event.target.value)}
              >
                {WATCH_STATUSES.map((status) => (
                  <option key={status || 'none'} value={status}>{status || 'Not Set'}</option>
                ))}
              </select>
            </label>

            <div className="rewatchControl">
              <span className="controlLabel">Rewatches</span>
              <div className="stepper">
                <button type="button" onClick={() => updateRewatches(-1)} aria-label="Decrease rewatches">−</button>
                <strong>{anime.rewatches || 0}</strong>
                <button type="button" onClick={() => updateRewatches(1)} aria-label="Increase rewatches">+</button>
              </div>
            </div>

            <label className="notesField polishedNotes">
              <span className="controlLabel">Personal Notes</span>
              <textarea
                value={anime.notes || ''}
                placeholder="What did this anime mean to you?"
                onChange={(event) => updateField('notes', event.target.value)}
              />
            </label>
          </section>

          <div className="tags">{(anime.genres || []).map((g) => <span key={g}>{g}</span>)}</div>
          <section className="synopsisBlock">
            <h2>Synopsis</h2>
            <p>{anime.synopsis}</p>
          </section>
          {anime.trailerUrl && <a className="trailer" href={anime.trailerUrl} target="_blank" rel="noreferrer">Watch Trailer</a>}
        </div>
      </section>
    </div>
  );
}
