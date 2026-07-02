const fs = require('fs');

function replaceInFile(file, replacements) {
  let text = fs.readFileSync(file, 'utf8');

  for (const [from, to] of replacements) {
    if (text.includes(from)) {
      text = text.replace(from, to);
    } else {
      console.warn(`Pattern not found in ${file}: ${from}`);
    }
  }

  fs.writeFileSync(file, text);
}

replaceInFile('src/pages/PlaceholderPages.jsx', [
  [
    'export function Assistant({ anime }) { const brain = useMemo(() => createAnimeBrain(anime), [anime]);',
    'export function Assistant({ anime, catalog = [] }) { const brain = useMemo(() => createAnimeBrain(anime, catalog), [anime, catalog]);'
  ]
]);

replaceInFile('src/App.jsx', [
  [
    '<Assistant anime={anime} />',
    '<Assistant anime={anime} catalog={catalog} />'
  ]
]);

console.log('Assistant catalog wiring patched.');
