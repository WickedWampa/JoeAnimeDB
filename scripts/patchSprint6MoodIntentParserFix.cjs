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
const file = path.join(root, 'src', 'ai', 'intentParser.js');

if (!fs.existsSync(file)) {
  console.error('Missing src/ai/intentParser.js');
  process.exit(1);
}

let text = fs.readFileSync(file, 'utf8');

if (!text.includes('SPRINT6_MOOD_RECOMMENDATION_WORDS')) {
  const insertAfter = "  if (lower.includes('what am i watching') || lower.includes('currently watching')) {\n    return { kind: 'watchingList' };\n  }\n";

  const moodBlock = `
  // SPRINT6_MOOD_RECOMMENDATION_WORDS
  // These are recommendation intents even when the user does not say "recommend" or "watch".
  const moodRecommendationWords = [
    'funny',
    'comedy',
    'hilarious',
    'make me laugh',
    'comforting',
    'comfort',
    'cozy',
    'relaxing',
    'chill',
    'wholesome',
    'feel good',
    'mind games',
    'psychological',
    'genius',
    'manipulation',
    'strategy',
    'thriller',
    'sad',
    'depressing',
    'make me cry',
    'cry',
    'emotional',
    'tearjerker',
    'heartbreaking',
    'cyberpunk',
    'sci fi',
    'sci-fi',
    'ai',
    'robots',
    'dark',
    'violent',
    'brutal',
    'gory',
    'gritty',
    'masterpiece',
    'classic',
    'peak',
    'banger',
    'underrated',
    'sports',
    'competition',
    'mastery',
    'training',
    'underdog',
    'rivalry'
  ];

  if (moodRecommendationWords.some((word) => lower.includes(word))) {
    return { kind: 'recommendation' };
  }
`;

  if (!text.includes(insertAfter)) {
    console.error('Could not find watchingList block. No changes made.');
    process.exit(1);
  }

  text = text.replace(insertAfter, insertAfter + moodBlock);
}

fs.writeFileSync(file, text, 'utf8');

const doc = `# Sprint 6 — Mood Intent Parser Fix

## Problem

Prompts like:

- I want something comforting
- I want mind games
- i want something funny

were being classified as generic questions because they did not contain words like "recommend", "watch", or "next".

That meant they bypassed the Intent Engine.

## Fix

The parser now treats mood/vibe words as recommendation intents.

## Test prompts

- I want something comforting
- I want mind games
- i want something funny
- make me cry
- I want cyberpunk
- give me something dark
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'SPRINT_6_MOOD_INTENT_PARSER_FIX.md'), doc, 'utf8');

console.log('Mood intent parser fix applied.');
console.log('Test: I want something comforting');
