const fs = require('fs');

const file = 'src/App.jsx';
let text = fs.readFileSync(file, 'utf8');

if (!text.includes('updateData')) {
  text = text.replace(
    'syncMetadata, updateAnime',
    'syncMetadata, updateAnime, updateData'
  );
}

text = text.replaceAll(
  'setSelected={setSelected} updateAnime={handleUpdateAnime} title=',
  'setSelected={setSelected} updateAnime={handleUpdateAnime} updateData={updateData} title='
);

text = text.replaceAll(
  'setSelected={setSelected} updateAnime={handleUpdateAnime} title="Favorites"',
  'setSelected={setSelected} updateAnime={handleUpdateAnime} updateData={updateData} title="Favorites"'
);

fs.writeFileSync(file, text);
console.log('Patched App to pass updateData into LibraryPage.');
