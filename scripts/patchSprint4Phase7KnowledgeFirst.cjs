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
const executorFile = path.join(root, 'src', 'ai', 'commandExecutor.js');

let text = fs.readFileSync(executorFile, 'utf8');

if (!text.includes("maybeKnowledgeFirstRecommendation")) {
  text = text.replace(
    "import { maybeSimilarRecommendation } from './similarityEngine';",
    "import { maybeSimilarRecommendation } from './similarityEngine';\nimport { maybeKnowledgeFirstRecommendation } from './knowledgeFirstRecommender';"
  );
}

// Replace the first similarity call block with knowledge-first call, while preserving fallback.
text = text.replace(
`  const similarAnswer = maybeSimilarRecommendation(text, anime, catalog);
  if (similarAnswer) {
    return makeTextResult(similarAnswer);
  }`,
`  const knowledgeFirstAnswer = maybeKnowledgeFirstRecommendation(text, anime, catalog);
  if (knowledgeFirstAnswer) {
    return makeTextResult(knowledgeFirstAnswer);
  }

  const similarAnswer = maybeSimilarRecommendation(text, anime, catalog);
  if (similarAnswer) {
    return makeTextResult(similarAnswer);
  }`
);

// If repeated patching created multiple knowledgeFirst blocks, keep first only.
const blockRegex = /\n\s*const knowledgeFirstAnswer = maybeKnowledgeFirstRecommendation\(text, anime, catalog\);\s*\n\s*if \(knowledgeFirstAnswer\) \{\s*\n\s*return makeTextResult\(knowledgeFirstAnswer\);\s*\n\s*\}\s*/g;
let seen = false;
text = text.replace(blockRegex, (match) => {
  if (!seen) {
    seen = true;
    return match;
  }
  return '\n';
});

fs.writeFileSync(executorFile, text);
console.log('Sprint 4 Phase 7 wired: Knowledge-First Recommender.');
