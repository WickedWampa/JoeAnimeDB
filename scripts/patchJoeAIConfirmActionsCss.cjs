const fs = require('fs');

const file = 'src/styles/joeai-cards.css';
let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';

const patch = `
/* JoeAI Confirmation Cards */
.joeaiConfirmCard {
  max-width: 720px;
  display: grid;
  gap: 14px;
}

.joeaiConfirmHeader h2 {
  margin: 0 0 8px;
  color: var(--cyan);
  font-size: 24px;
}

.joeaiConfirmHeader p {
  margin: 0;
  color: rgba(234, 248, 255, .82);
  line-height: 1.45;
}

.joeaiConfirmList {
  display: grid;
  gap: 8px;
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 16px;
  background: rgba(0,0,0,.18);
  padding: 12px;
}

.joeaiConfirmList span {
  color: var(--text);
  font-weight: 800;
}

.joeaiConfirmActions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.joeaiConfirmActions button {
  border: 1px solid rgba(255,255,255,.14);
  background: rgba(255,255,255,.07);
  color: var(--text);
  border-radius: 999px;
  padding: 10px 14px;
  font-weight: 1000;
  cursor: pointer;
}

.joeaiConfirmActions button.primary {
  border-color: rgba(55,234,255,.42);
  background: rgba(55,234,255,.13);
  color: var(--cyan);
}

.joeaiConfirmActions button:hover {
  transform: translateY(-1px);
  box-shadow: 0 0 20px rgba(55,234,255,.10);
}
`;

if (!text.includes('JoeAI Confirmation Cards')) {
  text += '\n' + patch;
  fs.mkdirSync('src/styles', { recursive: true });
  fs.writeFileSync(file, text);
}

console.log('JoeAI confirmation card styles patched.');
