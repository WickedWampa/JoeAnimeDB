const fs = require('fs');
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
