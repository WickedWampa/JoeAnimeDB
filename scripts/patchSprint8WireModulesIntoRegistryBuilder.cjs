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
const builderFile = path.join(root, 'scripts', 'rebuildGenomeRegistry.cjs');

if (!fs.existsSync(builderFile)) {
  console.error('Missing scripts/rebuildGenomeRegistry.cjs');
  process.exit(1);
}

let text = fs.readFileSync(builderFile, 'utf8');

// Add src/ai/modules as a scan source.
const oldSources = `const sources = [
  path.join(genomeDir, 'core25'),
  path.join(genomeDir, 'enhanced'),
  path.join(genomeDir, 'core100')
];`;

const newSources = `const sources = [
  path.join(genomeDir, 'core25'),
  path.join(genomeDir, 'enhanced'),
  path.join(genomeDir, 'core100'),
  path.join(root, 'src', 'ai', 'modules')
];`;

if (text.includes(oldSources)) {
  text = text.replace(oldSources, newSources);
}

// Make export detection include module exports.
text = text.replace(
  `name.includes('CARDS') ||
    name.includes('PACK') ||
    name.includes('GENOME')`,
  `name.includes('CARDS') ||
    name.includes('PACK') ||
    name.includes('GENOME') ||
    name.includes('MODULE')`
);

// Replace normalizePack so module.cards arrays work.
const oldNormalize = `function normalizePack(value, source) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((card) => ({ ...card, registrySource: card.registrySource || source }));
  }
  return [];
}`;

const newNormalize = `function normalizePack(value, source) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map((card) => ({ ...card, registrySource: card.registrySource || source }));
  }

  // Sprint 8 Knowledge Modules expose cards under module.cards.
  if (value.cards && Array.isArray(value.cards)) {
    return value.cards.map((card) => ({
      ...card,
      moduleId: value.id,
      moduleName: value.name,
      registrySource: card.registrySource || source,
      joeNote: value.joeNotes?.[card.id] || card.joeNote
    }));
  }

  return [];
}`;

if (text.includes(oldNormalize)) {
  text = text.replace(oldNormalize, newNormalize);
}

fs.writeFileSync(builderFile, text, 'utf8');

const doc = `# Sprint 8 — Registry Builder Module Wiring

This patch wires \`src/ai/modules\` into \`scripts/rebuildGenomeRegistry.cjs\`.

## What changed

The registry builder now scans:

- src/ai/genome/core25
- src/ai/genome/enhanced
- src/ai/genome/core100
- src/ai/modules

It also understands Knowledge Module exports like:

\`\`\`js
export const COMEDY_MODULE = {
  id: 'comedy',
  cards: [...]
}
\`\`\`

and turns \`module.cards\` into active Genome Registry cards.

## Added to module cards

- moduleId
- moduleName
- joeNote
- registrySource

## Run

\`\`\`cmd
node scripts\\patchSprint8WireModulesIntoRegistryBuilder.cjs
node scripts\\rebuildGenomeRegistry.cjs
npm run dev
\`\`\`

## Test

- I want spicy but wholesome
- recommend Space Dandy
- I want horror
- recommend something like Higurashi
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'SPRINT_8_REGISTRY_MODULE_WIRING.md'), doc, 'utf8');

console.log('Registry Builder now scans src/ai/modules and imports module.cards.');
console.log('Next run: node scripts\\\\rebuildGenomeRegistry.cjs');
