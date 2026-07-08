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

// 1) Central alias/canonical-title helper.
const aliasFile = `export function normalizeAnimeTitle(value = '') {
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
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'titleAliases.js'), aliasFile, 'utf8');
console.log('Created src/ai/titleAliases.js');

// 2) Ensure generated cards have aliases.
const generatedPath = path.join(root, 'src', 'ai', 'genome', 'generated', 'generatedGenomeCards.js');

function loadCards(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/export const GENERATED_GENOME_CARDS = ([\s\S]*?);\s*$/m);
  if (!match) return [];
  try { return JSON.parse(match[1]); } catch { return []; }
}

function saveCards(file, cards) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `// Auto-generated provisional Genome Cards.
// This file is maintained by JoeAnimeDB tools.
// Cards here should be reviewed before being promoted to curated modules.

export const GENERATED_GENOME_CARDS = ${JSON.stringify(cards, null, 2)};
`, 'utf8');
}

const cards = loadCards(generatedPath);
const fixedCards = cards.map((card) => {
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

if (cards.length) {
  saveCards(generatedPath, fixedCards);
  console.log('Updated generated Genome aliases.');
}

// 3) Patch genome registry.
patchFile('src/ai/genome/genomeRegistry.js', (text) => {
  let out = text;

  if (!out.includes("titleAliases")) {
    out = "import { buildAliasIndex, cardMatchesTitle, canonicalAnimeId, normalizeAnimeTitle } from '../titleAliases';\n" + out;
  }

  if (!out.includes("GENOME_ALIAS_INDEX")) {
    out += `

export const GENOME_ALIAS_INDEX = buildAliasIndex(ACTIVE_GENOME_REGISTRY || []);

export function findGenomeCardByTitle(query = '') {
  const direct =
    GENOME_ALIAS_INDEX.get(normalizeAnimeTitle(query)) ||
    GENOME_ALIAS_INDEX.get(canonicalAnimeId(query));

  if (direct) return direct;

  return (ACTIVE_GENOME_REGISTRY || []).find((card) => cardMatchesTitle(card, query)) || null;
}
`;
  }

  return out;
});

// 4) Patch router to import/use new lookup conservatively.
patchFile('src/ai/joeAIRecommendationRouter.js', (text) => {
  let out = text;

  if (!out.includes("findGenomeCardByTitle")) {
    const registryImport = /import\s+\{([^}]+)\}\s+from\s+['"]\.\/genome\/genomeRegistry['"];/;
    if (registryImport.test(out)) {
      out = out.replace(registryImport, (match, imports) => {
        return imports.includes('findGenomeCardByTitle')
          ? match
          : `import {${imports}, findGenomeCardByTitle} from './genome/genomeRegistry';`;
      });
    } else {
      out = `import { findGenomeCardByTitle } from './genome/genomeRegistry';\n` + out;
    }
  }

  if (!out.includes("function findKnownGenomeCard")) {
    const marker = "function formatKnownGenomeCard";
    if (out.includes(marker)) {
      out = out.replace(
        marker,
        `function findKnownGenomeCard(title) {
  return findGenomeCardByTitle(title);
}

${marker}`
      );
    }
  }

  out = out.replaceAll("findGenomeCardFromRegistry(title)", "findKnownGenomeCard(title)");
  out = out.replaceAll("findGenomeCardFromRegistry(query)", "findKnownGenomeCard(query)");
  out = out.replaceAll("findGenomeCardFromRegistry(requestedTitle)", "findKnownGenomeCard(requestedTitle)");

  return out;
});

// 5) Rebuild registry.
const rebuild = path.join(root, 'scripts', 'rebuildGenomeRegistry.cjs');
if (fs.existsSync(rebuild)) {
  require('child_process').execFileSync(process.execPath, [rebuild], { cwd: root, stdio: 'inherit' });
}

// 6) Check script.
fs.writeFileSync(path.join(root, 'scripts', 'checkCanonicalTitleAliases.cjs'), `const fs = require('fs');
const path = require('path');
const root = process.cwd();

function ok(label, condition) {
  console.log(label + ':', condition ? 'OK' : 'MISSING');
}

ok('titleAliases helper', fs.existsSync(path.join(root, 'src', 'ai', 'titleAliases.js')));

const registry = fs.readFileSync(path.join(root, 'src', 'ai', 'genome', 'genomeRegistry.js'), 'utf8');
ok('registry alias lookup', registry.includes('findGenomeCardByTitle'));

const generated = fs.readFileSync(path.join(root, 'src', 'ai', 'genome', 'generated', 'generatedGenomeCards.js'), 'utf8');
ok('Blue Eye Samurai aliases', generated.includes('blue eye samurai') && generated.includes('BES'));
ok('Arcane aliases', generated.includes('Arcane: League of Legends'));
`);

// 7) Docs.
fs.writeFileSync(path.join(root, 'src', 'ai', 'CANONICAL_TITLE_ALIASES.md'), `# Canonical Title Aliases

Adds shared title normalization and alias lookup.

## Test

\`\`\`cmd
node scripts\\checkCanonicalTitleAliases.cjs
npm run dev
\`\`\`

Then ask JoeAI:

\`\`\`text
recommend Blue Eye Samurai
recommend BES
recommend Arcane
\`\`\`
`, 'utf8');

console.log('');
console.log('Canonical title alias system installed.');
console.log('Run: node scripts\\\\checkCanonicalTitleAliases.cjs');
