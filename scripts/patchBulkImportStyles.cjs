const fs = require('fs');

const file = 'src/styles/add-anime.css';
let text = fs.readFileSync(file, 'utf8');

const patch = `
/* Bulk Paste Importer */
.importTabs {
  display: flex;
  gap: 10px;
  margin: 16px 0;
  flex-wrap: wrap;
}

.importTabs button {
  border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.05);
  color: var(--text);
  border-radius: 999px;
  padding: 9px 14px;
  font-weight: 1000;
  cursor: pointer;
}

.importTabs button.active {
  border-color: rgba(55,234,255,.45);
  background: rgba(55,234,255,.12);
  color: var(--cyan);
}

.bulkImporter {
  display: grid;
  gap: 14px;
}

.bulkControls {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 12px;
  flex-wrap: wrap;
}

.bulkControls select,
.bulkControls button {
  border: 1px solid rgba(55,234,255,.26);
  background: rgba(10,17,27,.88);
  color: var(--text);
  border-radius: 13px;
  padding: 11px 14px;
  font-weight: 900;
}

.bulkControls button {
  cursor: pointer;
}

.bulkControls button:hover:not(:disabled) {
  color: var(--cyan);
  border-color: rgba(55,234,255,.48);
}

.bulkControls button:disabled {
  opacity: .55;
  cursor: wait;
}

.bulkTextarea {
  width: 100%;
  min-height: 250px;
  resize: vertical;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 18px;
  background: rgba(3,9,18,.92);
  color: var(--text);
  padding: 16px;
  outline: none;
  line-height: 1.45;
}

.bulkTextarea:focus {
  border-color: rgba(55,234,255,.58);
  box-shadow: 0 0 0 3px rgba(55,234,255,.10);
}

.bulkProgress {
  border: 1px solid rgba(55,234,255,.22);
  border-radius: 18px;
  padding: 12px;
  background: rgba(55,234,255,.06);
}

.bulkBar {
  height: 14px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255,255,255,.08);
}

.bulkBar div {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--cyan), var(--pink));
  transition: width 220ms ease;
}

.bulkProgress p {
  margin: 8px 0 0;
  color: var(--muted);
}

.bulkSummary {
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 18px;
  padding: 14px;
  background: rgba(255,255,255,.045);
}

.bulkSummary h3 {
  margin: 0 0 10px;
}

.bulkSummaryStats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.bulkSummaryStats span {
  border-radius: 999px;
  padding: 5px 9px;
  background: rgba(0,0,0,.35);
  border: 1px solid rgba(55,234,255,.22);
  color: #d9fbff;
  font-size: 12px;
  font-weight: 900;
}

.bulkSummary details {
  margin-top: 8px;
}

.bulkSummary summary {
  cursor: pointer;
  font-weight: 1000;
  color: var(--cyan);
}

.bulkSummary p {
  margin: 6px 0 0;
  color: var(--muted);
}
`;

if (!text.includes('Bulk Paste Importer')) {
  text += '\n' + patch;
  fs.writeFileSync(file, text);
}

console.log('Added bulk importer styles.');
