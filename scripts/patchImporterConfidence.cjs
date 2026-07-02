const fs = require('fs');

const file = 'src/pages/LibraryPage.jsx';
let text = fs.readFileSync(file, 'utf8');

text = text.replaceAll(
  "{result.importLabel || 'Related'}\n                  </span>\n                  <strong>{result.title}</strong>",
  "{result.importConfidence ? `${result.importConfidence}% · ` : ''}{result.importLabel || 'Related'}\n                  </span>\n                  <strong>{result.title}</strong>"
);

text = text.replaceAll(
  "{selectedResult.importLabel && <span>{selectedResult.importLabel}</span>}",
  "{selectedResult.importLabel && <span>{selectedResult.importConfidence ? `${selectedResult.importConfidence}% · ` : ''}{selectedResult.importLabel}</span>}"
);

fs.writeFileSync(file, text);
console.log('Patched importer confidence display.');
