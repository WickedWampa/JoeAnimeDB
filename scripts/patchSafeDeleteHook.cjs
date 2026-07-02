const fs = require('fs');

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
console.log('Added deleteAnime to useAnimeLibrary.');
