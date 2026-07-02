const fs = require('fs');

const file = 'src/styles/joeai-cards.css';
let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';

const patch = `
/* JoeAI Wicked Smart chat input */
.joeaiChatInput textarea {
  width: 100%;
  min-height: 54px;
  max-height: 160px;
  resize: vertical;
  border: 1px solid rgba(48, 229, 255, 0.2);
  border-radius: 16px;
  padding: 12px 16px;
  outline: none;
  background: rgba(1, 6, 14, 0.92);
  color: #eaf8ff;
  font-size: 15px;
  line-height: 1.35;
  font-family: inherit;
}

.joeaiChatInput textarea:focus {
  border-color: rgba(48, 229, 255, 0.72);
  box-shadow: 0 0 0 3px rgba(48, 229, 255, 0.12);
}

.joeaiChatInput textarea::placeholder {
  color: rgba(234, 248, 255, 0.46);
}

.chat.bot,
.chat.user {
  white-space: pre-wrap;
}
`;

if (!text.includes('JoeAI Wicked Smart chat input')) {
  text += '\\n' + patch;
  fs.mkdirSync('src/styles', { recursive: true });
  fs.writeFileSync(file, text);
}

console.log('Patched JoeAI Wicked Smaht styles.');
