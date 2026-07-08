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
const intentFile = path.join(root, 'src', 'ai', 'joeAIIntentEngine.js');

if (!fs.existsSync(intentFile)) {
  console.error('Missing src/ai/joeAIIntentEngine.js');
  process.exit(1);
}

let text = fs.readFileSync(intentFile, 'utf8');

if (!text.includes("maybeTraitMixerRecommendation")) {
  text = text.replace(
    "import { ACTIVE_GENOME_REGISTRY } from './genome/genomeRegistry';",
    "import { ACTIVE_GENOME_REGISTRY } from './genome/genomeRegistry';\nimport { maybeTraitMixerRecommendation } from './vibes/traitMixer';"
  );
}

const marker = "export function maybeGenomeIntentRecommendation(question = '', { limit = 8 } = {}) {";
if (!text.includes("const traitMixAnswer = maybeTraitMixerRecommendation")) {
  text = text.replace(
    marker,
    `${marker}\n  const traitMixAnswer = maybeTraitMixerRecommendation(question, { limit });\n  if (traitMixAnswer) return traitMixAnswer;\n`
  );
}

fs.writeFileSync(intentFile, text, 'utf8');

const doc = `# Sprint 7 — Vibe Genome + Trait Mixer

Adds a first-pass Vibe Genome and Trait Mixer.

## What it unlocks

Instead of only one intent:

- funny
- cyberpunk

JoeAI can now mix traits:

- funny + cyberpunk
- spicy + wholesome
- dark + fantasy
- cozy + romance
- mind games + comedy

## Files

- src/ai/vibes/vibeGenome.js
- src/ai/vibes/traitMixer.js

## Test prompts

- I want funny cyberpunk
- I want spicy but wholesome
- I want dark fantasy
- I want cozy romance
- I want mind games with comedy
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'SPRINT_7_VIBE_GENOME_TRAIT_MIXER.md'), doc, 'utf8');

console.log('Sprint 7 Vibe Genome + Trait Mixer applied.');
console.log('Test: I want funny cyberpunk');
