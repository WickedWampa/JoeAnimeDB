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

if (!text.includes("CORE100_GENOME_CARDS")) {
  text = text.replace(
    "export const GENOME_VERSION = '0.1.0';",
    "import { CORE100_GENOME_CARDS } from './core100/core100GenomePack';\n\nexport const GENOME_VERSION = '0.1.0';"
  );
}

if (!text.includes("...CORE100_GENOME_CARDS")) {
  text = text.replace(
    "export const GENOME_CARDS = [",
    "export const GENOME_CARDS = [\n  ...CORE100_GENOME_CARDS,"
  );
}

fs.writeFileSync(cardsFile, text);
console.log('Core 100 Genome Pack connected.');
