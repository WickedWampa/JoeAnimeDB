const fs = require('fs');
const path = require('path');

const root = process.cwd();

function ok(label, condition) {
  console.log(label + ':', condition ? 'OK' : 'MISSING');
}

ok('hook moved', fs.existsSync(path.join(root, 'src', 'hooks', 'useAnimeLibrary.js')));
ok('old hook removed', !fs.existsSync(path.join(root, 'src', 'styles', 'useAnimeLibrary.js')));
ok('import cleanup', !fs.readFileSync(path.join(root, 'src', 'hooks', 'useAnimeLibrary.js'), 'utf8').includes('styles'));
ok('batch generator', fs.existsSync(path.join(root, 'scripts', 'generateMissingGenomesForList.cjs')));

const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
const hook = fs.readFileSync(path.join(root, 'src', 'hooks', 'useAnimeLibrary.js'), 'utf8');

ok('batch IPC', main.includes("ipcMain.handle('genome:generateMissingForLibrary'"));
ok('preload batch bridge', preload.includes('generateMissingGenomesForLibrary'));
ok('smart metadata skip', hook.includes('shouldRefreshMetadata'));
