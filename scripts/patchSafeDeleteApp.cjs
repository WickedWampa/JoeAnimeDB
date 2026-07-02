const fs = require('fs');

const file = 'src/App.jsx';
let text = fs.readFileSync(file, 'utf8');

text = text.replace(
  /const \{([\s\S]*?)\} = library;/,
  (match, inner) => {
    if (inner.includes('deleteAnime')) return match;
    return `const {${inner.replace('updateAnime', 'updateAnime, deleteAnime')}} = library;`;
  }
);

text = text.replaceAll(
  '<DetailModal anime={selected} onClose={() => setSelected(null)} updateAnime={handleUpdateAnime} />',
  '<DetailModal anime={selected} onClose={() => setSelected(null)} updateAnime={handleUpdateAnime} deleteAnime={deleteAnime} />'
);

fs.writeFileSync(file, text);
console.log('Passed deleteAnime to DetailModal.');
