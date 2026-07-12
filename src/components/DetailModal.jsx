import React, { useState } from 'react';
import { Poster } from './Poster';
import { score } from '../utils/animeUtils';
import { fetchMetadata } from '../services/metadata';
import { mergeAnimeMetadata } from '../services/animeImporter';
import '../styles/detail-metadata-repair.css';

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

export function DetailModal({ anime, onClose, updateAnime, updateCatalogAnime, deleteAnime }) {
  const [repairingMetadata, setRepairingMetadata] = useState(false);
  const [metadataMessage, setMetadataMessage] = useState('');
  const [metadataMessageType, setMetadataMessageType] = useState('');
  const [metadataProgressText, setMetadataProgressText] = useState('');
  const isCatalogTitle = String(anime.id || '').startsWith('catalog-') || Boolean(anime.catalogSource);
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

  async function toggleFollow() {
    if (!updateCatalogAnime) return;

    const following = !Boolean(anime.followed);

    await updateCatalogAnime({
      ...anime,
      followed: following,
      ignored: false,
      followedAt: following ? (anime.followedAt || new Date().toISOString()) : '',
      listUpdatedAt: new Date().toISOString()
    });
  }

  async function repairMetadata() {
    if (!updateAnime || repairingMetadata) return;

    const retryDelays = [0, 1200, 2600];
    let lastError = null;

    setRepairingMetadata(true);
    setMetadataMessage('');
    setMetadataMessageType('');
    setMetadataProgressText('Contacting Jikan…');

    try {
      for (let attempt = 0; attempt < retryDelays.length; attempt++) {
        if (retryDelays[attempt]) {
          setMetadataProgressText(`Jikan timed out. Retrying ${attempt + 1} of ${retryDelays.length - 1}…`);
          await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
        }

        try {
          setMetadataProgressText(attempt === 0 ? 'Contacting Jikan…' : `Retrying metadata lookup (${attempt + 1}/${retryDelays.length})…`);
          const fetched = await fetchMetadata(anime);

          const hasNewMetadata = Boolean(
            fetched?.malId ||
            fetched?.cover ||
            fetched?.synopsis ||
            fetched?.studio ||
            fetched?.year ||
            fetched?.episodeCount ||
            fetched?.communityScore ||
            (Array.isArray(fetched?.genres) && fetched.genres.length)
          );

          if (!hasNewMetadata) {
            setMetadataMessage('No metadata match was found for this title.');
            setMetadataMessageType('warning');
            setMetadataProgressText('');
            return;
          }

          setMetadataProgressText('Updating poster, synopsis, genres, and studio…');

          const merged = mergeAnimeMetadata(anime, fetched, anime.status);
          await updateAnime({
            ...merged,
            metadataNeedsRefresh: false,
            syncStatus: {
              ...(anime.syncStatus || {}),
              metadata: true,
              poster: Boolean(merged.cover),
              dirty: false,
              metadataError: '',
              lastMetadataSync: new Date().toISOString()
            }
          });

          setMetadataMessage('Metadata repaired successfully.');
          setMetadataMessageType('success');
          setMetadataProgressText('');
          return;
        } catch (error) {
          lastError = error;
          console.warn(`Single-title metadata repair attempt ${attempt + 1} failed:`, anime.title, error);
        }
      }

      const message = String(lastError?.message || '');
      const isTimeout = /504|timeout|gateway/i.test(message);

      setMetadataMessage(
        isTimeout
          ? 'Jikan is temporarily unavailable or timed out. Your library is safe and nothing was changed. Please try again in a minute.'
          : `Metadata repair failed${message ? `: ${message}` : '.'} Your library is safe and nothing was changed.`
      );
      setMetadataMessageType('error');
      setMetadataProgressText('');
    } finally {
      setRepairingMetadata(false);
    }
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

          {isCatalogTitle && (
            <button
              className={`repairMetadataButton ${anime.followed ? 'followingActive' : ''}`}
              type="button"
              onClick={toggleFollow}
              disabled={!updateCatalogAnime}
            >
              {anime.followed ? '🔔 Following' : '🔔 Notify Me / Follow'}
            </button>
          )}

          <button
            className="repairMetadataButton"
            type="button"
            onClick={repairMetadata}
            disabled={repairingMetadata || !updateAnime}
          >
            {repairingMetadata ? `⏳ ${metadataProgressText || 'Repairing Metadata…'}` : '🔄 Repair Metadata'}
          </button>

          {repairingMetadata && metadataProgressText && (
            <p className="metadataRepairProgress" role="status">{metadataProgressText}</p>
          )}

          {metadataMessage && (
            <p className={`metadataRepairMessage ${metadataMessageType}`} role="status">
              {metadataMessageType === 'success' ? '✓ ' : metadataMessageType === 'warning' ? '⚠ ' : '✕ '}
              {metadataMessage}
            </p>
          )}
        </aside>

        <div className="detailBody">
          <p className="eyebrow">Rank #{anime.finalRank}</p>
          <h1>{anime.title}</h1>
          <p className="muted">{anime.studio} · {anime.type || 'TV'} · {anime.year || ''}</p>

          {!isCatalogTitle && <section className="scoreEditor">
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
          </section>}

          <div className="detailStats">
            <div><strong>{currentScore.toFixed(1)}</strong><span>My Score</span></div>
            <div><strong>{anime.communityScore || '—'}</strong><span>Community</span></div>
            <div><strong>{anime.episodeCount || '—'}</strong><span>Episodes</span></div>
            <div><strong>{anime.rewatches || 0}</strong><span>Rewatches</span></div>
          </div>

          {!isCatalogTitle && <section className="personalPanel glowPanel">
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
          </section>}

          <div className="tags">{(anime.genres || []).map((g) => <span key={g}>{g}</span>)}</div>
          <section className="synopsisBlock">
            <h2>Synopsis</h2>
            <p>{anime.synopsis}</p>
          </section>
          {anime.trailerUrl && <a className="trailer" href={anime.trailerUrl} target="_blank" rel="noreferrer">Watch Trailer</a>}

          {!isCatalogTitle && <section className="dangerZone">
            <button
              className="removeAnimeButton"
              type="button"
              onClick={async () => {
                if (!deleteAnime) return;
                const ok = window.confirm(`Remove "${anime.title}" from your library?`);
                if (!ok) return;
                await deleteAnime(anime.id);
                onClose();
              }}
            >
              🗑 Remove From Library
            </button>
          </section>}
        </div>
      </section>
    </div>
  );
}
