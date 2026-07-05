// Fixed version of patchFastLocalHealthUpdater.cjs
// Regex corrected.

const fs = require('fs');
const path = require('path');

function patchPreload(root) {
  const file = path.join(root, 'electron', 'preload.cjs');
  if (!fs.existsSync(file)) {
    console.log('Missing preload.cjs');
    return;
  }

  let text = fs.readFileSync(file, 'utf8');

  if (text.includes('generateMissingGenomesForLibrary:')) {
    console.log('Bridge already exists.');
    return;
  }

  text = text.replace(
    /contextBridge\.exposeInMainWorld\(\s*['"]JoeAnimeDB['"]\s*,\s*\{/,
    match =>
      match +
      "\n  generateMissingGenomesForLibrary: (animeList, options) => ipcRenderer.invoke('genome:generateMissingForLibrary', animeList, options),"
  );

  fs.writeFileSync(file, text, 'utf8');
  console.log('Patched preload.cjs successfully.');
}

patchPreload(process.cwd());
