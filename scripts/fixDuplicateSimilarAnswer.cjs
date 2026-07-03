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
const file = path.join(root, 'src', 'ai', 'commandExecutor.js');
let text = fs.readFileSync(file, 'utf8');

// Remove duplicate similarAnswer blocks inside answerConversationalQuestion.
// Keep only the first occurrence.
const blockRegex = /\n\s*const similarAnswer = maybeSimilarRecommendation\(text, anime, catalog\);\s*\n\s*if \(similarAnswer\) \{\s*\n\s*return makeTextResult\(similarAnswer\);\s*\n\s*\}\s*/g;

let seen = false;
text = text.replace(blockRegex, (match) => {
  if (!seen) {
    seen = true;
    return match;
  }
  return '\n';
});

// If no block exists, insert one before Library Intelligence.
if (!seen) {
  text = text.replace(
    "  const intelligenceAnswer = answerLibraryQuestion(text, anime, catalog);",
    `  const similarAnswer = maybeSimilarRecommendation(text, anime, catalog);
  if (similarAnswer) {
    return makeTextResult(similarAnswer);
  }

  const intelligenceAnswer = answerLibraryQuestion(text, anime, catalog);`
  );
}

fs.writeFileSync(file, text);
console.log('Fixed duplicate similarAnswer declaration in commandExecutor.js.');
