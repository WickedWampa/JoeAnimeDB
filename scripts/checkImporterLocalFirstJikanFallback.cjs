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
const file = path.join(root, 'src', 'services', 'animeImporter.js');
const text = fs.readFileSync(file, 'utf8');

function ok(label, condition) {
  console.log(label + ':', condition ? 'OK' : 'MISSING');
}

ok('local fallback helper', text.includes('createLocalFallbackAnime'));
ok('local-first duplicate helper', text.includes('findLocalTitleMatch'));
ok('metadata health helper', text.includes('localEntryHasUsableMetadata'));
ok('Jikan try/catch', text.includes('try {') && text.includes('searchAnimeCandidates(title'));
ok('metadataNeedsRefresh fallback', text.includes('metadataNeedsRefresh'));

console.log('');
console.log('Test in app:');
console.log('add Bleach');
console.log('add Trigun');
console.log('add as completed Bleach, Naruto, One Piece');
