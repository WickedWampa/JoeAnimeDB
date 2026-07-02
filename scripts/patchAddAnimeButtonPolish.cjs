const fs = require('fs');

const file = 'src/styles/add-anime.css';
let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';

const patch = `
/* UI polish: restore Add Anime button and importer controls */
.libraryHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.addAnimeButton {
  border: 1px solid rgba(55, 234, 255, .38);
  background: rgba(55, 234, 255, .10);
  color: var(--cyan);
  border-radius: 14px;
  padding: 12px 17px;
  cursor: pointer;
  font-weight: 1000;
  box-shadow: 0 0 20px rgba(55, 234, 255, .08);
}

.addAnimeButton:hover {
  border-color: rgba(55, 234, 255, .72);
  background: rgba(55, 234, 255, .16);
  box-shadow: 0 0 24px rgba(55, 234, 255, .16);
  transform: translateY(-1px);
}

.emptyState button {
  border: 1px solid rgba(55, 234, 255, .38);
  background: rgba(55, 234, 255, .10);
  color: var(--cyan);
  border-radius: 14px;
  padding: 12px 17px;
  cursor: pointer;
  font-weight: 1000;
}

.importTabs button,
.addAnimeSearch button,
.addAnimeActions button,
.bulkControls button {
  font-family: inherit;
}

.addAnimeModal button {
  font-family: inherit;
}
`;

if (!text.includes('UI polish: restore Add Anime button')) {
  text += '\n' + patch;
  fs.mkdirSync('src/styles', { recursive: true });
  fs.writeFileSync(file, text);
  console.log('Added Add Anime UI polish.');
} else {
  console.log('Add Anime UI polish already present.');
}
