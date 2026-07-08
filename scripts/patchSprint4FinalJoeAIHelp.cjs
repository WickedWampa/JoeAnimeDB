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

const root = findRoot(process.cwd());
const file = path.join(root, 'src', 'ai', 'commandExecutor.js');
let text = fs.readFileSync(file, 'utf8');

const newHelp = `export function answerHelp() {
  return {
    type: 'helpCard',
    title: '🍜 JoeAI — Your Anime Brain',
    subtitle: 'I can manage your library, analyze your taste, and recommend anime by vibe — not just genre.',
    sections: [
      {
        icon: '🎭',
        title: 'Knowledge-First Recommendations',
        items: [
          'I want to watch something like Dorohedoro',
          'recommend something like Bleach',
          'I want something like Initial D',
          'recommend something like Frieren'
        ]
      },
      {
        icon: '🧠',
        title: 'Anime Critic Mode',
        items: [
          'explain why people love Dorohedoro',
          'what makes Bleach special?',
          'why should I watch Made in Abyss?',
          'what kind of vibe is Frieren?'
        ]
      },
      {
        icon: '📚',
        title: 'Manage Library',
        items: [
          'add Frieren as completed',
          'I finished World Trigger',
          'I am watching Magi',
          'add as completed Bleach, Naruto, One Piece'
        ]
      },
      {
        icon: '📊',
        title: 'Analyze Collection',
        items: [
          'analyze my library',
          'how much anime have I watched?',
          'what are my top genres?',
          'what studio do I watch most?',
          'show me unrated anime'
        ]
      },
      {
        icon: '🧬',
        title: 'Coming Soon: Anime Genome',
        items: [
          'recommendations based on domain, mood, atmosphere, and emotional tone',
          'better separation between street racing, soccer, boxing, and other domains',
          'Core 100 knowledge profiles',
          'personal taste learning'
        ]
      }
    ],
    footer: 'JoeAI currently uses Library Intelligence, Anime DNA, Critic Mode, the Personality Engine, Knowledge-First recommendations, and automatic knowledge enrichment. Anime Genome is the next big evolution.'
  };
}`;

text = text.replace(
  /export function answerHelp\(\) \{[\s\S]*?\n\}\n\nfunction localCountBy/,
  `${newHelp}\n\nfunction localCountBy`
);

fs.writeFileSync(file, text);
console.log('JoeAI help card updated for Sprint 4.');
