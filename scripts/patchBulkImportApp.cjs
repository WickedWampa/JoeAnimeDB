const fs = require('fs');

const file = 'src/App.jsx';
let text = fs.readFileSync(file, 'utf8');

text = text.replaceAll(
  '<LibraryPage anime={filtered} mode={mode} setSelected={setSelected} updateAnime={handleUpdateAnime} title={view === \'rankings\' ? \'Rankings\' : \'Library\'} />',
  '<LibraryPage anime={filtered} allAnime={anime} mode={mode} setSelected={setSelected} updateAnime={handleUpdateAnime} title={view === \'rankings\' ? \'Rankings\' : \'Library\'} />'
);

text = text.replaceAll(
  '<LibraryPage anime={favoriteAnime} mode={mode} setSelected={setSelected} updateAnime={handleUpdateAnime} title="Favorites" emptyMessage="No favorites yet. Click a heart on any anime to add it here." />',
  '<LibraryPage anime={favoriteAnime} allAnime={anime} mode={mode} setSelected={setSelected} updateAnime={handleUpdateAnime} title="Favorites" emptyMessage="No favorites yet. Click a heart on any anime to add it here." />'
);

fs.writeFileSync(file, text);
console.log('Patched App to pass allAnime into LibraryPage.');
