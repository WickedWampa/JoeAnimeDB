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
const doc = `# Sprint 8 — JoeAI Knowledge Modules

This introduces first-class Knowledge Modules.

## Why

The Genome Registry is good for scoring, but JoeAI also needs expert-owned knowledge areas:

- Comedy Expert
- Romance Expert
- Horror Expert

Each module can own:

- Genome cards
- Relationships
- Joe Notes
- Specialized traits

## New files

- src/ai/modules/index.js
- src/ai/modules/comedy/index.js
- src/ai/modules/romance/index.js
- src/ai/modules/horror/index.js

## First module cards

Comedy:
- Space Dandy
- Saiki K
- Hinamatsuri

Romance / Spicy Rom-Com:
- Please Put Them On, Takamine-san
- Nagatoro
- More than a Married Couple, but Not Lovers

Horror:
- Higurashi
- Shiki
- Another

## Next step

Wire these modules into the Registry Builder so module cards become active Genome Cards automatically.
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'SPRINT_8_KNOWLEDGE_MODULES.md'), doc, 'utf8');

console.log('Sprint 8 Knowledge Modules installed.');
console.log('Next: wire modules into Registry Builder.');
