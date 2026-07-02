const fs = require('fs');

const file = 'src/ai/commandExecutor.js';
let text = fs.readFileSync(file, 'utf8');

const oldHelp = `export function answerHelp() {
  return makeTextResult([
    '🍜 JoeAI can do this now:',
    '',
    '• what should I watch next?',
    '• explain my Anime DNA',
    '• what are my top genres?',
    '• what studio do I watch most?',
    '• what am I watching?',
    '• add Frieren as completed',
    '• I finished World Trigger',
    '• I am watching Magi',
    '• add as completed Bleach, Naruto, One Piece',
    '',
    'I use the same importer as the Library, so I fetch metadata, skip duplicates, and update existing entries.'
  ].join('\\n'));
}`;

const newHelp = `export function answerHelp() {
  return {
    type: 'helpCard',
    title: '🍜 JoeAI Command Center',
    subtitle: 'Tell me what you want in plain English. I can manage your library, analyze your Anime DNA, and recommend your next watch.',
    sections: [
      {
        icon: '🎯',
        title: 'Recommendations',
        items: [
          'what should I watch next?',
          'recommend something dark',
          'give me a random pick'
        ]
      },
      {
        icon: '📚',
        title: 'Manage Library',
        items: [
          'add Frieren as completed',
          'I finished World Trigger',
          'add as completed Bleach, Naruto, One Piece'
        ]
      },
      {
        icon: '📊',
        title: 'Analyze Collection',
        items: [
          'explain my Anime DNA',
          'what are my top genres?',
          'what studio do I watch most?'
        ]
      },
      {
        icon: '🤖',
        title: 'Natural Language',
        items: [
          'I am watching Magi',
          'what am I watching?',
          'library status'
        ]
      }
    ],
    footer: 'I use the same importer as the Library, so I fetch metadata, skip duplicates, and update existing entries.'
  };
}`;

if (text.includes(oldHelp)) {
  text = text.replace(oldHelp, newHelp);
} else {
  console.warn('Could not find exact answerHelp block. Check commandExecutor.js manually.');
}

fs.writeFileSync(file, text);
console.log('Patched JoeAI help response into a rich helpCard payload.');
