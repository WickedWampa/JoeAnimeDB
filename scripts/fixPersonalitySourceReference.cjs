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
const file = path.join(root, 'src', 'ai', 'joeAIPersonalityEngine.js');
let text = fs.readFileSync(file, 'utf8');

text = text.replace(
  "const knowledgeOpinion = knowledgeOpinionFor(source, candidate);",
  "const knowledgeOpinion = knowledgeOpinionFor(window.__joeaiCurrentSource || {}, candidate);"
);

text = text.replace(
  "function formatOpinionEntry(sourceProfile, entry, index) {",
  "function formatOpinionEntry(sourceProfile, entry, index, source) {"
);

text = text.replace(
  "const opinion = opinionFor(sourceProfile, item, reasons, match);",
  "window.__joeaiCurrentSource = source;\n  const opinion = opinionFor(sourceProfile, item, reasons, match);"
);

text = text.replace(
  "inLibrary.map((entry, index) => formatOpinionEntry(source, entry, index)).join('\\n\\n')",
  "inLibrary.map((entry, index) => formatOpinionEntry(profile, entry, index, source)).join('\\n\\n')"
);

text = text.replace(
  "discoveries.map((entry, index) => formatOpinionEntry(source, entry, index)).join('\\n\\n')",
  "discoveries.map((entry, index) => formatOpinionEntry(profile, entry, index, source)).join('\\n\\n')"
);

fs.writeFileSync(file, text);
console.log('Fixed missing source reference in joeAIPersonalityEngine.js.');
