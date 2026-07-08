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
const file = path.join(root, 'src', 'ai', 'knowledgeFirstRecommender.js');

let text = fs.readFileSync(file, 'utf8');

if (!text.includes("maybeGenomeIntentRecommendation")) {
  text = text.replace(
    "import { findGenomeCardFromRegistry as findGenomeCard } from './genome/genomeRegistry';",
    "import { findGenomeCardFromRegistry as findGenomeCard } from './genome/genomeRegistry';\nimport { maybeGenomeIntentRecommendation } from './joeAIIntentEngine';"
  );
}

const oldBlock = `export function maybeKnowledgeFirstRecommendation(question = '', anime = [], catalog = []) {
  const title = extractSimilarityTitle(question);
  if (!title) return null;

  return recommendKnowledgeFirst({ query: title, anime, catalog }).text;
}`;

const newBlock = `export function maybeKnowledgeFirstRecommendation(question = '', anime = [], catalog = []) {
  const title = extractSimilarityTitle(question);
  if (!title) {
    return maybeGenomeIntentRecommendation(question);
  }

  return recommendKnowledgeFirst({ query: title, anime, catalog }).text;
}`;

if (!text.includes("return maybeGenomeIntentRecommendation(question);")) {
  if (!text.includes(oldBlock)) {
    console.error('Could not find maybeKnowledgeFirstRecommendation block. No changes made.');
    process.exit(1);
  }
  text = text.replace(oldBlock, newBlock);
}

fs.writeFileSync(file, text, 'utf8');

const doc = `# Sprint 6 — JoeAI Intent Engine v1

Adds intent-based recommendations for prompts without a specific source title.

## Examples

- recommend something funny
- I want something comforting
- recommend psychological anime
- I want mind games
- recommend cyberpunk
- I want something sad

## Why

Previously, prompts like "recommend something funny" fell through to generic Anime DNA recommendations.

Now JoeAI maps human language to Genome traits and recommends from the Genome Registry.
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'SPRINT_6_INTENT_ENGINE.md'), doc, 'utf8');

console.log('Sprint 6 Intent Engine v1 applied.');
console.log('Test: recommend something funny');
