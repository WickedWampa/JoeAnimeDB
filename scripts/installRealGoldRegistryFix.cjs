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

const builderRel = 'scripts/rebuildGenomeRegistry.cjs';
const routerRel = 'src/ai/joeAIRecommendationRouter.js';
const goldRel = 'src/ai/genome/gold/goldStandardGenomeCards.js';
const goldPath = path.join(root, goldRel);

if (!fs.existsSync(goldPath)) {
  console.warn('');
  console.warn('WARNING: Missing ' + goldRel);
  console.warn('Put goldStandardGenomeCards.js there before testing One Piece/Naruto/Bleach gold cards.');
  console.warn('');
}

// 1) Patch the actual registry builder.
patchFile(builderRel, (text) => {
  let out = text;

  // Source order matters because ACTIVE_GENOME_REGISTRY keeps the first duplicate id.
  // Put gold first so gold cards override core/generated cards.
  if (!out.includes("path.join(genomeDir, 'gold')")) {
    out = out.replace(
      "const sources = [ path.join(genomeDir, 'core25'),",
      "const sources = [ path.join(genomeDir, 'gold'), path.join(genomeDir, 'core25'),"
    );
  }

  out = out.replace(
    "Add files under src/ai/genome/core25, core100, or enhanced,",
    "Add files under src/ai/genome/gold, core25, core100, enhanced, or generated,"
  );

  const oldLookup = "function normalize(value = '') { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); } export function findGenomeCardFromRegistry(animeOrTitle = '') { const text = typeof animeOrTitle === 'string' ? normalize(animeOrTitle) : normalize([ animeOrTitle.title, animeOrTitle.officialTitle, animeOrTitle.japaneseTitle, ...(animeOrTitle.titleSynonyms || []) ].filter(Boolean).join(' ')); return ACTIVE_GENOME_REGISTRY.find((card) => card.id === text || text.includes(normalize(card.id)) || (card.titles || []).some((title) => { const cleanTitle = normalize(title); return text.includes(cleanTitle) || cleanTitle.includes(text); }) ) || null; } export function getGenomeRegistryStats()";

  const newLookup = "function normalize(value = '') { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); } function titleInputs(animeOrTitle = '') { if (typeof animeOrTitle === 'string') return [animeOrTitle]; return [ animeOrTitle.id, animeOrTitle.title, animeOrTitle.officialTitle, animeOrTitle.titleEnglish, animeOrTitle.japaneseTitle, animeOrTitle.titleJapanese, ...(animeOrTitle.titleSynonyms || []), ...(animeOrTitle.aliases || []) ].filter(Boolean); } function cardInputs(card = {}) { return [ card.id, card.title, card.officialTitle, card.titleEnglish, ...(card.titles || []), ...(card.aliases || []) ].filter(Boolean); } export function findGenomeCardByTitle(animeOrTitle = '') { const queryValues = titleInputs(animeOrTitle).map(normalize).filter(Boolean); if (!queryValues.length) return null; return ACTIVE_GENOME_REGISTRY.find((card) => { const cardValues = cardInputs(card).map(normalize).filter(Boolean); return queryValues.some((q) => cardValues.some((c) => q === c || q.includes(c) || c.includes(q))); }) || null; } export function findGenomeCardFromRegistry(animeOrTitle = '') { return findGenomeCardByTitle(animeOrTitle); } export function getGenomeRegistryStats()";

  if (out.includes(oldLookup)) {
    out = out.replace(oldLookup, newLookup);
  } else if (!out.includes('export function findGenomeCardByTitle')) {
    console.warn('Builder lookup block did not match exactly. The direct generated registry patch will still be applied after rebuild.');
  }

  return out;
});

// 2) Rebuild using the corrected source list.
try {
  execFileSync(process.execPath, [path.join(root, builderRel)], { cwd: root, stdio: 'inherit' });
} catch (error) {
  console.warn('Registry rebuild failed:', error.message);
}

// 3) Patch the generated registry as a safety net for the current working tree.
patchFile('src/ai/genome/genomeRegistry.js', (text) => {
  let out = text;

  if (fs.existsSync(goldPath) && !out.includes("goldStandardGenomeCards")) {
    const importInsert = "import * as goldPack from './gold/goldStandardGenomeCards'; ";
    out = out.replace("// AUTO-GENERATED", "// AUTO-GENERATED");
    out = out.replace("export const GENOME_REGISTRY_VERSION", importInsert + "export const GENOME_REGISTRY_VERSION");
    out = out.replace(
      "const RAW_GENOME_REGISTRY = [",
      "const RAW_GENOME_REGISTRY = [ ...normalizePack(goldPack.GOLD_STANDARD_GENOME_CARDS, 'src/ai/genome/gold/goldStandardGenomeCards.js#GOLD_STANDARD_GENOME_CARDS'),"
    );
  }

  if (!out.includes("export function findGenomeCardByTitle")) {
    const start = out.indexOf("function normalize(value = '')");
    const end = out.indexOf("export function getGenomeRegistryStats()", start);

    if (start !== -1 && end !== -1) {
      const lookup = "function normalize(value = '') { return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); } function titleInputs(animeOrTitle = '') { if (typeof animeOrTitle === 'string') return [animeOrTitle]; return [ animeOrTitle.id, animeOrTitle.title, animeOrTitle.officialTitle, animeOrTitle.titleEnglish, animeOrTitle.japaneseTitle, animeOrTitle.titleJapanese, ...(animeOrTitle.titleSynonyms || []), ...(animeOrTitle.aliases || []) ].filter(Boolean); } function cardInputs(card = {}) { return [ card.id, card.title, card.officialTitle, card.titleEnglish, ...(card.titles || []), ...(card.aliases || []) ].filter(Boolean); } export function findGenomeCardByTitle(animeOrTitle = '') { const queryValues = titleInputs(animeOrTitle).map(normalize).filter(Boolean); if (!queryValues.length) return null; return ACTIVE_GENOME_REGISTRY.find((card) => { const cardValues = cardInputs(card).map(normalize).filter(Boolean); return queryValues.some((q) => cardValues.some((c) => q === c || q.includes(c) || c.includes(q))); }) || null; } export function findGenomeCardFromRegistry(animeOrTitle = '') { return findGenomeCardByTitle(animeOrTitle); } ";
      out = out.slice(0, start) + lookup + out.slice(end);
    }
  }

  return out;
});

// 4) Patch router: title lookup before mood/trait, aliases included.
patchFile(routerRel, (text) => {
  let out = text;

  out = out.replace(
    "import { ACTIVE_GENOME_REGISTRY, findGenomeCardFromRegistry } from './genome/genomeRegistry';",
    "import { ACTIVE_GENOME_REGISTRY, findGenomeCardFromRegistry, findGenomeCardByTitle } from './genome/genomeRegistry';"
  );

  out = out.replace(
    "const names = [card.id, ...(card.titles || [])].filter(Boolean);",
    "const names = [card.id, card.title, card.officialTitle, ...(card.titles || []), ...(card.aliases || [])].filter(Boolean);"
  );

  out = out.replaceAll(
    ".map((id) => findGenomeCardFromRegistry(id))",
    ".map((id) => findGenomeCardByTitle(id))"
  );

  out = out.replaceAll(
    "const sourceCard = findGenomeCardFromRegistry(similarTitle);",
    "const sourceCard = findGenomeCardByTitle(similarTitle);"
  );

  const old = `  // 2. Mood/vibe requests should beat title lookup.
  // Example: "I want horror" should mean horror recommendations, not title lookup for a fake "horror" card.
  const intent = maybeGenomeIntentRecommendation(question);
  if (intent) return intent;

  // 3. Direct title mention: "recommend Space Dandy" / "tell me about Higurashi".
  const card = mentionedGenomeCard(question);
  if (card) return formatTitleGenomeAnswer(card);

  // 4. Existing Knowledge/Genome pipeline for any remaining recommendation wording.`;

  const replacement = `  // 2. Known-title lookup should beat mood/vibe routing.
  // Example: "recommend One Piece" should show the One Piece Genome, not generic adventure picks.
  const card = findGenomeCardByTitle(question) || mentionedGenomeCard(question);
  if (card) return formatTitleGenomeAnswer(card);

  // 3. Mood/vibe requests only happen after known-title lookup fails.
  const intent = maybeGenomeIntentRecommendation(question);
  if (intent) return intent;

  // 4. Existing Knowledge/Genome pipeline for any remaining recommendation wording.`;

  if (out.includes(old)) {
    out = out.replace(old, replacement);
  }

  return out;
});

// 5) Verification script.
const check = `const fs = require('fs');
const path = require('path');

const root = process.cwd();

function ok(label, condition) {
  console.log(label + ':', condition ? 'OK' : 'MISSING');
}

const builder = fs.readFileSync(path.join(root, 'scripts', 'rebuildGenomeRegistry.cjs'), 'utf8');
const registry = fs.readFileSync(path.join(root, 'src', 'ai', 'genome', 'genomeRegistry.js'), 'utf8');
const router = fs.readFileSync(path.join(root, 'src', 'ai', 'joeAIRecommendationRouter.js'), 'utf8');

ok('builder scans gold folder', builder.includes("path.join(genomeDir, 'gold')"));
ok('registry includes gold pack when gold file exists', !fs.existsSync(path.join(root, 'src', 'ai', 'genome', 'gold', 'goldStandardGenomeCards.js')) || registry.includes('goldStandardGenomeCards'));
ok('registry exports findGenomeCardByTitle', registry.includes('export function findGenomeCardByTitle'));
ok('router imports findGenomeCardByTitle', router.includes('findGenomeCardByTitle'));
ok('router title lookup before mood', router.includes('Known-title lookup should beat mood'));

console.log('');
console.log('Now run npm run dev and test:');
console.log('recommend One Piece');
console.log('recommend Naruto');
console.log('recommend Bleach');
console.log('recommend Blue Eye Samurai');
`;

fs.writeFileSync(path.join(root, 'scripts', 'checkRealGoldRegistryFix.cjs'), check, 'utf8');

console.log('');
console.log('Real Gold Registry Fix installed.');
console.log('Run: node scripts\\\\checkRealGoldRegistryFix.cjs');
