const fs = require('fs');

const file = 'src/hooks/useAnimeLibrary.js';
let text = fs.readFileSync(file, 'utf8');

if (!text.includes('async function deleteAnime')) {
  text = text.replace(
    'async function updateAnime(updatedAnime) {',
    `async function deleteAnime(id) {
    const nextAnime = anime.filter((item) => String(item.id) !== String(id));
    const saved = await updateData({ ...data, anime: nextAnime });
    return saved;
  }

  async function updateAnime(updatedAnime) {`
  );
}

if (!text.includes('deleteAnime,')) {
  text = text.replace(
    'updateData, updateAnime, syncMetadata',
    'updateData, updateAnime, deleteAnime, syncMetadata'
  );

  text = text.replace(
    'updateData, updateAnime,',
    'updateData, updateAnime, deleteAnime,'
  );
}

fs.writeFileSync(file, text);
console.log('Patched useAnimeLibrary with deleteAnime.');
