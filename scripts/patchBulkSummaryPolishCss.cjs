const fs = require('fs');

const file = 'src/styles/add-anime.css';
let text = fs.readFileSync(file, 'utf8');

const patch = `
/* Bulk Import Summary Polish */
.bulkSummary h3 {
  color: var(--cyan);
  font-size: 24px;
}

.bulkSummaryActions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 12px 0;
}

.bulkSummaryActions button {
  border: 1px solid rgba(55,234,255,.38);
  background: rgba(55,234,255,.10);
  color: var(--cyan);
  border-radius: 999px;
  padding: 9px 13px;
  font-weight: 1000;
  cursor: pointer;
}

.bulkResultRow {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 10px;
  align-items: center;
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 13px;
  background: rgba(255,255,255,.045);
  color: var(--text);
  padding: 9px 11px;
  margin-top: 8px;
  cursor: pointer;
  text-align: left;
}

.bulkResultRow:hover {
  border-color: rgba(55,234,255,.36);
  background: rgba(55,234,255,.07);
}

.bulkResultRow small {
  color: var(--muted);
}

.bulkResultRow b {
  color: var(--cyan);
}
`;

if (!text.includes('Bulk Import Summary Polish')) {
  text += '\n' + patch;
  fs.writeFileSync(file, text);
}

console.log('Bulk import summary styles added.');
