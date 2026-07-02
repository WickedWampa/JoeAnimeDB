const fs = require('fs');

const file = 'src/styles/app.css';
let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';

const patch = `
/* Detail modal danger zone */
.dangerZone {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid rgba(255, 92, 92, .22);
}

.removeAnimeButton {
  border: 1px solid rgba(255, 92, 92, .36);
  background: rgba(255, 92, 92, .10);
  color: #ffb0b0;
  border-radius: 999px;
  padding: 10px 15px;
  font-weight: 1000;
  cursor: pointer;
}

.removeAnimeButton:hover {
  border-color: rgba(255, 92, 92, .72);
  box-shadow: 0 0 22px rgba(255, 92, 92, .14);
}

.removeConfirmBox {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  border: 1px solid rgba(255, 92, 92, .28);
  background: rgba(255, 92, 92, .08);
  border-radius: 18px;
  padding: 14px;
}

.removeConfirmBox strong {
  color: #ffd6d6;
}

.removeConfirmBox p {
  color: var(--muted);
  margin: 4px 0 0;
}

.removeConfirmActions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.removeConfirmActions button {
  border: 1px solid rgba(255,255,255,.14);
  background: rgba(255,255,255,.07);
  color: var(--text);
  border-radius: 999px;
  padding: 9px 13px;
  font-weight: 900;
  cursor: pointer;
}

.removeConfirmActions .confirmRemoveButton {
  border-color: rgba(255, 92, 92, .44);
  background: rgba(255, 92, 92, .16);
  color: #ffb0b0;
}

.removeConfirmActions button:disabled {
  opacity: .55;
  cursor: wait;
}
`;

if (!text.includes('.dangerZone')) {
  text += '\n' + patch;
  fs.writeFileSync(file, text);
}

console.log('Patched DetailModal remove button styles.');
