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

if (!sim.includes("buildPersonalityRecommendationText")) {
  sim = sim.replace(
    "import { buildCriticRecommendationText } from './animeCriticEngine';",
    "import { buildCriticRecommendationText } from './animeCriticEngine';\nimport { buildPersonalityRecommendationText } from './joeAIPersonalityEngine';"
  );

  if (!sim.includes("buildCriticRecommendationText")) {
    sim = sim.replace(
      "import { buildAnimeDNA, dnaSimilarity, topDnaTraits, labelTrait } from './animeDNA';",
      "import { buildAnimeDNA, dnaSimilarity, topDnaTraits, labelTrait } from './animeDNA';\nimport { buildPersonalityRecommendationText } from './joeAIPersonalityEngine';"
    );
  }
}

sim = sim.replace(
  "text: buildCriticRecommendationText({ source, inLibrary, discoveries })",
  "text: buildPersonalityRecommendationText({ source, inLibrary, discoveries })"
);

fs.writeFileSync(simFile, sim);
console.log('Sprint 4 Phase 5 wired: JoeAI Personality Engine.');
