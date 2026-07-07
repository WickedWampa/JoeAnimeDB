/*
  JoeAnimeDB PATCH_0038 — One Brain Router

  Goal:
  Bare known-title lookups like "slime" and richer prompts like
  "what is slime" should route through the same Genome/Gold path as
  "recommend slime".

  Run from repo root:
    node scripts\patch0038OneBrain.cjs
    node scripts\rebuildGenomeRegistry.cjs
    npm run build
*/

const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();
const file = path.join(repoRoot, 'src', 'ai', 'intentParser.js');

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`✅ ${message}`);
}

console.log('\n=== JoeAnimeDB PATCH_0038: One Brain Router ===\n');

if (!fs.existsSync(file)) {
  fail('Could not find src/ai/intentParser.js. Run this from the repo root.');
}

let src = fs.readFileSync(file, 'utf8');
const original = src;

if (src.includes('PATCH_0038_ONE_BRAIN_ROUTER')) {
  ok('Patch 0038 already appears to be installed.');
  process.exit(0);
}

const backup = `${file}.backup-before-patch0038-${Date.now()}`;
fs.writeFileSync(backup, original, 'utf8');
ok(`Backup created: ${path.relative(repoRoot, backup)}`);

// 1) Add registry import if needed.
if (!src.includes("findGenomeCardByTitle") && !src.includes('findGenomeCardByTitle')) {
  // Prefer placing the import before the first function/const. Works even if the file currently has no imports.
  src = `import { findGenomeCardByTitle } from './genome/genomeRegistry';\n${src}`;
  ok('Added Genome Registry import.');
} else if (!src.includes("from './genome/genomeRegistry'")) {
  // Rare case: function name exists in comments/other code but import is missing.
  src = `import { findGenomeCardByTitle } from './genome/genomeRegistry';\n${src}`;
  ok('Added Genome Registry import.');
} else {
  ok('Genome Registry import already present.');
}

// 2) Add helper functions before parseJoeAIIntent.
const parseMarker = 'export function parseJoeAIIntent(input = \'\') {';
if (!src.includes(parseMarker)) {
  fail('Could not find parseJoeAIIntent(input = \'\'). The file shape changed.');
}

const helper = `

// PATCH_0038_ONE_BRAIN_ROUTER
// Known titles should always use the Genome/Gold recommendation path.
// This prevents bare lookups like "slime" from falling into the older short-answer path
// while "recommend slime" correctly uses the rich Gold card.
function cleanKnownTitleQueryForGenome(value = '') {
  return String(value || '')
    .trim()
    .replace(/[?!.,]+$/g, '')
    .replace(/^\s*(please\s+)?(recommend|tell me about|what is|what's|whats|who is|should i watch|why should i watch|is|about)\s+/i, '')
    .replace(/^\s*(anime|show|series)\s+/i, '')
    .replace(/\s+(anime|show|series)\s*$/i, '')
    .trim();
}

function isKnownGenomeTitleQuery(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return false;

  const cleaned = cleanKnownTitleQueryForGenome(raw);
  if (!cleaned || cleaned.length < 3) return false;

  // Avoid turning ordinary broad moods into title lookups.
  const broadWords = new Set([
    'action', 'adventure', 'fantasy', 'isekai', 'romance', 'comedy', 'horror',
    'sports', 'mecha', 'sci fi', 'sci-fi', 'dark', 'funny', 'sad', 'new anime'
  ]);
  if (broadWords.has(cleaned.toLowerCase())) return false;

  return Boolean(findGenomeCardByTitle(cleaned) || findGenomeCardByTitle(raw));
}
`;

src = src.replace(parseMarker, `${helper}\n${parseMarker}`);
ok('Added known-title helper.');

// 3) Route known title questions/bare titles before the generic question fallback.
const finalReturn = "  return { kind: 'question', text: raw };";
if (!src.includes(finalReturn)) {
  fail('Could not find the final generic question return. The file shape changed.');
}

const inserted = `
  // PATCH_0038_ONE_BRAIN_ROUTER
  // If the user types a known title directly ("slime", "re zero") or asks a simple
  // title question ("what is slime"), route it through the same Gold/Genome path as
  // "recommend slime".
  if (isKnownGenomeTitleQuery(raw)) {
    return { kind: 'recommendation' };
  }

${finalReturn}`;

src = src.replace(finalReturn, inserted);
ok('Unified bare known-title lookup with recommendation routing.');

// Basic sanity checks.
if (!src.includes('PATCH_0038_ONE_BRAIN_ROUTER')) fail('Patch marker missing after write preparation.');
if (!src.includes('isKnownGenomeTitleQuery(raw)')) fail('Known-title routing guard missing after write preparation.');

fs.writeFileSync(file, src, 'utf8');

console.log('\n🎉 Patch 0038 installed.');
console.log('\nNext commands:');
console.log('  node scripts\\rebuildGenomeRegistry.cjs');
console.log('  npm run build');
console.log('\nTest prompts:');
console.log('  slime');
console.log('  re zero');
console.log('  what is slime');
console.log('  tell me about re zero');
