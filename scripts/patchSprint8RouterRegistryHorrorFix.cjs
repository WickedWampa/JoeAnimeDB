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

function patchFile(rel, fn) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    console.warn('Missing', rel);
    return;
  }
  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before);
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    console.log('Patched', rel);
  } else {
    console.log('No change needed', rel);
  }
}

// 1) Fix registry builder: do not treat module arrays as Genome cards.
patchFile('scripts/rebuildGenomeRegistry.cjs', (text) => {
  let out = text;

  // Skip src/ai/modules/index.js so JOEAI_KNOWLEDGE_MODULES itself does not become fake cards.
  if (!out.includes('SPRINT8_SKIP_MODULE_INDEX')) {
    out = out.replace(
      "const packFiles = sources.flatMap(walk).filter((file) => !file.endsWith('genomeRegistry.js'));",
      `const packFiles = sources
  .flatMap(walk)
  .filter((file) => !file.endsWith('genomeRegistry.js'))
  // SPRINT8_SKIP_MODULE_INDEX
  // Module index exports an array of modules, not cards. Individual module files expose module.cards.
  .filter((file) => !file.replaceAll(path.sep, '/').endsWith('src/ai/modules/index.js'));`
    );
  }

  // Make normalizePack reject arrays that are not card arrays.
  if (!out.includes('SPRINT8_ARRAY_CARD_GUARD')) {
    out = out.replace(
      `if (Array.isArray(value)) {
    return value.map((card) => ({ ...card, registrySource: card.registrySource || source }));
  }`,
      `if (Array.isArray(value)) {
    // SPRINT8_ARRAY_CARD_GUARD
    // Only arrays of actual cards belong in the registry.
    return value
      .filter((card) => card && card.id && (card.titles || card.title || card.signature || card.domain))
      .map((card) => ({ ...card, registrySource: card.registrySource || source }));
  }`
    );
  }

  return out;
});

// 2) Add horror to Vibe Genome and Trait Mixer.
patchFile('src/ai/vibes/vibeGenome.js', (text) => {
  let out = text;

  if (!out.includes("horror: ['horror'")) {
    out = out.replace(
      "chaos: ['chaos', 'unhinged', 'wild', 'weird', 'bizarre']",
      "chaos: ['chaos', 'unhinged', 'wild', 'weird', 'bizarre'],\n  horror: ['horror', 'scary', 'creepy', 'curse', 'vampire', 'paranoia', 'dread', 'unsettling']"
    );
  }

  if (!out.includes("domain.includes('horror')")) {
    out = out.replace(
      "if (norm(card.domain).includes('fantasy')) vibes.fantasy = Math.max(vibes.fantasy || 0, 8);",
      "if (norm(card.domain).includes('fantasy')) vibes.fantasy = Math.max(vibes.fantasy || 0, 8);\n  if (norm(card.domain).includes('horror')) vibes.horror = Math.max(vibes.horror || 0, 9);"
    );
  }

  return out;
});

patchFile('src/ai/vibes/traitMixer.js', (text) => {
  let out = text;

  if (!out.includes("horror: ['horror'")) {
    out = out.replace(
      "chaos: ['chaos', 'unhinged', 'wild', 'weird', 'bizarre']",
      "chaos: ['chaos', 'unhinged', 'wild', 'weird', 'bizarre'],\n  horror: ['horror', 'scary', 'creepy', 'curse', 'vampire', 'paranoia', 'dread', 'unsettling']"
    );
  }

  return out;
});

// 3) Router priority: similarity first, then trait/intent, then title mention.
// This prevents "I want horror" from becoming "JoeAI Knows: horror".
patchFile('src/ai/joeAIRecommendationRouter.js', (text) => {
  const oldBlock = `export function routeJoeAIRecommendation(question = '', anime = [], catalog = []) {
  // 1. Existing Knowledge/Genome/Intent pipeline.
  const smart = maybeKnowledgeFirstRecommendation(question, anime, catalog);
  if (smart && !/^I heard:.+could not find/i.test(smart)) return smart;

  // 2. Similarity requests can use Genome-only source cards, even if the title is not in catalog yet.
  const similarTitle = extractSimilarityTitle(question);
  if (similarTitle) {
    const sourceCard = findGenomeCardFromRegistry(similarTitle);
    if (sourceCard) return formatSimilarGenomeAnswer(sourceCard);
  }

  // 3. Mood/vibe requests that missed the parser still get a direct Intent Engine chance.
  const intent = maybeGenomeIntentRecommendation(question);
  if (intent) return intent;

  // 4. Direct title mention: "recommend Space Dandy" / "tell me about Higurashi".
  const card = mentionedGenomeCard(question);
  if (card) return formatTitleGenomeAnswer(card);

  return null;
}`;

  const newBlock = `export function routeJoeAIRecommendation(question = '', anime = [], catalog = []) {
  // 1. Similarity requests need title-aware recommendation first.
  // Example: "recommend something like Higurashi"
  const similarTitle = extractSimilarityTitle(question);
  if (similarTitle) {
    const smart = maybeKnowledgeFirstRecommendation(question, anime, catalog);
    if (smart && !/^I heard:.+could not find/i.test(smart)) return smart;

    const sourceCard = findGenomeCardFromRegistry(similarTitle);
    if (sourceCard) return formatSimilarGenomeAnswer(sourceCard);
  }

  // 2. Mood/vibe requests should beat title lookup.
  // Example: "I want horror" should mean horror recommendations, not title lookup for a fake "horror" card.
  const intent = maybeGenomeIntentRecommendation(question);
  if (intent) return intent;

  // 3. Direct title mention: "recommend Space Dandy" / "tell me about Higurashi".
  const card = mentionedGenomeCard(question);
  if (card) return formatTitleGenomeAnswer(card);

  // 4. Existing Knowledge/Genome pipeline for any remaining recommendation wording.
  const smart = maybeKnowledgeFirstRecommendation(question, anime, catalog);
  if (smart && !/^I heard:.+could not find/i.test(smart)) return smart;

  return null;
}`;

  return text.includes(oldBlock) ? text.replace(oldBlock, newBlock) : text;
});

// 4) Documentation.
const doc = `# Sprint 8 Fix — Router + Registry + Horror

Fixes three bugs found during testing:

1. \`I want horror\` was treated like a title lookup.
2. \`src/ai/modules/index.js\` could leak module objects into the Genome registry as fake cards.
3. Trait Mixer did not have a dedicated horror trait.

## Run

\`\`\`cmd
node scripts\\patchSprint8RouterRegistryHorrorFix.cjs
node scripts\\rebuildGenomeRegistry.cjs
npm run dev
\`\`\`

## Test

- I want horror
- recommend something like Higurashi
- recommend Space Dandy
- I want spicy but wholesome
- I want funny cyberpunk
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'SPRINT_8_ROUTER_REGISTRY_HORROR_FIX.md'), doc, 'utf8');

console.log('');
console.log('Sprint 8 router/registry/horror fix complete.');
console.log('Now run: node scripts\\\\rebuildGenomeRegistry.cjs');
