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

const recFile = path.join(root, 'src', 'ai', 'knowledgeFirstRecommender.js');
let rec = fs.readFileSync(recFile, 'utf8');

if (!rec.includes("compareGenome")) {
  rec = rec.replace(
    "import { sameFranchise, enrichAnimeKnowledge } from './knowledge/knowledgeRegistry';",
    "import { sameFranchise, enrichAnimeKnowledge } from './knowledge/knowledgeRegistry';\nimport { compareGenome } from './genome/genomeEngine';\nimport { findGenomeCard } from './genome/genomeCards';"
  );
}

if (!rec.includes("SPRINT5_GENOME_SCORING")) {
  rec = rec.replace(
`  const candidateDna = buildAnimeDNA(item);
  const dnaScore = dnaSimilarity(sourceDna, candidateDna);
  const knowledge = boostForKnowledge(source, item);
  const match = Math.min(0.99, dnaScore + knowledge.boost);`,
`  // SPRINT5_GENOME_SCORING
  const candidateDna = buildAnimeDNA(item);
  const dnaScore = dnaSimilarity(sourceDna, candidateDna);
  const sourceGenome = findGenomeCard(source);
  const candidateGenome = findGenomeCard(item);
  const genome = sourceGenome && candidateGenome ? compareGenome(sourceGenome, candidateGenome) : null;
  const knowledge = boostForKnowledge(source, item);
  const match = Math.min(0.99, Math.max(dnaScore + knowledge.boost, genome ? genome.score : 0));`
  );

  rec = rec.replace(
`  if (knowledge.reason) {
    reasons.unshift('Curated knowledge match');
  }`,
`  if (genome?.reasons?.length) {
    reasons.unshift(...genome.reasons.slice(0, 3));
  }

  if (knowledge.reason) {
    reasons.unshift('Curated knowledge match');
  }`
  );
}

fs.writeFileSync(recFile, rec);

console.log('Sprint 5 Phase 1 applied: Anime Genome foundation.');
