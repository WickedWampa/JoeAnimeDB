const fs = require('fs');

function patch(file, replacements) {
  let text = fs.readFileSync(file, 'utf8');

  for (const [from, to] of replacements) {
    if (text.includes(from)) {
      text = text.replaceAll(from, to);
      console.log(`patched ${file}`);
    } else {
      console.log(`pattern not found or already patched: ${file}`);
    }
  }

  fs.writeFileSync(file, text);
}

patch('src/pages/PlaceholderPages.jsx', [
  ['export function Assistant({ anime })', 'export function Assistant({ anime, catalog = [] })'],
  ['createAnimeBrain(anime), [anime]', 'createAnimeBrain(anime, catalog), [anime, catalog]']
]);

patch('src/App.jsx', [
  ['<Assistant anime={anime} />', '<Assistant anime={anime} catalog={catalog} />']
]);

console.log('JoeAI now receives catalog.');
