const fs = require('fs');

const file = 'src/pages/PlaceholderPages.jsx';
let text = fs.readFileSync(file, 'utf8');

if (!text.includes('mergeAnimeMetadata')) {
  text = text.replace(
    "import { importAnimeByTitle } from '../services/animeImporter';",
    "import { importAnimeByTitle, mergeAnimeMetadata } from '../services/animeImporter';"
  );
}

text = text.replaceAll(
  `if (result.duplicate) { setLog((current) => [ ...current, { who: 'bot', type: 'text', text: result.duplicate.title + ' is already in your library as ' + (result.duplicate.status || 'saved') + '. No duplicate added.' } ]); return; }`,
  `if (result.duplicate) { const merged = mergeAnimeMetadata(result.duplicate, result.candidate, input.status || result.duplicate.status); await updateAnime(merged); setLog((current) => [ ...current, { who: 'bot', type: 'text', text: 'Updated existing entry: ' + result.duplicate.title + ' → ' + (merged.officialTitle || merged.title) + '. No duplicate added.' } ]); return; }`
);

fs.writeFileSync(file, text);
console.log('Patched JoeAI importer to upgrade duplicates instead of refusing them.');
