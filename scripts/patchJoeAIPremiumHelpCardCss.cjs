const fs = require('fs');

const file = 'src/styles/joeai-cards.css';
let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';

const patch = `
/* JoeAI Premium Help Card */
.joeaiHelpCard {
  max-width: 920px;
  display: grid;
  gap: 16px;
}

.joeaiHelpHero {
  border: 1px solid rgba(55,234,255,.20);
  border-radius: 20px;
  padding: 18px;
  background:
    radial-gradient(circle at top left, rgba(55,234,255,.14), transparent 42%),
    radial-gradient(circle at bottom right, rgba(255,92,200,.10), transparent 42%),
    rgba(255,255,255,.035);
}

.joeaiHelpHero h2 {
  margin: 0 0 8px;
  color: var(--cyan);
  font-size: 28px;
}

.joeaiHelpHero p {
  margin: 0;
  color: rgba(234,248,255,.82);
  line-height: 1.45;
}

.joeaiHelpGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(220px, 1fr));
  gap: 12px;
}

.joeaiHelpSection {
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 18px;
  padding: 14px;
  background: rgba(0,0,0,.20);
}

.joeaiHelpSection h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  color: var(--text);
  font-size: 17px;
}

.joeaiHelpSection h3 span {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  background: rgba(55,234,255,.10);
  border: 1px solid rgba(55,234,255,.20);
}

.joeaiHelpSection div {
  display: grid;
  gap: 8px;
}

.joeaiHelpSection button {
  border: 1px solid rgba(55,234,255,.16);
  background: rgba(55,234,255,.055);
  color: rgba(234,248,255,.88);
  border-radius: 13px;
  padding: 9px 11px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  font-weight: 800;
}

.joeaiHelpSection button:hover {
  border-color: rgba(55,234,255,.40);
  background: rgba(55,234,255,.10);
  color: var(--cyan);
}

.joeaiHelpFooter {
  margin: 0;
  color: rgba(234,248,255,.70);
  line-height: 1.45;
}

@media(max-width: 820px) {
  .joeaiHelpGrid {
    grid-template-columns: 1fr;
  }
}
`;

if (!text.includes('JoeAI Premium Help Card')) {
  text += '\n' + patch;
  fs.mkdirSync('src/styles', { recursive: true });
  fs.writeFileSync(file, text);
}

console.log('Patched JoeAI premium help card styles.');
