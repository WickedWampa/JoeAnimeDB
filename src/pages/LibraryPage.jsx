import React from 'react';
import { AnimeCard } from '../components/AnimeCard';
import { Poster } from '../components/Poster';
import { score } from '../utils/animeUtils';

export function LibraryPage({ anime, mode, setSelected, title, updateAnime, emptyMessage }) {
  async function handleFavoriteClick(event, item) {
    event.stopPropagation();
    await updateAnime({
      ...item,
      favorite: !Boolean(item.favorite)
    });
  }

  return (
    <>
      <section className="pageHeader">
        <div>
          <p className="eyebrow">Sprint 3</p>
          <h1>{title}</h1>
          <p>{anime.length} titles shown. Search, switch views, favorite titles, and click any title for details.</p>
        </div>
      </section>

      {anime.length === 0 && emptyMessage ? (
        <section className="emptyState">
          <h2>Nothing here yet</h2>
          <p>{emptyMessage}</p>
        </section>
      ) : mode === 'list' ? (
        <section className="tablePanel">
          <table>
            <thead>
              <tr>
                <th>Fav</th>
                <th>#</th>
                <th>Anime</th>
                <th>Score</th>
                <th>Studio</th>
                <th>Genres</th>
                <th>Episodes</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {anime.map((item) => (
                <tr key={item.id} onClick={() => setSelected(item)}>
                  <td>
                    <button
                      className="favoriteListButton"
                      type="button"
                      title={item.favorite ? 'Remove from favorites' : 'Add to favorites'}
                      onClick={(event) => handleFavoriteClick(event, item)}
                    >
                      {item.favorite ? '❤️' : '🤍'}
                    </button>
                  </td>
                  <td>{item.finalRank}</td>
                  <td className="titleCell"><Poster anime={item} className="thumb" />{item.title}</td>
                  <td>★ {score(item).toFixed(1)}</td>
                  <td>{item.studio}</td>
                  <td>{(item.genres || []).slice(0, 3).join(', ')}</td>
                  <td>{item.episodeCount || '—'}</td>
                  <td>{item.status ? <span className={`statusPill compact ${item.status.replace(/\s+/g, '').toLowerCase()}`}>{item.status}</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="posterGrid">
          {anime.map((item) => <AnimeCard key={item.id} anime={item} setSelected={setSelected} updateAnime={updateAnime} />)}
        </section>
      )}
    </>
  );
}
