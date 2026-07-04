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
let cards = fs.readFileSync(cardsFile, 'utf8');

// Add a stable legacy export name so registry can import the current cards safely.
if (!cards.includes('export const LEGACY_GENOME_CARDS')) {
  cards += `\n\n// SPRINT5_LEGACY_GENOME_EXPORT\nexport const LEGACY_GENOME_CARDS = GENOME_CARDS;\n`;
}

fs.writeFileSync(cardsFile, cards);

const engineFile = path.join(root, 'src', 'ai', 'genome', 'genomeEngine.js');
let engine = fs.readFileSync(engineFile, 'utf8');

// Switch the engine's findGenomeCard import to the registry lookup.
if (!engine.includes("findGenomeCardFromRegistry")) {
  engine = engine.replace(
    "import { findGenomeCard } from './genomeCards';",
    "import { findGenomeCardFromRegistry as findGenomeCard } from './genomeRegistry';"
  );
}

fs.writeFileSync(engineFile, engine);

const recFile = path.join(root, 'src', 'ai', 'knowledgeFirstRecommender.js');
if (fs.existsSync(recFile)) {
  let rec = fs.readFileSync(recFile, 'utf8');

  if (rec.includes("import { findGenomeCard } from './genome/genomeCards';")) {
    rec = rec.replace(
      "import { findGenomeCard } from './genome/genomeCards';",
      "import { findGenomeCardFromRegistry as findGenomeCard } from './genome/genomeRegistry';"
    );
  }

  fs.writeFileSync(recFile, rec);
}

const docFile = path.join(root, 'src', 'ai', 'SPRINT_5_GENOME_REGISTRY.md');
const doc = `# Sprint 5 — Genome Registry System

This adds a central Genome Registry.

## Purpose

The registry merges Genome data in priority order:

1. Core25 Expert Cards
2. Enhanced Packs
3. Core100 Starter Cards
4. Legacy Starter Cards

The first card with a matching id wins.

## Why this matters

This lets us add packs without manually rewriting recommendation logic every time.

Future packs should live under:

- src/ai/genome/enhanced/fantasy/
- src/ai/genome/enhanced/sports/
- src/ai/genome/enhanced/scifi/
- src/ai/genome/enhanced/romance/
- src/ai/genome/enhanced/action/
- src/ai/genome/enhanced/classics/

Then the registry can become the single source of truth for JoeAI recommendations.
`;

fs.writeFileSync(docFile, doc);

console.log('Sprint 5 Genome Registry System applied.');
console.log('Engine now resolves Genome cards through genomeRegistry.js.');
