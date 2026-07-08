const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

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
    console.warn('Missing:', rel);
    return false;
  }
  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before);
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    console.log('Patched:', rel);
  } else {
    console.log('No change needed:', rel);
  }
  return true;
}

function normalizeForReplace(s) {
  return s.replace(/\s+/g, ' ').trim();
}

const goldPath = path.join(root, 'src', 'ai', 'genome', 'gold', 'goldStandardGenomeCards.js');
if (!fs.existsSync(goldPath)) {
  console.warn('');
  console.warn('WARNING: Gold genome file is missing:');
  console.warn('src/ai/genome/gold/goldStandardGenomeCards.js');
  console.warn('');
  console.warn('Put your Top 20 Gold file there first. This installer will still patch the builder/router.');
  console.warn('');
}

// 1) Patch registry builder: include /gold as the highest-priority source.
patchFile('scripts/rebuildGenomeRegistry.cjs', (text) => {
  let out = text;

  if (!out.includes("path.join(genomeDir, 'gold')")) {
    out = out.replace(
      "const sources = [ path.join(genomeDir, 'core25'),",
      "const sources = [ path.join(genomeDir, 'gold'), path.join(genomeDir, 'core25'),"
    );
  }

  // Update generated registry comment.
  out = out.replace(
    "Add files under src/ai/genome/core25, core100, or enhanced,",
    "Add files under src/ai/genome/gold, core25, core100, enhanced, or generated,"
  );

  // Replace the generated registry lookup block inside the template.
  const oldLookup = `function normalize(value = '') { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); } export function findGenomeCardFromRegistry(animeOrTitle = '') { const text = typeof animeOrTitle === 'string' ? normalize(animeOrTitle) : normalize([ animeOrTitle.title, animeOrTitle.officialTitle, animeOrTitle.japaneseTitle, ...(animeOrTitle.titleSynonyms || []) ].filter(Boolean).join(' ')); return ACTIVE_GENOME_REGISTRY.find((card) => card.id === text || text.includes(normalize(card.id)) || (card.titles || []).some((title) => { const cleanTitle = normalize(title); return text.includes(cleanTitle) || cleanTitle.includes(text); }) ) || null; } export function getGenomeRegistryStats()`;

  const newLookup = `function normalize(value = '') { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); } function titleInputs(animeOrTitle = '') { if (typeof animeOrTitle === 'string') return [animeOrTitle]; return [ animeOrTitle.id, animeOrTitle.title, animeOrTitle.officialTitle, animeOrTitle.titleEnglish, animeOrTitle.japaneseTitle, animeOrTitle.titleJapanese, ...(animeOrTitle.titleSynonyms || []), ...(animeOrTitle.aliases || []) ].filter(Boolean); } function cardInputs(card = {}) { return [ card.id, card.title, card.officialTitle, card.titleEnglish, ...(card.titles || []), ...(card.aliases || []) ].filter(Boolean); } export function findGenomeCardByTitle(animeOrTitle = '') { const queryValues = titleInputs(animeOrTitle).map(normalize).filter(Boolean); if (!queryValues.length) return null; return ACTIVE_GENOME_REGISTRY.find((card) => { const cardValues = cardInputs(card).map(normalize).filter(Boolean); return queryValues.some((q) => cardValues.some((c) => q === c || q.includes(c) || c.includes(q))); }) || null; } export function findGenomeCardFromRegistry(animeOrTitle = '') { return findGenomeCardByTitle(animeOrTitle); } export function getGenomeRegistryStats()`;

  if (out.includes(oldLookup)) {
    out = out.replace(oldLookup, newLookup);
  } else if (!out.includes("export function findGenomeCardByTitle")) {
    console.warn('Could not locate exact lookup block in builder. Will patch generated registry after rebuild.');
  }

  return out;
});

// 2) Rebuild registry so gold gets imported if present.
const rebuild = path.join(root, 'scripts', 'rebuildGenomeRegistry.cjs');
if (fs.existsSync(rebuild)) {
  try {
    execFileSync(process.execPath, [rebuild], { cwd: root, stdio: 'inherit' });
  } catch (error) {
    console.warn('Registry rebuild failed:', error.message);
  }
}

// 3) Patch generated registry directly as backup/current fix.
patchFile('src/ai/genome/genomeRegistry.js', (text) => {
  let out = text;

  // If gold exists but builder failed to include it, direct patch import + RAW spread.
  if (fs.existsSync(goldPath) && !out.includes("goldStandardGenomeCards")) {
    const importAnchor = "export const GENOME_REGISTRY_VERSION";
    out = out.replace(
      importAnchor,
      "import * as goldPack from './gold/goldStandardGenomeCards'; " + importAnchor
    );

    out = out.replace(
      "const RAW_GENOME_REGISTRY = [",
      "const RAW_GENOME_REGISTRY = [ ...normalizePack(goldPack.GOLD_STANDARD_GENOME_CARDS, 'src/ai/genome/gold/goldStandardGenomeCards.js#GOLD_STANDARD_GENOME_CARDS'),"
    );
  }

  if (!out.includes("export function findGenomeCardByTitle")) {
    const oldStart = out.indexOf("function normalize(value = '')");
    const oldEnd = out.indexOf("export function getGenomeRegistryStats()", oldStart);
    if (oldStart !== -1 && oldEnd !== -1) {
      const newLookup = `function normalize(value = '') { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); } function titleInputs(animeOrTitle = '') { if (typeof animeOrTitle === 'string') return [animeOrTitle]; return [ animeOrTitle.id, animeOrTitle.title, animeOrTitle.officialTitle, animeOrTitle.titleEnglish, animeOrTitle.japaneseTitle, animeOrTitle.titleJapanese, ...(animeOrTitle.titleSynonyms || []), ...(animeOrTitle.aliases || []) ].filter(Boolean); } function cardInputs(card = {}) { return [ card.id, card.title, card.officialTitle, card.titleEnglish, ...(card.titles || []), ...(card.aliases || []) ].filter(Boolean); } export function findGenomeCardByTitle(animeOrTitle = '') { const queryValues = titleInputs(animeOrTitle).map(normalize).filter(Boolean); if (!queryValues.length) return null; return ACTIVE_GENOME_REGISTRY.find((card) => { const cardValues = cardInputs(card).map(normalize).filter(Boolean); return queryValues.some((q) => cardValues.some((c) => q === c || q.includes(c) || c.includes(q))); }) || null; } export function findGenomeCardFromRegistry(animeOrTitle = '') { return findGenomeCardByTitle(animeOrTitle); } `;
      out = out.slice(0, oldStart) + newLookup + out.slice(oldEnd);
    }
  }

  return out;
});

// 4) Patch router: known title beats trait/mood routing, and aliases count.
patchFile('src/ai/joeAIRecommendationRouter.js', (text) => {
  let out = text;

  out = out.replace(
    "import { ACTIVE_GENOME_REGISTRY, findGenomeCardFromRegistry } from './genome/genomeRegistry';",
    "import { ACTIVE_GENOME_REGISTRY, findGenomeCardFromRegistry, findGenomeCardByTitle } from './genome/genomeRegistry';"
  );

  out = out.replace(
    "const names = [card.id, ...(card.titles || [])].filter(Boolean);",
    "const names = [card.id, card.title, card.officialTitle, ...(card.titles || []), ...(card.aliases || [])].filter(Boolean);"
  );

  out = out.replaceAll(".map((id) => findGenomeCardFromRegistry(id))", ".map((id) => findGenomeCardByTitle(id))");
  out = out.replaceAll("const sourceCard = findGenomeCardFromRegistry(similarTitle);", "const sourceCard = findGenomeCardByTitle(similarTitle);");

  const oldRouteBlock = `// 2. Mood/vibe requests should beat title lookup.
  // Example: "I want horror" should mean horror recommendations, not title lookup for a fake "horror" card. const intent = maybeGenomeIntentRecommendation(question); if (intent) return intent; // 3. Direct title mention: "recommend Space Dandy" / "tell me about Higurashi". const card = mentionedGenomeCard(question); if (card) return formatTitleGenomeAnswer(card); // 4. Existing Knowledge/Genome pipeline for any remaining recommendation wording.`;

  const compact = normalizeForReplace(out);
  if (compact.includes(normalizeForReplace(oldRouteBlock))) {
    out = out.replace(
      /\/\/ 2\. Mood\/vibe requests should beat title lookup\.[\s\S]*?\/\/ 4\. Existing Knowledge\/Genome pipeline for any remaining recommendation wording\./,
      `// 2. Known-title lookup should beat mood/vibe routing.
  // Example: "recommend One Piece" should show the One Piece Genome, not generic adventure picks.
  const card = findGenomeCardByTitle(question) || mentionedGenomeCard(question);
  if (card) return formatTitleGenomeAnswer(card);

  // 3. Mood/vibe requests only happen after known-title lookup fails.
  const intent = maybeGenomeIntentRecommendation(question);
  if (intent) return intent;

  // 4. Existing Knowledge/Genome pipeline for any remaining recommendation wording.`
    );
  } else if (!out.includes("Known-title lookup should beat mood")) {
    out = out.replace(
      "const intent = maybeGenomeIntentRecommendation(question); if (intent) return intent; // 3. Direct title mention: \"recommend Space Dandy\" / \"tell me about Higurashi\". const card = mentionedGenomeCard(question); if (card) return formatTitleGenomeAnswer(card);",
      "const card = findGenomeCardByTitle(question) || mentionedGenomeCard(question); if (card) return formatTitleGenomeAnswer(card); const intent = maybeGenomeIntentRecommendation(question); if (intent) return intent;"
    );
  }

  return out;
});

// 5) Check script.
const check = `const fs = require('fs');
const path = require('path');

const root = process.cwd();
function ok(label, condition) { console.log(label + ':', condition ? 'OK' : 'MISSING'); }

const builder = fs.readFileSync(path.join(root, 'scripts', 'rebuildGenomeRegistry.cjs'), 'utf8');
const registry = fs.readFileSync(path.join(root, 'src', 'ai', 'genome', 'genomeRegistry.js'), 'utf8');
const router = fs.readFileSync(path.join(root, 'src', 'ai', 'joeAIRecommendationRouter.js'), 'utf8');

ok('builder includes gold source', builder.includes("path.join(genomeDir, 'gold')"));
ok('registry includes gold if file exists', !fs.existsSync(path.join(root, 'src', 'ai', 'genome', 'gold', 'goldStandardGenomeCards.js')) || registry.includes('goldStandardGenomeCards'));
ok('registry exports findGenomeCardByTitle', registry.includes('export function findGenomeCardByTitle'));
ok('router imports findGenomeCardByTitle', router.includes('findGenomeCardByTitle'));
ok('router includes aliases in matching', router.includes('...(card.aliases || [])'));

console.log('');
console.log('Now test in app:');
console.log('recommend One Piece');
console.log('recommend Naruto');
console.log('recommend Bleach');
console.log('recommend Blue Eye Samurai');
`;

fs.writeFileSync(path.join(root, 'scripts', 'checkGithubRegistryGoldRouterFix.cjs'), check, 'utf8');

console.log('');
console.log('GitHub registry/gold/router fix installed.');
console.log('Run: node scripts\\\\checkGithubRegistryGoldRouterFix.cjs');
