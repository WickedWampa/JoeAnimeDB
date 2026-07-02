const fs = require('fs');

function patchHook() {
  const file = 'src/hooks/useAnimeLibrary.js';
  let text = fs.readFileSync(file, 'utf8');

  if (!text.includes('async function deleteAnime')) {
    text = text.replace(
`  async function updateAnime(updatedAnime) {
    const saved = await animeRepository.updateAnime(updatedAnime);
    setData(saved);
    return saved;
  }`,
`  async function updateAnime(updatedAnime) {
    const saved = await animeRepository.updateAnime(updatedAnime);
    setData(saved);
    return saved;
  }

  async function deleteAnime(id) {
    const next = {
      ...data,
      anime: anime.filter((item) => String(item.id) !== String(id))
    };

    const saved = await animeRepository.saveDatabase(next);
    setData(saved);
    return saved;
  }`
    );
  }

  if (!text.includes('deleteAnime,')) {
    text = text.replace(
`    updateData,
    updateAnime,
    syncMetadata`,
`    updateData,
    updateAnime,
    deleteAnime,
    syncMetadata`
    );
  }

  fs.writeFileSync(file, text);
}

function patchDetail() {
  const file = 'src/components/DetailModal.jsx';
  let text = fs.readFileSync(file, 'utf8');

  text = text.replace(
    'export function DetailModal({ anime, onClose, updateAnime }) {',
    'export function DetailModal({ anime, onClose, updateAnime, deleteAnime }) {'
  );

  if (!text.includes('removeAnimeButton')) {
    text = text.replace(
`          {anime.trailerUrl && <a className="trailer" href={anime.trailerUrl} target="_blank" rel="noreferrer">Watch Trailer</a>}
        </div>`,
`          {anime.trailerUrl && <a className="trailer" href={anime.trailerUrl} target="_blank" rel="noreferrer">Watch Trailer</a>}

          <section className="dangerZone">
            <button
              className="removeAnimeButton"
              type="button"
              onClick={async () => {
                if (!deleteAnime) return;
                if (confirm(\`Remove "\${anime.title}" from your library?\`)) {
                  await deleteAnime(anime.id);
                  onClose();
                }
              }}
            >
              🗑 Remove From Library
            </button>
          </section>
        </div>`
    );
  }

  fs.writeFileSync(file, text);
}

function patchCss() {
  const file = 'src/styles/app.css';
  let text = fs.readFileSync(file, 'utf8');

  const css = `
/* Detail Modal Remove From Library */
.dangerZone {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid rgba(255, 92, 92, .22);
}

.removeAnimeButton {
  border: 1px solid rgba(255, 92, 92, .36);
  background: rgba(255, 92, 92, .10);
  color: #ffb0b0;
  border-radius: 999px;
  padding: 10px 15px;
  font-weight: 1000;
  cursor: pointer;
}

.removeAnimeButton:hover {
  border-color: rgba(255, 92, 92, .72);
  box-shadow: 0 0 22px rgba(255, 92, 92, .14);
}
`;

  if (!text.includes('Detail Modal Remove From Library')) {
    text += '\n' + css;
  }

  fs.writeFileSync(file, text);
}

patchHook();
patchDetail();
patchCss();

console.log('Forced remove-from-library button into DetailModal and deleteAnime into hook.');
