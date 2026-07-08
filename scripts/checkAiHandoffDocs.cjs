const fs = require('fs');
const files = [
  'AI_SESSION_START.md',
  'AI_CONTINUITY_GUIDE.md',
  'CURRENT_STATUS.md',
  'AI_HANDOFF_NEXT_CHAT.md',
  'DECISIONS.md',
  'KNOWN_BUGS.md',
  'ROADMAP.md',
  'CHANGELOG.md',
  'PROJECT_VISION.md'
];

for (const file of files) {
  console.log(file + ':', fs.existsSync(file) ? 'OK' : 'MISSING');
}

console.log('');
console.log('Hand this to the next chat: AI_HANDOFF_NEXT_CHAT.md');

