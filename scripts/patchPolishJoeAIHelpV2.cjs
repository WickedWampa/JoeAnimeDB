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
    if (text[i] === '{') depth++;
    if (text[i] === '}') depth--;
    if (depth === 0) return i + 1;
  }
  return -1;
}

const root = findRoot(process.cwd());
const file = path.join(root, 'src', 'ai', 'commandExecutor.js');
let text = fs.readFileSync(file, 'utf8');

const polishedHelp = `export function answerHelp() {
  return makeTextResult([
    '🍜 Hey — I’m JoeAI.',
    '',
    'Think of me as your anime nerd that never forgets your library.',
    '',
    'I can recommend shows by vibe, explain why people love an anime, organize your collection, analyze your taste, and help you figure out what to watch next.',
    '',
    '🔥 Try asking me:',
    '',
    '• I want something like Dorohedoro',
    '• Recommend an anime like Initial D',
    '• Recommend something like Bleach',
    '• Why is Frieren so highly rated?',
    '• What should I binge this weekend?',
    '• Analyze my library',
    '',
    '✅ Available Today',
    '',
    '🎭 Knowledge-First Recommendations',
    '• I want to watch something like Dorohedoro',
    '• recommend something like Bleach',
    '• I want something like Initial D',
    '',
    '🧠 Critic / Knowledge Mode',
    '• explain why people love Dorohedoro',
    '• what makes Bleach special?',
    '• why should I watch Made in Abyss?',
    '',
    '📚 Library Management',
    '• add Frieren as completed',
    '• I finished World Trigger',
    '• I am watching Magi',
    '• add as completed Bleach, Naruto, One Piece',
    '',
    '📊 Collection Analysis',
    '• how much anime have I watched?',
    '• what are my top genres?',
    '• what studio do I watch most?',
    '• show me unrated anime',
    '',
    '🧪 Current JoeAI Brain',
    '✓ Library Intelligence',
    '✓ Anime DNA',
    '✓ Critic Mode',
    '✓ Personality Engine',
    '✓ Knowledge Engine',
    '✓ Knowledge-First Recommendations',
    '✓ Franchise Detection',
    '✓ Automatic Knowledge Enrichment',
    '',
    '🧬 Coming Soon: Project Anime Genome',
    '• recommendations by domain, subdomain, mood, atmosphere, themes, and emotional tone',
    '• better separation between street racing, soccer, boxing, volleyball, and other domains',
    '• Core 100 expert knowledge profiles',
    '• personal taste learning',
    '',
    'Translation: I’m getting smarter every sprint. Ask naturally. I’ll figure it out.'
  ].join('\\n'));
}`;

const start = text.indexOf('export function answerHelp');
if (start === -1) {
  console.error('Could not find answerHelp(). No changes made.');
  process.exit(1);
}

const end = findFunctionEnd(text, start);
if (end === -1) {
  console.error('Could not find end of answerHelp(). No changes made.');
  process.exit(1);
}

text = text.slice(0, start) + polishedHelp + text.slice(end);
fs.writeFileSync(file, text);

console.log('Polished JoeAI help text applied.');
