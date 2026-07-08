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
const target = path.join(root, 'src', 'ai', 'joeAIPersonalityEngine.js');
const replacement = path.join(root, 'src', 'ai', 'joeAIPersonalityEngine.genome-first.js');

if (!fs.existsSync(replacement)) {
  console.error('Missing replacement file: src/ai/joeAIPersonalityEngine.genome-first.js');
  process.exit(1);
}

const backup = target + '.backup-before-genome-first';
if (!fs.existsSync(backup)) {
  fs.copyFileSync(target, backup);
}

fs.copyFileSync(replacement, target);

const doc = `# Sprint 5 — Replaced JoeAI Personality Engine

The personality formatter is now Genome-first.

## Priority order

1. Anime Genome Card
2. Knowledge intro
3. Legacy personality preset
4. Anime DNA fallback

## Why

The previous file still displayed:

> I do not have a handcrafted opinion profile...

for titles that already had Genome Cards.

## Backup

Original file backed up to:

\`src/ai/joeAIPersonalityEngine.js.backup-before-genome-first\`

## Test prompts

- recommend something like Ghost in the Shell
- I want something like 86
- I want something like Dorohedoro
- recommend something like Initial D
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'SPRINT_5_PERSONALITY_ENGINE_REPLACED.md'), doc, 'utf8');

console.log('Replaced src/ai/joeAIPersonalityEngine.js with Genome-first version.');
console.log('Backup created if one did not already exist.');
