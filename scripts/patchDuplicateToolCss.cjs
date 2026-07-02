const fs = require('fs');

const file = 'src/styles/add-anime.css';
let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';

const patch = `
/* Duplicate merge tool */
.duplicateTool {
  border: 1px solid rgba(255, 201, 40, .22);
  border-radius: 18px;
  background: rgba(255, 201, 40, .055);
  margin-bottom: 16px;
  padding: 12px;
}

.duplicateToggle {
  border: 1px solid rgba(255, 201, 40, .35);
  background: rgba(255, 201, 40, .10);
  color: var(--gold);
  border-radius: 999px;
  padding: 10px 14px;
  font-weight: 1000;
  cursor: pointer;
}

.duplicatePanel {
  margin-top: 12px;
  display: grid;
  gap: 14px;
}

.duplicatePanel p {
  color: var(--muted);
  margin: 0;
}

.duplicateGroup {
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 18px;
  padding: 14px;
  background: rgba(0,0,0,.18);
}

.duplicateGroup h3 {
  margin: 0 0 12px;
}

.duplicateChoices {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
}

.duplicateChoices label {
  display: grid;
  grid-template-columns: auto 52px 1fr;
  gap: 10px;
  align-items: center;
  border: 1px solid rgba(255,255,255,.10);
  border-radius: 14px;
  padding: 9px;
  background: rgba(255,255,255,.04);
  cursor: pointer;
}

.duplicateChoices label.selected {
  border-color: rgba(55,234,255,.42);
  background: rgba(55,234,255,.08);
}

.duplicatePoster {
  position: relative;
  width: 52px;
  height: 70px;
  border-radius: 10px;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, rgba(55,234,255,.18), rgba(255,92,200,.16));
}

.duplicatePoster img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.duplicateChoices strong,
.duplicateChoices small {
  display: block;
}

.duplicateChoices small {
  color: var(--muted);
  margin-top: 4px;
}

.duplicateGroup > button {
  border: 1px solid rgba(55,234,255,.32);
  background: rgba(55,234,255,.10);
  color: var(--cyan);
  border-radius: 999px;
  padding: 9px 14px;
  font-weight: 1000;
  cursor: pointer;
}
`;

if (!text.includes('.duplicateTool')) {
  text += '\n' + patch;
  fs.writeFileSync(file, text);
}

console.log('Patched duplicate merge styles.');
