const fs = require('fs');
const path = require('path');

const root = process.cwd();
function ok(label, condition) { console.log(label + ':', condition ? 'OK' : 'MISSING'); }

const gold = path.join(root, 'src', 'ai', 'genome', 'gold', 'goldStandardGenomeCards.js');
const registry = path.join(root, 'src', 'ai', 'genome', 'genomeRegistry.js');
const builder = path.join(root, 'scripts', 'rebuildGenomeRegistry.cjs');

ok('gold file', fs.existsSync(gold));

const registryText = fs.existsSync(registry) ? fs.readFileSync(registry, 'utf8') : '';
const builderText = fs.existsSync(builder) ? fs.readFileSync(builder, 'utf8') : '';

ok('registry imports gold', registryText.includes('GOLD_STANDARD_GENOME_CARDS'));
ok('registry priority merge', registryText.includes('mergeGenomeCardsByPriority'));
ok('builder mentions gold', builderText.includes('GOLD_STANDARD_GENOME_CARDS'));

console.log('');
console.log('Try: recommend One Piece');
console.log('Try: recommend Naruto');
console.log('Try: recommend Bleach');
