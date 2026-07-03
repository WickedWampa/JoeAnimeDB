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

if (!text.includes("answerLibraryQuestion")) {
  text = text.replace(
    "import { importAnimeByTitle, mergeAnimeMetadata } from '../services/animeImporter';",
    "import { importAnimeByTitle, mergeAnimeMetadata } from '../services/animeImporter';\nimport { answerLibraryQuestion } from './libraryIntelligence';"
  );
}

if (!text.includes("const intelligenceAnswer = answerLibraryQuestion")) {
  text = text.replace(
`function answerConversationalQuestion({ text = '', anime = [], brain }) {
  const lower = String(text).toLowerCase();`,
`function answerConversationalQuestion({ text = '', anime = [], catalog = [], brain }) {
  const lower = String(text).toLowerCase();

  const intelligenceAnswer = answerLibraryQuestion(text, anime, catalog);
  if (intelligenceAnswer) {
    return makeTextResult(intelligenceAnswer);
  }`
  );
}

text = text.replace(
  "return answerConversationalQuestion({ text: intent.text || '', anime, brain });",
  "return answerConversationalQuestion({ text: intent.text || '', anime, catalog, brain });"
);

if (!text.includes("'analyze my library'")) {
  text = text.replace(
`          'what studio do I watch most?'`,
`          'what studio do I watch most?',
          'analyze my library',
          'how much anime have I watched?'`
  );
}

fs.writeFileSync(executorFile, text);
console.log('Sprint 4 Phase 1 wired: JoeAI Library Intelligence.');
