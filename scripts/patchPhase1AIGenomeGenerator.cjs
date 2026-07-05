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
const builder = path.join(root, 'scripts', 'rebuildGenomeRegistry.cjs');

if (fs.existsSync(builder)) {
  let text = fs.readFileSync(builder, 'utf8');

  if (!text.includes("path.join(genomeDir, 'generated')")) {
    text = text.replace(
      "path.join(genomeDir, 'core100')",
      "path.join(genomeDir, 'core100'),\n  path.join(genomeDir, 'generated')"
    );
  }

  fs.writeFileSync(builder, text, 'utf8');
}

const doc = `# Phase 1 — AI Genome Generator

Adds a first-pass draft Genome generator.

## Usage

Heuristic draft only:

\`\`\`cmd
node scripts\\generateGenomeCardForTitle.cjs "Space Dandy"
node scripts\\rebuildGenomeRegistry.cjs
npm run dev
\`\`\`

AI-assisted draft:

\`\`\`cmd
set OPENAI_API_KEY=your_key_here
set OPENAI_MODEL=gpt-4o-mini
node scripts\\generateGenomeCardForTitle.cjs "Lord of Mysteries"
node scripts\\rebuildGenomeRegistry.cjs
npm run dev
\`\`\`

Generated cards are saved to:

\`src/ai/genome/generated/generatedGenomeCards.js\`

and are marked:

\`\`\`js
quality: 'generated'
generated: true
needsReview: true
\`\`\`
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'PHASE_1_AI_GENOME_GENERATOR.md'), doc, 'utf8');

console.log('Phase 1 AI Genome Generator installed.');
console.log('Try: node scripts\\\\generateGenomeCardForTitle.cjs "Space Dandy"');
