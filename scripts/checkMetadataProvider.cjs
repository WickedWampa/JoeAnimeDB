const fs = require('fs');
const path = require('path');

const root = process.cwd();

function ok(label, condition) {
  console.log(label + ':', condition ? 'OK' : 'MISSING');
}

ok('manual overrides', fs.existsSync(path.join(root, 'src', 'data', 'manualMetadataOverrides.js')));
ok('metadata provider', fs.existsSync(path.join(root, 'src', 'services', 'metadataProvider.js')));

const hookPath = fs.existsSync(path.join(root, 'src', 'hooks', 'useAnimeLibrary.js'))
  ? path.join(root, 'src', 'hooks', 'useAnimeLibrary.js')
  : path.join(root, 'src', 'styles', 'useAnimeLibrary.js');

const hook = fs.readFileSync(hookPath, 'utf8');
ok('hook uses provider', hook.includes('fetchMetadataFromProvider'));
ok('manual override repair included', hook.includes('hasManualMetadataOverride'));

const generator = fs.readFileSync(path.join(root, 'scripts', 'generateGenomeCardForTitle.cjs'), 'utf8');
ok('generator manual fallback', generator.includes('loadManualMetadataForGenerator'));
