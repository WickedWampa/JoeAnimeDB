const fs = require('fs');

const file = 'src/styles/joeai-cards.css';
let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';

const patch = `
/* JoeAI Bulk Result Cards */
.joeaiBulkResult {
  max-width: 760px;
  display: grid;
  gap: 14px;
}

.joeaiBulkHeader h2 {
  margin: 0 0 10px;
  color: var(--cyan);
  font-size: 24px;
}

.joeaiBulkStats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.joeaiBulkStats span {
  border-radius: 999px;
  padding: 6px 10px;
  background: rgba(0,0,0,.28);
  border: 1px solid rgba(55,234,255,.22);
  color: #d9fbff;
  font-size: 12px;
  font-weight: 1000;
}

.joeaiBulkSection {
  display: grid;
  gap: 8px;
}

.joeaiBulkSection h3 {
  margin: 0;
  font-size: 15px;
  color: rgba(234,248,255,.78);
  text-transform: uppercase;
  letter-spacing: .08em;
}

.joeaiBulkRow {
  display: grid;
  grid-template-columns: 30px 1fr;
  align-items: center;
  gap: 10px;
  border-radius: 14px;
  padding: 9px 11px;
  border: 1px solid rgba(255,255,255,.09);
  background: rgba(255,255,255,.045);
}

.joeaiBulkRow span {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  font-weight: 1000;
}

.joeaiBulkRow.added span {
  background: rgba(18,214,111,.14);
  color: #8dffbe;
}

.joeaiBulkRow.skipped span {
  background: rgba(255,201,40,.14);
  color: var(--gold);
}

.joeaiBulkRow.failed span {
  background: rgba(255,92,92,.14);
  color: #ffb0b0;
}

.joeaiBulkRow strong {
  color: var(--text);
  line-height: 1.35;
}
`;

if (!text.includes('JoeAI Bulk Result Cards')) {
  text += '\n' + patch;
  fs.mkdirSync('src/styles', { recursive: true });
  fs.writeFileSync(file, text);
}

console.log('JoeAI bulk result card styles patched.');
