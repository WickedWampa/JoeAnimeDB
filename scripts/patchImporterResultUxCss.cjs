const fs = require('fs');

const file = 'src/styles/add-anime.css';
let text = fs.readFileSync(file, 'utf8');

const patch = `
.addAnimeResults .addAnimeResult:first-child {
  border-color: rgba(255, 201, 40, .42);
  box-shadow: 0 0 24px rgba(255, 201, 40, .08);
}

.addAnimeResults .addAnimeResult:first-child .importLabel {
  border-color: rgba(255, 201, 40, .58);
  background: linear-gradient(90deg, rgba(255, 201, 40, .18), rgba(255, 234, 150, .10));
  color: var(--gold);
}

.importOwnedBadge {
  display: inline-flex;
  width: fit-content;
  margin-left: 6px;
  margin-bottom: 5px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid rgba(18, 214, 111, .36);
  background: rgba(18, 214, 111, .12);
  color: #8dffbe;
  font-size: 11px;
  font-weight: 1000;
  text-transform: uppercase;
  letter-spacing: .04em;
}

.addAnimeResult.alreadyOwned {
  opacity: .78;
  border-color: rgba(18, 214, 111, .22);
}

.addAnimeResult.alreadyOwned:hover {
  border-color: rgba(18, 214, 111, .44);
  background: rgba(18, 214, 111, .06);
}
`;

if (!text.includes('.importOwnedBadge')) {
  text += '\n' + patch;
  fs.writeFileSync(file, text);
  console.log('Patched importer gold top pick and duplicate badge styles.');
} else {
  console.log('Importer gold/duplicate styles already present.');
}
