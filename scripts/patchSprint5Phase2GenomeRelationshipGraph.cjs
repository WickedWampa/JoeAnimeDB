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
const engineFile = path.join(root, 'src', 'ai', 'genome', 'genomeEngine.js');

let engine = fs.readFileSync(engineFile, 'utf8');

if (!engine.includes("relationshipFor")) {
  engine = engine.replace(
    "import { findGenomeCard } from './genomeCards';",
    "import { findGenomeCard } from './genomeCards';\nimport { relationshipFor } from './genomeRelationshipGraph';"
  );
}

if (!engine.includes("SPRINT5_RELATIONSHIP_GRAPH_SCORING")) {
  engine = engine.replace(
`  if (sourceCard.successors?.includes(candidateCard.id)) {
    score += 0.4;
    reasons.unshift('curated successor');
  }

  score += domainPenalty(sourceCard, candidateCard);`,
`  // SPRINT5_RELATIONSHIP_GRAPH_SCORING
  const relationship = relationshipFor(sourceCard.id, candidateCard.id);

  if (relationship?.type === 'direct') {
    score = Math.max(score, relationship.weight);
    reasons.unshift(relationship.reason || 'direct curated relationship');
  } else if (relationship?.type === 'thematic') {
    score = Math.max(score, relationship.weight);
    reasons.unshift(relationship.reason || 'thematic curated relationship');
  } else if (relationship?.type === 'avoid') {
    score -= relationship.penalty || 0.5;
    reasons.unshift(relationship.reason || 'curated avoid relationship');
  } else if (sourceCard.successors?.includes(candidateCard.id)) {
    score += 0.4;
    reasons.unshift('curated successor');
  }

  score += domainPenalty(sourceCard, candidateCard);`
  );
}

fs.writeFileSync(engineFile, engine);

// Update Sprint 5 docs if present.
const statusFile = path.join(root, 'src', 'ai', 'CURRENT_STATUS.md');
if (fs.existsSync(statusFile)) {
  let status = fs.readFileSync(statusFile, 'utf8');
  if (!status.includes('Genome Relationship Graph')) {
    status += `\n\n## Sprint 5 Update\n\n- Added Anime Genome foundation.\n- Added Core 100 starter Genome Pack.\n- Added Genome Relationship Graph for curated direct/thematic/avoid recommendation paths.\n`;
    fs.writeFileSync(statusFile, status);
  }
}

console.log('Sprint 5 Phase 2 applied: Genome Relationship Graph.');
