const fs = require('fs');
const path = require('path');
const root = process.cwd();
function ok(label, condition) { console.log(label + ':', condition ? 'OK' : 'MISSING'); }
ok('metadataResolver', fs.existsSync(path.join(root, 'src', 'services', 'metadataResolver.js')));
const metadata = fs.readFileSync(path.join(root, 'src', 'services', 'metadata.js'), 'utf8');
ok('metadata checks manual first', metadata.includes('manual override before Jikan'));
const generated = fs.readFileSync(path.join(root, 'src', 'ai', 'genome', 'generated', 'generatedGenomeCards.js'), 'utf8');
ok('Arcane genome', generated.includes('"id": "arcane"'));
ok('Blue Eye Samurai genome', generated.includes('"id": "blue-eye-samurai"'));
