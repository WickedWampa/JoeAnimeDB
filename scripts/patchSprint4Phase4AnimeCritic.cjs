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
const simFile = path.join(root, 'src', 'ai', 'similarityEngine.js');

let sim = fs.readFileSync(simFile, 'utf8');

if (!sim.includes("buildCriticRecommendationText")) {
  sim = sim.replace(
    "import { buildAnimeDNA, dnaSimilarity, topDnaTraits, labelTrait } from './animeDNA';",
    "import { buildAnimeDNA, dnaSimilarity, topDnaTraits, labelTrait } from './animeDNA';\nimport { buildCriticRecommendationText } from './animeCriticEngine';"
  );
}

const oldBlock = `  return {
    found: true,
    source,
    matches,
    text: [
      \`🧬 Matched source: \${source.title}\`,
      '',
      \`I’m matching on: \${sourceTraits || 'general vibe'}\`,
      '',
      section('Already in your library:', inLibrary),
      '',
      section('New discoveries:', discoveries),
      '',
      discoveries.length ? '' : 'No unseen catalog matches yet. Add more catalog titles and I’ll get smarter.'
    ].filter((part) => part !== '').join('\\n')
  };`;

const newBlock = `  return {
    found: true,
    source,
    matches,
    text: buildCriticRecommendationText({ source, inLibrary, discoveries })
  };`;

if (sim.includes(oldBlock)) {
  sim = sim.replace(oldBlock, newBlock);
} else if (!sim.includes('buildCriticRecommendationText({ source, inLibrary, discoveries })')) {
  console.warn('Could not find exact old return block. You may need to replace similarityEngine.js manually.');
}

fs.writeFileSync(simFile, sim);
console.log('Sprint 4 Phase 4 wired: Anime Critic Engine.');
