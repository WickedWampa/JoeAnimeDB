const fs = require('fs');

const file = 'src/styles/add-anime.css';
let text = fs.readFileSync(file, 'utf8');

const patch = `
.importLabel.bestmatch {
  border-color: rgba(18, 214, 111, .38);
  background: rgba(18, 214, 111, .12);
  color: #8dffbe;
}

.importLabel.otherfranchise,
.importLabel.othermatch {
  border-color: rgba(255, 255, 255, .12);
  background: rgba(255, 255, 255, .045);
  color: rgba(237, 247, 255, .60);
}
`;

if (!text.includes('.importLabel.bestmatch')) {
  text += '\n' + patch;
}

fs.writeFileSync(file, text);
console.log('Patched importer smart label styles.');
