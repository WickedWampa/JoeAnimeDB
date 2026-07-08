const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function findRoot(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'src'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const root = findRoot(process.cwd());

function patchFile(rel, fn) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    console.warn('Missing:', rel);
    return false;
  }
  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before);
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    console.log('Patched:', rel);
  } else {
    console.log('No change needed:', rel);
  }
  return true;
}

const goldFile = path.join(root, 'src', 'ai', 'genome', 'gold', 'goldStandardGenomeCards.js');
if (!fs.existsSync(goldFile)) {
  console.error('Missing src/ai/genome/gold/goldStandardGenomeCards.js');
  console.error('Put the Top 20 Gold Genome file there first, then rerun this script.');
  process.exit(1);
}

const builderFile = path.join(root, 'scripts', 'rebuildGenomeRegistry.cjs');
if (fs.existsSync(builderFile)) {
  let builder = fs.readFileSync(builderFile, 'utf8');

  if (!builder.includes('GOLD_STANDARD_GENOME_CARDS')) {
    builder = builder.replace(
      "${imports.join('\\n')}",
      "${imports.join('\\n')}\\nimport { GOLD_STANDARD_GENOME_CARDS } from './gold/goldStandardGenomeCards';"
    );
  }

  if (!builder.includes('mergeGenomeCardsByPriority')) {
    builder = builder.replace(
      "const output = `",
      `function mergeGenomeCardsByPrioritySnippet() {
  return \`function mergeGenomeCardsByPriority(...groups) {
  const byId = new Map();

  for (const group of groups) {
    for (const card of group || []) {
      if (!card?.id) continue;
      if (!byId.has(card.id)) byId.set(card.id, card);
    }
  }

  return [...byId.values()];
}

\`;
}

const output = \``
    );

    builder = builder.replace(
      "${imports.join('\\n')}\\n",
      "${imports.join('\\n')}\\n${mergeGenomeCardsByPrioritySnippet()}"
    );
  }

  builder = builder.replaceAll(
    "export const ACTIVE_GENOME_REGISTRY = [...MODULE_GENOME_CARDS, ...GENERATED_GENOME_CARDS];",
    "export const ACTIVE_GENOME_REGISTRY = mergeGenomeCardsByPriority(GOLD_STANDARD_GENOME_CARDS, MODULE_GENOME_CARDS, GENERATED_GENOME_CARDS);"
  );

  builder = builder.replaceAll(
    "export const ACTIVE_GENOME_REGISTRY = [...CURATED_GENOME_CARDS, ...GENERATED_GENOME_CARDS];",
    "export const ACTIVE_GENOME_REGISTRY = mergeGenomeCardsByPriority(GOLD_STANDARD_GENOME_CARDS, CURATED_GENOME_CARDS, GENERATED_GENOME_CARDS);"
  );

  fs.writeFileSync(builderFile, builder, 'utf8');
  console.log('Patched scripts/rebuildGenomeRegistry.cjs');
}

// Patch generated registry now too.
patchFile('src/ai/genome/genomeRegistry.js', (text) => {
  let out = text;

  if (!out.includes("goldStandardGenomeCards")) {
    const generatedImport = /import\s+\{ GENERATED_GENOME_CARDS \}\s+from\s+['"]\.\/generated\/generatedGenomeCards['"];/;
    if (generatedImport.test(out)) {
      out = out.replace(generatedImport, (m) => m + "\nimport { GOLD_STANDARD_GENOME_CARDS } from './gold/goldStandardGenomeCards';");
    } else {
      out = "import { GOLD_STANDARD_GENOME_CARDS } from './gold/goldStandardGenomeCards';\n" + out;
    }
  }

  if (!out.includes("function mergeGenomeCardsByPriority")) {
    const helper = `function mergeGenomeCardsByPriority(...groups) {
  const byId = new Map();

  for (const group of groups) {
    for (const card of group || []) {
      if (!card?.id) continue;
      if (!byId.has(card.id)) byId.set(card.id, card);
    }
  }

  return [...byId.values()];
}

`;
    const activeMarker = "export const ACTIVE_GENOME_REGISTRY";
    if (out.includes(activeMarker)) out = out.replace(activeMarker, helper + activeMarker);
    else out += "\n" + helper;
  }

  out = out.replace(
    /export const ACTIVE_GENOME_REGISTRY = \[\s*\.\.\.MODULE_GENOME_CARDS,\s*\.\.\.GENERATED_GENOME_CARDS\s*\];/g,
    "export const ACTIVE_GENOME_REGISTRY = mergeGenomeCardsByPriority(GOLD_STANDARD_GENOME_CARDS, MODULE_GENOME_CARDS, GENERATED_GENOME_CARDS);"
  );

  out = out.replace(
    /export const ACTIVE_GENOME_REGISTRY = \[\s*\.\.\.CURATED_GENOME_CARDS,\s*\.\.\.GENERATED_GENOME_CARDS\s*\];/g,
    "export const ACTIVE_GENOME_REGISTRY = mergeGenomeCardsByPriority(GOLD_STANDARD_GENOME_CARDS, CURATED_GENOME_CARDS, GENERATED_GENOME_CARDS);"
  );

  return out;
});

// Try rebuild after builder patch.
if (fs.existsSync(builderFile)) {
  try {
    execFileSync(process.execPath, [builderFile], { cwd: root, stdio: 'inherit' });
  } catch (error) {
    console.warn('Registry rebuild failed. Direct registry patch was still applied.');
  }
}

const check = `const fs = require('fs');
const path = require('path');

const root = process.cwd();
function ok(label, condition) { console.log(label + ':', condition ? 'OK' : 'MISSING'); }

const gold = path.join(root, 'src', 'ai', 'genome', 'gold', 'goldStandardGenomeCards.js');
const registry = path.join(root, 'src', 'ai', 'genome', 'genomeRegistry.js');
const builder = path.join(root, 'scripts', 'rebuildGenomeRegistry.cjs');

ok('gold file', fs.existsSync(gold));

const registryText = fs.existsSync(registry) ? fs.readFileSync(registry, 'utf8') : '';
const builderText = fs.existsSync(builder) ? fs.readFileSync(builder, 'utf8') : '';

ok('registry imports gold', registryText.includes('GOLD_STANDARD_GENOME_CARDS'));
ok('registry priority merge', registryText.includes('mergeGenomeCardsByPriority'));
ok('builder mentions gold', builderText.includes('GOLD_STANDARD_GENOME_CARDS'));

console.log('');
console.log('Try: recommend One Piece');
console.log('Try: recommend Naruto');
console.log('Try: recommend Bleach');
`;
fs.writeFileSync(path.join(root, 'scripts', 'checkGoldGenomeWiring.cjs'), check, 'utf8');

const doc = `# Wire Gold Genomes

Wires:

\`\`\`text
src/ai/genome/gold/goldStandardGenomeCards.js
\`\`\`

into the active Genome registry.

Priority:

\`\`\`text
Gold > Curated/Module > Generated
\`\`\`

## Test

\`\`\`cmd
node scripts\\checkGoldGenomeWiring.cjs
npm run dev
\`\`\`

Then ask:

\`\`\`text
recommend One Piece
recommend Naruto
recommend Bleach
\`\`\`
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'WIRE_GOLD_GENOMES.md'), doc, 'utf8');

console.log('');
console.log('Gold Genome wiring installed.');
console.log('Run: node scripts\\\\checkGoldGenomeWiring.cjs');
