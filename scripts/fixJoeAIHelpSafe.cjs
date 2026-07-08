const fs = require('fs');
const path = require('path');

function findRoot(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'src'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function findFunctionEnd(text, startIndex) {
  const open = text.indexOf('{', startIndex);
  if (open === -1) return -1;

  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) return i + 1;
  }
  return -1;
}

const root = findRoot(process.cwd());
const file = path.join(root, 'src', 'ai', 'commandExecutor.js');
let text = fs.readFileSync(file, 'utf8');

const safeHelp = `export function answerHelp() {
  return makeTextResult([
    '🍜 JoeAI — Your Anime Brain',
    '',
    'I can manage your library, analyze your taste, and recommend anime by vibe — not just genre.',
    '',
    '🎭 Knowledge-First Recommendations',
    '• I want to watch something like Dorohedoro',
    '• recommend something like Bleach',
    '• I want something like Initial D',
    '• recommend something like Frieren',
    '',
    '📚 Manage Library',
    '• add Frieren as completed',
    '• I finished World Trigger',
    '• I am watching Magi',
    '• add as completed Bleach, Naruto, One Piece',
    '',
    '📊 Analyze Collection',
    '• analyze my library',
    '• how much anime have I watched?',
    '• what are my top genres?',
    '• what studio do I watch most?',
    '• show me unrated anime',
    '',
    '🧠 Critic / Knowledge Mode',
    '• explain why people love Dorohedoro',
    '• what makes Bleach special?',
    '• why should I watch Made in Abyss?',
    '',
    '🧬 Coming Soon: Anime Genome',
    '• smarter recommendations by domain, mood, atmosphere, and emotional tone',
    '• better separation between street racing, soccer, boxing, and other domains',
    '• Core 100 knowledge profiles',
    '',
    'Current brain: Library Intelligence + Anime DNA + Critic Mode + Personality Engine + Knowledge-First recommendations + automatic knowledge enrichment.'
  ].join('\\n'));
}`;

const start = text.indexOf('export function answerHelp');
if (start !== -1) {
  const end = findFunctionEnd(text, start);
  if (end === -1) {
    console.error('Found answerHelp but could not find the end of the function. No changes made.');
    process.exit(1);
  }
  text = text.slice(0, start) + safeHelp + text.slice(end);
} else {
  // Insert before first local helper if answerHelp got removed.
  const marker = text.indexOf('function localCountBy');
  if (marker === -1) {
    console.error('Could not find answerHelp or function localCountBy. No changes made.');
    process.exit(1);
  }
  text = text.slice(0, marker) + safeHelp + '\n\n' + text.slice(marker);
}

// Avoid duplicate answerHelp definitions.
const first = text.indexOf('export function answerHelp');
const second = text.indexOf('export function answerHelp', first + 1);
if (second !== -1) {
  const endSecond = findFunctionEnd(text, second);
  if (endSecond !== -1) {
    text = text.slice(0, second) + text.slice(endSecond);
  }
}

fs.writeFileSync(file, text);
console.log('Safe JoeAI help restored. This uses makeTextResult so it cannot break the Assistant UI help-card renderer.');
