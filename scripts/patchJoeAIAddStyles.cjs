const fs = require('fs');

const file = 'src/styles/joeai-cards.css';
const append = '\n.joeaiRecActions {\n  margin-top: 14px;\n  display: flex;\n  gap: 10px;\n  flex-wrap: wrap;\n}\n\n.joeaiRecActions button {\n  border: 1px solid rgba(48, 229, 255, 0.34);\n  border-radius: 999px;\n  padding: 8px 14px;\n  background: rgba(48, 229, 255, 0.12);\n  color: #eaf8ff;\n  font-weight: 900;\n  cursor: pointer;\n}\n\n.joeaiRecActions button:hover:not(:disabled) {\n  border-color: rgba(48, 229, 255, 0.82);\n  color: var(--accent, #30e5ff);\n  box-shadow: 0 0 18px rgba(48, 229, 255, 0.18);\n}\n\n.joeaiRecActions button:disabled {\n  opacity: 0.55;\n  cursor: wait;\n}\n';

let text = fs.readFileSync(file, 'utf8');
if (!text.includes('.joeaiRecActions')) {
  text += '\n' + append + '\n';
  fs.writeFileSync(file, text);
  console.log('Added JoeAI action button styles.');
} else {
  console.log('JoeAI action button styles already exist.');
}
