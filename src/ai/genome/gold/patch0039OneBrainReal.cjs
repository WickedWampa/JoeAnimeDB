const fs = require('fs');
const path = require('path');

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function write(rel, text) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}
function backup(rel) {
  const file = path.join(root, rel);
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak-patch0039-${stamp}`);
}
function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

console.log('\n=== PATCH 0039: One Brain Router Real Fix ===\n');

const commandRel = 'src/ai/commandExecutor.js';
const intentRel = 'src/ai/intentParser.js';
if (!fs.existsSync(path.join(root, commandRel))) fail(`Missing ${commandRel}`);
if (!fs.existsSync(path.join(root, intentRel))) fail(`Missing ${intentRel}`);

backup(commandRel);
backup(intentRel);

const directGenomeAnswer = `import { findGenomeCardFromRegistry as findGenomeCard } from './genome/genomeRegistry';

function cleanQuery(value = '') {
  return String(value || '')
    .trim()
    .replace(/^(please\\s+)?/i, '')
    .replace(/^(joeai\\s+)?/i, '')
    .replace(/^(recommend|show me|tell me about|what is|what's|why watch|why should i watch|should i watch|explain|lookup|search)\\s+/i, '')
    .replace(/\\?+$/g, '')
    .trim();
}

function isProbablyTitleQuery(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (raw.length > 90) return false;
  if (/[,\\n]/.test(raw)) return false;
  if (/\\b(like|similar to|something like|anime like|show like)\\b/i.test(raw)) return false;
  if (/\\b(help|stats|library status|top genre|top studio|currently watching|what am i watching)\\b/i.test(raw)) return false;
  if (/^(i want|give me|find me|make me|add|import|mark|set|put|finished|completed|watched|started)\\b/i.test(raw)) return false;
  // Allow known title-style prompts and short direct lookups.
  return /^(recommend|show me|tell me about|what is|what's|why watch|why should i watch|should i watch|explain|lookup|search)\\b/i.test(raw) || lower.split(/\\s+/).length <= 8;
}

function list(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value].filter(Boolean);
}

function first(value) {
  return list(value)[0] || '';
}

function titleOf(card) {
  return first(card.titles) || card.title || card.officialTitle || card.id || 'Unknown Anime';
}

function formatViewerFantasy(card) {
  const pillars = list(card.fantasyPillars || card.pillars || card.viewerFantasy?.pillars);
  const rewardLoop = card.rewardLoop || card.viewerFantasy?.rewardLoop;
  const bestFor = list(card.viewerType || card.bestFor || card.viewerFantasy?.bestFor);
  const lines = [];
  if (pillars.length) lines.push(`• Pillars: ${pillars.join(', ')}`);
  if (rewardLoop) lines.push(`• Reward loop: ${rewardLoop}`);
  if (bestFor.length) lines.push(`• Best for: ${bestFor.join(', ')}`);
  return lines;
}

function formatGoldCard(card) {
  if (!card) return null;
  const title = titleOf(card);
  const description = card.description || card.signature || card.hook || card.note || '';
  const coreFantasy = card.coreFantasy || card.coreAppeal || '';
  const viewerFantasy = formatViewerFantasy(card);
  const whyPick = list(card.dopamineSources || card.whyPick || card.whySomeoneWouldPickIt || card.chasing).slice(0, 8);
  const joeNote = card.joeNote || card.note || '';
  const nearby = list(card.idealFollowUps || card.nearbyPicks || card.followUps || card.recommendations).slice(0, 6);

  const parts = [`🧬 JoeAI Knows: ${title}`];

  if (description) parts.push('', description);

  if (coreFantasy) {
    parts.push('', 'Core Fantasy:', coreFantasy);
  }

  if (viewerFantasy.length) {
    parts.push('', 'Viewer Fantasy:', viewerFantasy.join('\n'));
  }

  if (whyPick.length) {
    parts.push('', 'Why someone would pick it:', whyPick.map((item) => `• ${item}`).join('\n'));
  }

  if (joeNote) {
    parts.push('', `Joe Note: ${joeNote}`);
  }

  if (nearby.length) {
    parts.push('', 'If that sounds good, nearby picks are:', nearby.map((item) => `• ${item}`).join('\n'));
  }

  return parts.join('\n');
}

export function maybeDirectGenomeAnswer(input = '') {
  const raw = String(input || '').trim();
  if (!isProbablyTitleQuery(raw)) return null;

  const cleaned = cleanQuery(raw);
  if (!cleaned) return null;

  const card = findGenomeCard(cleaned) || findGenomeCard(raw);
  if (!card) return null;

  return formatGoldCard(card);
}
`;
write('src/ai/directGenomeAnswer.js', directGenomeAnswer);
console.log('✓ Wrote src/ai/directGenomeAnswer.js');

let command = read(commandRel);
if (!command.includes("./directGenomeAnswer")) {
  command = command.replace(
    "import { maybeKnowledgeFirstRecommendation } from './knowledgeFirstRecommender';",
    "import { maybeKnowledgeFirstRecommendation } from './knowledgeFirstRecommender'; import { maybeDirectGenomeAnswer } from './directGenomeAnswer';"
  );
}
if (!command.includes('PATCH0039_DIRECT_GENOME_FIRST')) {
  command = command.replace(
    "const knowledgeFirstAnswer = maybeKnowledgeFirstRecommendation(text, anime, catalog); if (knowledgeFirstAnswer) { return makeTextResult(knowledgeFirstAnswer); }",
    "// PATCH0039_DIRECT_GENOME_FIRST\n  const directGenomeAnswer = maybeDirectGenomeAnswer(text);\n  if (directGenomeAnswer) { return makeTextResult(directGenomeAnswer); }\n  const knowledgeFirstAnswer = maybeKnowledgeFirstRecommendation(text, anime, catalog); if (knowledgeFirstAnswer) { return makeTextResult(knowledgeFirstAnswer); }"
  );
}
if (!command.includes('PATCH0039_RECOMMEND_TITLE_GENOME')) {
  command = command.replace(
    "case 'recommendation': { const picks = brain?.recommendations?.(5) || [];",
    "case 'recommendation': {\n      // PATCH0039_RECOMMEND_TITLE_GENOME\n      const directGenomeAnswer = maybeDirectGenomeAnswer(intent.text || '');\n      if (directGenomeAnswer) return makeTextResult(directGenomeAnswer);\n      const picks = brain?.recommendations?.(5) || [];"
  );
}
write(commandRel, command);
console.log('✓ Patched src/ai/commandExecutor.js');

let intent = read(intentRel);
if (!intent.includes('PATCH0039_RECOMMENDATION_TEXT')) {
  intent = intent.replace(
    "if (moodRecommendationWords.some((word) => lower.includes(word))) { return { kind: 'recommendation' }; }",
    "if (moodRecommendationWords.some((word) => lower.includes(word))) { return { kind: 'recommendation', text: raw }; } // PATCH0039_RECOMMENDATION_TEXT"
  );
  intent = intent.replace(
    "if (lower.includes('recommend') || lower.includes('next') || lower.includes('watch') || lower.includes('new anime')) { return { kind: 'recommendation' }; }",
    "if (lower.includes('recommend') || lower.includes('next') || lower.includes('watch') || lower.includes('new anime')) { return { kind: 'recommendation', text: raw }; } // PATCH0039_RECOMMENDATION_TEXT"
  );
}
write(intentRel, intent);
console.log('✓ Patched src/ai/intentParser.js');

const smoke = `console.log('\\n=== JoeAnimeDB Dev Smoke Checklist ===\\n');
console.log('Run the app with: npm run dev');
console.log('Then test these in JoeAI:');
console.log('  1. slime');
console.log('  2. recommend slime');
console.log('  3. re zero');
console.log('  4. recommend re zero');
console.log('  5. one piece');
console.log('  6. recommend one piece');
console.log('\\nExpected: plain title and recommend-title should both show rich Gold cards.\\n');
`;
write('scripts/devSmokeChecklist.cjs', smoke);
console.log('✓ Wrote scripts/devSmokeChecklist.cjs');

console.log('\n✅ Patch 0039 installed.\n');
console.log('Now run:');
console.log('  node scripts\\rebuildGenomeRegistry.cjs');
console.log('  npm run dev');
console.log('  node scripts\\devSmokeChecklist.cjs   (optional reminder)\n');
