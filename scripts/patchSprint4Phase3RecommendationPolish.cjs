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

if (!text.includes("maybeSimilarRecommendation")) {
  text = text.replace(
    "import { answerLibraryQuestion } from './libraryIntelligence';",
    "import { answerLibraryQuestion } from './libraryIntelligence';\nimport { maybeSimilarRecommendation } from './similarityEngine';"
  );
}

if (!text.includes("SPRINT4_SIMILARITY_FIRST")) {
  text = text.replace(
`  const intelligenceAnswer = answerLibraryQuestion(text, anime, catalog);`,
`  // SPRINT4_SIMILARITY_FIRST
  const similarAnswer = maybeSimilarRecommendation(text, anime, catalog);
  if (similarAnswer) {
    return makeTextResult(similarAnswer);
  }

  const intelligenceAnswer = answerLibraryQuestion(text, anime, catalog);`
  );
}

text = text.replace(
  "return answerConversationalQuestion({ text: intent.text || '', anime, brain });",
  "return answerConversationalQuestion({ text: intent.text || '', anime, catalog, brain });"
);

fs.writeFileSync(executorFile, text);
console.log('Sprint 4 Phase 3 recommendation polish applied.');
