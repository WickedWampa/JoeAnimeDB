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

// 1. Patch animeImporter so every single/bulk add gets knowledge fields.
const importerFile = path.join(root, 'src', 'services', 'animeImporter.js');
let importer = fs.readFileSync(importerFile, 'utf8');

if (!importer.includes("enrichAnimeKnowledge")) {
  importer = importer.replace(
    "import { cleanTitle } from './metadata';",
    "import { cleanTitle } from './metadata';\nimport { enrichAnimeKnowledge } from '../ai/knowledge/knowledgeRegistry';"
  );
}

if (!importer.includes("SPRINT4_AUTO_KNOWLEDGE_NORMALIZE")) {
  importer = importer.replace(
`export function normalizeJikanAnime(match, base = {}) {
  const genres = [`,
`export function normalizeJikanAnime(match, base = {}) {
  // SPRINT4_AUTO_KNOWLEDGE_NORMALIZE
  const genres = [`
  );

  importer = importer.replace(
`  return {
    ...base,`,
`  return enrichAnimeKnowledge({
    ...base,`
  );

  importer = importer.replace(
`    metadataUpdatedAt: new Date().toISOString()
  };
}`,
`    metadataUpdatedAt: new Date().toISOString()
  });
}`
  );
}

if (!importer.includes("SPRINT4_AUTO_KNOWLEDGE_MERGE")) {
  importer = importer.replace(
`export function mergeAnimeMetadata(existing = {}, incoming = {}, statusOverride) {
  return {`,
`export function mergeAnimeMetadata(existing = {}, incoming = {}, statusOverride) {
  // SPRINT4_AUTO_KNOWLEDGE_MERGE
  return enrichAnimeKnowledge({`
  );

  importer = importer.replace(
`    metadataUpdatedAt: incoming.metadataUpdatedAt || new Date().toISOString()
  };
}`,
`    metadataUpdatedAt: incoming.metadataUpdatedAt || new Date().toISOString()
  });
}`
  );
}

fs.writeFileSync(importerFile, importer);

// 2. Patch knowledge-first recommender to exclude same franchise.
const recommenderFile = path.join(root, 'src', 'ai', 'knowledgeFirstRecommender.js');
if (fs.existsSync(recommenderFile)) {
  let rec = fs.readFileSync(recommenderFile, 'utf8');

  if (!rec.includes("sameFranchise")) {
    rec = rec.replace(
      "import { findKnowledgeProfile } from './animeKnowledgeBase';",
      "import { findKnowledgeProfile } from './animeKnowledgeBase';\nimport { sameFranchise, enrichAnimeKnowledge } from './knowledge/knowledgeRegistry';"
    );
  }

  if (!rec.includes("SPRINT4_EXCLUDE_SAME_FRANCHISE")) {
    rec = rec.replace(
`  const pool = [...catalog, ...anime]
    .filter((item) => keyFor(item) !== keyFor(source))`,
`  const enrichedSource = enrichAnimeKnowledge(source);

  const pool = [...catalog, ...anime]
    // SPRINT4_EXCLUDE_SAME_FRANCHISE
    .filter((item) => keyFor(item) !== keyFor(source))
    .filter((item) => !sameFranchise(enrichedSource, item))`
    );
  }

  fs.writeFileSync(recommenderFile, rec);
}

console.log('Sprint 4 Phase 8 applied: automatic knowledge enrichment on imports and same-franchise recommendation filtering.');
