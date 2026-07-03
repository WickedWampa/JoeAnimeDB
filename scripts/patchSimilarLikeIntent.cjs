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
const parserFile = path.join(root, 'src', 'ai', 'intentParser.js');
let text = fs.readFileSync(parserFile, 'utf8');

// Similarity prompts must NOT fall into the generic recommendation intent.
// They need to go through commandExecutor's question path so similarityEngine can answer.
if (!text.includes("similarityPrompt")) {
  text = text.replace(
`  if (lower.includes('help') || lower.includes('what can you do')) {
    return { kind: 'help' };
  }`,
`  if (lower.includes('help') || lower.includes('what can you do')) {
    return { kind: 'help' };
  }

  const similarityPrompt =
    /\\b(like|similar to|something like|show like|anime like|show me something like)\\b/i.test(raw);

  if (similarityPrompt) {
    return { kind: 'question', text: raw };
  }`
  );
}

fs.writeFileSync(parserFile, text);
console.log('Fixed similar-like prompts so they route to Anime DNA similarity instead of generic recommendations.');
