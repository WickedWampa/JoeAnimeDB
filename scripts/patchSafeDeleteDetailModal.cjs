const fs = require('fs');

const file = 'src/components/DetailModal.jsx';
let text = fs.readFileSync(file, 'utf8');

text = text.replace(
  "export function DetailModal({ anime, onClose, updateAnime }) {",
  "export function DetailModal({ anime, onClose, updateAnime, deleteAnime }) {"
);

if (!text.includes('confirmDelete')) {
  text = text.replace(
`  const currentScore = Number(anime.joeScore ?? score(anime) ?? 0);
  const currentStatus = anime.status || '';`,
`  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const currentScore = Number(anime.joeScore ?? score(anime) ?? 0);
  const currentStatus = anime.status || '';`
  );
}

if (!text.includes('async function handleDelete')) {
  text = text.replace(
`  function updateRewatches(delta) {
    const next = Math.max(0, Number(anime.rewatches || 0) + delta);
    updateField('rewatches', next);
  }`,
`  function updateRewatches(delta) {
    const next = Math.max(0, Number(anime.rewatches || 0) + delta);
    updateField('rewatches', next);
  }

  async function handleDelete() {
    if (!deleteAnime || !anime?.id) return;

    setRemoving(true);

    try {
      await deleteAnime(anime.id);
      onClose();
    } catch (error) {
      console.warn('Remove from library failed:', anime.title, error);
      setRemoving(false);
      alert('Could not remove this anime yet. Check the console.');
    }
  }`
  );
}

if (!text.includes('dangerZone')) {
  text = text.replace(
`          {anime.trailerUrl && <a className="trailer" href={anime.trailerUrl} target="_blank" rel="noreferrer">Watch Trailer</a>}
        </div>`,
`          {anime.trailerUrl && <a className="trailer" href={anime.trailerUrl} target="_blank" rel="noreferrer">Watch Trailer</a>}

          <section className="dangerZone">
            {!confirmDelete ? (
              <button
                className="removeAnimeButton"
                type="button"
                onClick={() => setConfirmDelete(true)}
              >
                🗑 Remove From Library
              </button>
            ) : (
              <div className="removeConfirm">
                <p>
                  Remove <strong>{anime.title}</strong> from your library?
                </p>

                <button type="button" onClick={() => setConfirmDelete(false)} disabled={removing}>
                  Cancel
                </button>

                <button
                  type="button"
                  className="danger"
                  disabled={removing}
                  onClick={handleDelete}
                >
                  {removing ? 'Removing...' : 'Remove Anime'}
                </button>
              </div>
            )}
          </section>
        </div>`
  );
}

fs.writeFileSync(file, text);
console.log('Added safe remove button to DetailModal.');
