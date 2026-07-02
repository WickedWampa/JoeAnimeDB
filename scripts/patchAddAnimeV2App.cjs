const fs = require('fs');

const appFile = 'src/App.jsx';
const cssImport = "import './styles/add-anime.css';";
let app = fs.readFileSync(appFile, 'utf8');

if (!app.includes(cssImport)) {
  app = `${cssImport}\n${app}`;
}

app = app.replaceAll(
  '<LibraryPage anime={filtered} mode={mode} setSelected={setSelected} updateAnime={handleUpdateAnime} title={view === \'rankings\' ? \'Rankings\' : \'Library\'} />',
  '<LibraryPage anime={filtered} allAnime={anime} mode={mode} setSelected={setSelected} updateAnime={handleUpdateAnime} title={view === \'rankings\' ? \'Rankings\' : \'Library\'} />'
);

app = app.replaceAll(
  '<LibraryPage anime={favoriteAnime} mode={mode} setSelected={setSelected} updateAnime={handleUpdateAnime} title="Favorites" emptyMessage="No favorites yet. Click a heart on any anime to add it here." />',
  '<LibraryPage anime={favoriteAnime} allAnime={anime} mode={mode} setSelected={setSelected} updateAnime={handleUpdateAnime} title="Favorites" emptyMessage="No favorites yet. Click a heart on any anime to add it here." />'
);

fs.writeFileSync(appFile, app);
console.log('Patched App for Add Anime V2.');
