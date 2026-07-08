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
const parserFile = path.join(root, 'src', 'ai', 'intentParser.js');

let executor = fs.readFileSync(executorFile, 'utf8');

if (!executor.includes("maybeSimilarRecommendation")) {
  executor = executor.replace(
    "import { answerLibraryQuestion } from './libraryIntelligence';",
    "import { answerLibraryQuestion } from './libraryIntelligence';\nimport { maybeSimilarRecommendation } from './similarityEngine';"
  );
}

if (!executor.includes("SPRINT4_SIMILARITY_FIRST_V3")) {
  executor = executor.replace(
`  const intelligenceAnswer = answerLibraryQuestion(text, anime, catalog);`,
`  // SPRINT4_SIMILARITY_FIRST_V3
  const similarAnswer = maybeSimilarRecommendation(text, anime, catalog);
  if (similarAnswer) {
    return makeTextResult(similarAnswer);
  }

  const intelligenceAnswer = answerLibraryQuestion(text, anime, catalog);`
  );
}

executor = executor.replace(
  "return answerConversationalQuestion({ text: intent.text || '', anime, brain });",
  "return answerConversationalQuestion({ text: intent.text || '', anime, catalog, brain });"
);

fs.writeFileSync(executorFile, executor);

let parser = fs.readFileSync(parserFile, 'utf8');

if (!parser.includes("SPRINT4_SIMILARITY_GUARD_V3")) {
  parser = parser.replace(
`  const lower = raw.toLowerCase();
  const status = normalizeStatus(raw);`,
`  const lower = raw.toLowerCase();
  const status = normalizeStatus(raw);

  // SPRINT4_SIMILARITY_GUARD_V3
  if (/\\b(like|similar to|something like|anime like|show like|shows like)\\b/i.test(raw)) {
    return { kind: 'question', text: raw };
  }`
  );
}

fs.writeFileSync(parserFile, parser);

console.log('Similarity V3 wired.');
console.log('The response will now show: I heard: "<title>" and Matched source: <source>.');
