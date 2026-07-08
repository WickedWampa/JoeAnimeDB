const fs = require('fs');
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
