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

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

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

ensureDir(path.join(root, 'src', 'ai'));

// 1) Write the shared alias helper.
fs.writeFileSync(path.join(root, 'src', 'ai', 'titleAliases.js'), `export function normalizeAnimeTitle(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[:'"’“.!?()[\\]{}]/g, ' ')
    .replace(/[-_/]+/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

export function slugAnimeTitle(value = '') {
  return normalizeAnimeTitle(value).replace(/\\s+/g, '-');
}

export const TITLE_ALIASES = {
  'blue eye samurai': 'blue-eye-samurai',
  'blue-eye samurai': 'blue-eye-samurai',
  'blue-eye-samurai': 'blue-eye-samurai',
  bes: 'blue-eye-samurai',

  arcane: 'arcane',
  'arcane league of legends': 'arcane',

  castlevania: 'castlevania',
  'netflix castlevania': 'castlevania',
  'castlevania nocturne': 'castlevania-nocturne',

  'lord of mysteries': 'lord-of-mysteries',
  'guimi zhi zhu xiaochou pian': 'lord-of-mysteries',
  lom: 'lord-of-mysteries',

  'seven deadly sins': 'the-seven-deadly-sins',
  'the seven deadly sins': 'the-seven-deadly-sins',
  '7ds': 'the-seven-deadly-sins',

  'jujutsu kaisen': 'jujutsu-kaisen',
  jjk: 'jujutsu-kaisen',

  'demon slayer': 'demon-slayer',
  kimetsu: 'demon-slayer',

  frieren: 'frieren-beyond-journeys-end',
  'frieren beyond journeys end': 'frieren-beyond-journeys-end',

  'made in abyss': 'made-in-abyss',
  mia: 'made-in-abyss'
};

export function canonicalAnimeId(value = '') {
  const normalized = normalizeAnimeTitle(value);
  return TITLE_ALIASES[normalized] || slugAnimeTitle(normalized);
}

export function titleCandidates(value = '') {
  const normalized = normalizeAnimeTitle(value);
  const slug = slugAnimeTitle(value);
  const canonical = canonicalAnimeId(value);

  return [...new Set([
    String(value || '').trim(),
    normalized,
    slug,
    canonical,
    normalized.replace(/^the\\s+/, ''),
    slug.replace(/^the-/, '')
  ].filter(Boolean))];
}

export function cardAliases(card = {}) {
  return [...new Set([
    card.id,
    ...(card.titles || []),
    card.title,
    card.officialTitle,
    card.titleEnglish,
    ...(card.aliases || [])
  ].filter(Boolean))];
}

export function cardMatchesTitle(card = {}, query = '') {
  const queryKeys = new Set(titleCandidates(query).map(normalizeAnimeTitle));
  const queryIds = new Set(titleCandidates(query).map(canonicalAnimeId));

  for (const alias of cardAliases(card)) {
    const aliasNorm = normalizeAnimeTitle(alias);
    const aliasId = canonicalAnimeId(alias);

    if (queryKeys.has(aliasNorm) || queryIds.has(aliasId)) return true;
    if (queryIds.has(slugAnimeTitle(alias))) return true;
  }

  return false;
}

export function buildAliasIndex(cards = []) {
  const index = new Map();

  for (const card of cards) {
    for (const alias of cardAliases(card)) {
      for (const candidate of titleCandidates(alias)) {
        index.set(normalizeAnimeTitle(candidate), card);
        index.set(canonicalAnimeId(candidate), card);
      }
    }
  }

  return index;
}
`, 'utf8');

console.log('Wrote src/ai/titleAliases.js');

// 2) Patch the registry builder, not just the generated registry.
patchFile('scripts/rebuildGenomeRegistry.cjs', (text) => {
  let out = text;

  // Ensure generated registry imports titleAliases every time.
  if (!out.includes("import { buildAliasIndex")) {
    out = out.replace(
      "${imports.join('\\n')}",
      "${imports.join('\\n')}\\nimport { buildAliasIndex, cardMatchesTitle, canonicalAnimeId, normalizeAnimeTitle } from '../titleAliases';"
    );
  }

  const oldStart = out.indexOf("function normalize(value = '') {");
  const oldEnd = out.indexOf("export function getGenomeRegistryStats()", oldStart);

  if (oldStart === -1 || oldEnd === -1) {
    console.warn('Could not find old registry lookup block in builder. Leaving builder lookup block unchanged.');
    return out;
  }

  const newLookup = `export const GENOME_ALIAS_INDEX = buildAliasIndex(ACTIVE_GENOME_REGISTRY || []);

function fallbackNormalize(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function findGenomeCardByTitle(animeOrTitle = '') {
  const searchText = typeof animeOrTitle === 'string'
    ? animeOrTitle
    : [
        animeOrTitle.title,
        animeOrTitle.officialTitle,
        animeOrTitle.titleEnglish,
        animeOrTitle.japaneseTitle,
        animeOrTitle.titleJapanese,
        ...(animeOrTitle.titleSynonyms || []),
        ...(animeOrTitle.aliases || [])
      ].filter(Boolean).join(' ');

  const direct =
    GENOME_ALIAS_INDEX.get(normalizeAnimeTitle(searchText)) ||
    GENOME_ALIAS_INDEX.get(canonicalAnimeId(searchText));

  if (direct) return direct;

  return ACTIVE_GENOME_REGISTRY.find((card) =>
    cardMatchesTitle(card, searchText) ||
    fallbackNormalize(searchText).includes(fallbackNormalize(card.id)) ||
    (card.titles || []).some((title) => {
      const cleanTitle = fallbackNormalize(title);
      const cleanSearch = fallbackNormalize(searchText);
      return cleanSearch.includes(cleanTitle) || cleanTitle.includes(cleanSearch);
    }) ||
    (card.aliases || []).some((alias) => {
      const cleanAlias = fallbackNormalize(alias);
      const cleanSearch = fallbackNormalize(searchText);
      return cleanSearch.includes(cleanAlias) || cleanAlias.includes(cleanSearch);
    })
  ) || null;
}

export function findGenomeCardFromRegistry(animeOrTitle = '') {
  return findGenomeCardByTitle(animeOrTitle);
}

`;

  out = out.slice(0, oldStart) + newLookup + out.slice(oldEnd);

  return out;
});

// 3) Add aliases to generated manual cards if present.
const generatedPath = path.join(root, 'src', 'ai', 'genome', 'generated', 'generatedGenomeCards.js');

function loadCards(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/export const GENERATED_GENOME_CARDS = ([\s\S]*?);\s*$/m);
  if (!match) return [];
  try { return JSON.parse(match[1]); } catch { return []; }
}

function saveCards(file, cards) {
  fs.writeFileSync(file, `// Auto-generated provisional Genome Cards.
// This file is maintained by JoeAnimeDB tools.
// Cards here should be reviewed before being promoted to curated modules.

export const GENERATED_GENOME_CARDS = ${JSON.stringify(cards, null, 2)};
`, 'utf8');
}

const cards = loadCards(generatedPath);
if (cards.length) {
  const fixed = cards.map((card) => {
    if (card.id === 'blue-eye-samurai') {
      return {
        ...card,
        titles: [...new Set([...(card.titles || []), 'Blue Eye Samurai'])],
        aliases: [...new Set([...(card.aliases || []), 'blue eye samurai', 'blue-eye samurai', 'BES'])]
      };
    }

    if (card.id === 'arcane') {
      return {
        ...card,
        titles: [...new Set([...(card.titles || []), 'Arcane'])],
        aliases: [...new Set([...(card.aliases || []), 'Arcane: League of Legends'])]
      };
    }

    if (card.id === 'castlevania') {
      return {
        ...card,
        titles: [...new Set([...(card.titles || []), 'Castlevania'])],
        aliases: [...new Set([...(card.aliases || []), 'Netflix Castlevania'])]
      };
    }

    return card;
  });

  saveCards(generatedPath, fixed);
  console.log('Updated generated card aliases.');
}

// 4) Patch router so title mention beats mood intent and aliases count.
patchFile('src/ai/joeAIRecommendationRouter.js', (text) => {
  let out = text;

  // Clean/fix registry import.
  out = out.replace(
    /import\s+\{[^}]*ACTIVE_GENOME_REGISTRY[^}]*\}\s+from\s+['"]\.\/genome\/genomeRegistry['"];/,
    "import { ACTIVE_GENOME_REGISTRY, findGenomeCardFromRegistry, findGenomeCardByTitle } from './genome/genomeRegistry';"
  );

  // Include aliases in mentionedGenomeCard matching.
  out = out.replace(
    "const names = [card.id, ...(card.titles || [])].filter(Boolean);",
    "const names = [card.id, ...(card.titles || []), ...(card.aliases || [])].filter(Boolean);"
  );

  // Similar-title lookup should use the alias-aware function.
  out = out.replace(
    "const sourceCard = findGenomeCardFromRegistry(similarTitle);",
    "const sourceCard = findGenomeCardByTitle(similarTitle);"
  );

  // cardsFromIds should be alias-aware too.
  out = out.replace(
    ".map((id) => findGenomeCardFromRegistry(id))",
    ".map((id) => findGenomeCardByTitle(id))"
  );

  // Move direct title mention before mood/vibe intent.
  const oldBlock = `  // 2. Mood/vibe requests should beat title lookup.
  // Example: "I want horror" should mean horror recommendations, not title lookup for a fake "horror" card.
  const intent = maybeGenomeIntentRecommendation(question);
  if (intent) return intent;

  // 3. Direct title mention: "recommend Space Dandy" / "tell me about Higurashi".
  const card = mentionedGenomeCard(question);
  if (card) return formatTitleGenomeAnswer(card);`;

  const newBlock = `  // 2. Direct title mention should beat mood/vibe lookup.
  // Example: "recommend Blue Eye Samurai" should show that known card, not generic samurai/action picks.
  const card = mentionedGenomeCard(question);
  if (card) return formatTitleGenomeAnswer(card);

  // 3. Mood/vibe requests after known-title lookup.
  // Example: "I want horror" should mean horror recommendations, not title lookup for a fake "horror" card.
  const intent = maybeGenomeIntentRecommendation(question);
  if (intent) return intent;`;

  out = out.replace(oldBlock, newBlock);

  return out;
});

// 5) Rebuild registry with permanent exports.
const rebuild = path.join(root, 'scripts', 'rebuildGenomeRegistry.cjs');
if (fs.existsSync(rebuild)) {
  execFileSync(process.execPath, [rebuild], { cwd: root, stdio: 'inherit' });
}

// 6) Check script.
fs.writeFileSync(path.join(root, 'scripts', 'checkPermanentAliasRegistry.cjs'), `const fs = require('fs');
const path = require('path');

const root = process.cwd();

function ok(label, condition) {
  console.log(label + ':', condition ? 'OK' : 'MISSING');
}

const builder = fs.readFileSync(path.join(root, 'scripts', 'rebuildGenomeRegistry.cjs'), 'utf8');
const registry = fs.readFileSync(path.join(root, 'src', 'ai', 'genome', 'genomeRegistry.js'), 'utf8');
const router = fs.readFileSync(path.join(root, 'src', 'ai', 'joeAIRecommendationRouter.js'), 'utf8');
const aliases = fs.readFileSync(path.join(root, 'src', 'ai', 'titleAliases.js'), 'utf8');

ok('builder generates alias import', builder.includes('buildAliasIndex'));
ok('registry exports findGenomeCardByTitle', registry.includes('export function findGenomeCardByTitle'));
ok('registry exports GENOME_ALIAS_INDEX', registry.includes('export const GENOME_ALIAS_INDEX'));
ok('router imports findGenomeCardByTitle', router.includes('findGenomeCardByTitle'));
ok('router checks aliases', router.includes('...(card.aliases || [])'));
ok('BES alias exists', aliases.includes("bes: 'blue-eye-samurai'"));

console.log('');
console.log('Try in app: recommend Blue Eye Samurai');
console.log('Try in app: recommend BES');
console.log('Try in app: recommend Arcane');
`, 'utf8');

// 7) Docs.
fs.writeFileSync(path.join(root, 'src', 'ai', 'PERMANENT_ALIAS_REGISTRY_FIX.md'), `# Permanent Alias Registry Fix

This fixes the bug where \`findGenomeCardByTitle\` disappeared after rebuilding the Genome registry.

## What changed

- \`scripts/rebuildGenomeRegistry.cjs\` now generates:
  - \`GENOME_ALIAS_INDEX\`
  - \`findGenomeCardByTitle()\`
  - \`findGenomeCardFromRegistry()\` as a compatibility alias
- \`src/ai/titleAliases.js\` is the shared canonical title helper.
- \`joeAIRecommendationRouter.js\` uses alias-aware lookups.
- Known title lookup now happens before generic mood/trait routing.

## Test

\`\`\`cmd
node scripts\\checkPermanentAliasRegistry.cjs
npm run dev
\`\`\`

Then ask:

\`\`\`text
recommend Blue Eye Samurai
recommend BES
recommend Arcane
\`\`\`
`, 'utf8');

console.log('');
console.log('Permanent alias registry fix installed.');
console.log('Run: node scripts\\\\checkPermanentAliasRegistry.cjs');
