const fs = require('fs');
const path = require('path');

const root = process.cwd();
const target = path.join(root, 'src', 'ai', 'joeAIRecommendationRouter.js');

console.log('=== PATCH 0040: One Brain Alias Lookup ===');
console.log('Target:', path.relative(root, target));

if (!fs.existsSync(target)) {
  console.error('ERROR: Could not find src/ai/joeAIRecommendationRouter.js');
  process.exit(1);
}

let src = fs.readFileSync(target, 'utf8');

if (src.includes('PATCH_0040_ONE_BRAIN_ALIAS_LOOKUP')) {
  console.log('Patch already applied. Nothing to do.');
  process.exit(0);
}

const backup = target + '.backup-before-patch0040';
if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, src);
  console.log('Backup created:', path.relative(root, backup));
}

const needle = "function mentionedGenomeCard(question = '') { const q = norm(question);";
const insert = "function mentionedGenomeCard(question = '') { const q = norm(question); const directAliasCard = findGenomeCardFromRegistry(question); if (directAliasCard) return directAliasCard; // PATCH_0040_ONE_BRAIN_ALIAS_LOOKUP";

if (!src.includes(needle)) {
  console.error('ERROR: Could not find the expected mentionedGenomeCard function shape.');
  console.error('This means the router file changed. Send me a screenshot or the file and I will patch the new shape.');
  process.exit(1);
}

src = src.replace(needle, insert);
fs.writeFileSync(target, src);

console.log('Patched direct title/alias lookup into JoeAI recommendation router.');
console.log('Now plain queries like "slime" should hit the same Gold card path as "recommend slime".');
console.log('Next:');
console.log('  node scripts\\rebuildGenomeRegistry.cjs');
console.log('  npm run dev');
