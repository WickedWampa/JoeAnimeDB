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
const cardsFile = path.join(root, 'src', 'ai', 'genome', 'genomeCards.js');
let text = fs.readFileSync(cardsFile, 'utf8');

if (!text.includes("CORE25_EXPERT_GENOME_CARDS")) {
  text = text.replace(
    "import { CORE100_GENOME_CARDS } from './core100/core100GenomePack';",
    "import { CORE25_EXPERT_GENOME_CARDS } from './core25/core25ExpertGenomePack';\nimport { CORE100_GENOME_CARDS } from './core100/core100GenomePack';"
  );
}

if (!text.includes("...CORE25_EXPERT_GENOME_CARDS")) {
  text = text.replace(
    "export const GENOME_CARDS = [",
    "export const GENOME_CARDS = [\n  ...CORE25_EXPERT_GENOME_CARDS,"
  );
}

if (!text.includes("SPRINT5_DEDUPE_GENOME_CARDS")) {
  text += `\n\n// SPRINT5_DEDUPE_GENOME_CARDS\nconst seenGenomeIds = new Set();\nexport const ACTIVE_GENOME_CARDS = GENOME_CARDS.filter((card) => {\n  if (seenGenomeIds.has(card.id)) return false;\n  seenGenomeIds.add(card.id);\n  return true;\n});\n`;
}

text = text.replaceAll("GENOME_CARDS.find((card)", "ACTIVE_GENOME_CARDS.find((card)");

fs.writeFileSync(cardsFile, text);
console.log('Core 25 Expert Genome Pack connected.');
