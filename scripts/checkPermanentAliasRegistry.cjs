const fs = require('fs');
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
