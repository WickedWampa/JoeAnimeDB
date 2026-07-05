const fs = require('fs');
const path = require('path');

function findRoot(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'src'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const root = findRoot(process.cwd());

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function moveFile(fromRel, toRel) {
  const from = path.join(root, fromRel);
  const to = path.join(root, toRel);

  if (!fs.existsSync(from)) {
    console.log('Skip missing:', fromRel);
    return false;
  }

  ensureDir(path.dirname(to));

  if (fs.existsSync(to)) {
    console.log('Target already exists:', toRel);
    return false;
  }

  fs.renameSync(from, to);
  console.log('Moved:', fromRel, '->', toRel);
  return true;
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function write(rel, text) {
  fs.writeFileSync(path.join(root, rel), text, 'utf8');
}

function patchFile(rel, fn) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    console.warn('Missing:', rel);
    return;
  }

  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before);

  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    console.log('Patched:', rel);
  } else {
    console.log('No change needed:', rel);
  }
}

console.log('');
console.log('=== JoeAnimeDB cleanup + smart updater ===');
console.log('Root:', root);
console.log('');

// 1) Move JavaScript files out of src/styles.
moveFile('src/styles/useAnimeLibrary.js', 'src/hooks/useAnimeLibrary.js');
moveFile('src/styles/animeImporter.js', 'src/services/animeImporter.js');

// 2) Patch imports across src.
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

for (const file of walk(path.join(root, 'src'))) {
  let text = fs.readFileSync(file, 'utf8');
  const before = text;

  // Common old paths to new paths.
  text = text.replaceAll("./styles/useAnimeLibrary", "./hooks/useAnimeLibrary");
  text = text.replaceAll("../styles/useAnimeLibrary", "../hooks/useAnimeLibrary");
  text = text.replaceAll("../../styles/useAnimeLibrary", "../../hooks/useAnimeLibrary");

  text = text.replaceAll("./styles/animeImporter", "./services/animeImporter");
  text = text.replaceAll("../styles/animeImporter", "../services/animeImporter");
  text = text.replaceAll("../../styles/animeImporter", "../../services/animeImporter");

  // If a file inside src/hooks imports from old relative locations after move.
  if (file.endsWith(path.join('src', 'hooks', 'useAnimeLibrary.js'))) {
    text = text.replaceAll("from '../utils/animeUtils'", "from '../utils/animeUtils'");
    text = text.replaceAll("from '../services/metadata'", "from '../services/metadata'");
    text = text.replaceAll("from '../repositories/animeRepository'", "from '../repositories/animeRepository'");
    text = text.replaceAll("from '../services/catalogService'", "from '../services/catalogService'");
    text = text.replaceAll("from '../data/animeSeed.json'", "from '../data/animeSeed.json'");
  }

  if (file.endsWith(path.join('src', 'services', 'animeImporter.js'))) {
    // File moved from src/styles to src/services. Its old imports likely used ../services/metadata.
    // From src/services it should import sibling metadata as ./metadata.
    text = text.replaceAll("from '../services/metadata'", "from './metadata'");
    text = text.replaceAll('from "../services/metadata"', 'from "./metadata"');
  }

  if (text !== before) {
    fs.writeFileSync(file, text, 'utf8');
    console.log('Updated imports:', path.relative(root, file));
  }
}

// 3) Replace useAnimeLibrary with smart local audit updater.
const hookRel = 'src/hooks/useAnimeLibrary.js';
if (!fs.existsSync(path.join(root, hookRel))) {
  console.error('Could not find moved hook:', hookRel);
  process.exit(1);
}

let hook = read(hookRel);

if (!hook.includes('function hasGoodMetadata')) {
  const helpers = `
function hasGoodMetadata(item = {}) {
  return Boolean(
    item.malId ||
    item.officialTitle ||
    item.synopsis ||
    item.description ||
    item.studio ||
    item.year ||
    item.episodeCount ||
    item.episodes ||
    (Array.isArray(item.genres) && item.genres.length)
  );
}

function metadataIsStale(item = {}) {
  if (!item.metadataUpdatedAt) return false;

  const updated = new Date(item.metadataUpdatedAt).getTime();
  if (!Number.isFinite(updated)) return false;

  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return Date.now() - updated > thirtyDays && !hasGoodMetadata(item);
}

function shouldRefreshMetadata(item = {}) {
  return needsArtworkRepair(item) || !hasGoodMetadata(item) || metadataIsStale(item) || item.syncStatus?.dirty;
}

function setItemSyncStatus(item = {}, patch = {}) {
  return {
    ...item,
    syncStatus: {
      ...(item.syncStatus || {}),
      ...patch
    }
  };
}

`;

  hook = hook.replace("const emptyProgress = {", helpers + "\nconst emptyProgress = {");
}

// Make progress label dynamic.
hook = hook.replace(
`  function setLibraryProgress({ processed, total, title }) {
    const percent = total ? Math.round((processed / total) * 50) : 0;

    setSyncProgress({
      step: 1,
      stepTotal: 2,
      label: 'Refreshing Library Metadata',
      processed,
      total,
      percent,
      current: title
    });
  }`,
`  function setLibraryProgress({ processed, total, title, label = 'Refreshing Library Metadata' }) {
    const percent = total ? Math.round((processed / total) * 50) : 0;

    setSyncProgress({
      step: 1,
      stepTotal: 2,
      label,
      processed,
      total,
      percent,
      current: title
    });
  }`
);

const syncStart = hook.indexOf("  async function syncMetadata() {");
const syncEnd = hook.indexOf("\n  return {", syncStart);

if (syncStart === -1 || syncEnd === -1) {
  console.error('Could not find syncMetadata function boundaries.');
  process.exit(1);
}

const newSync = `  async function syncMetadata() {
    const auditRows = anime.map((item, index) => ({
      item,
      index,
      needsMetadata: shouldRefreshMetadata(item),
      needsArtwork: needsArtworkRepair(item)
    }));

    const updateQueue = auditRows.filter((row) => row.needsMetadata);
    const alreadyReady = auditRows.length - updateQueue.length;

    const message = [
      'Smart database update:',
      '',
      \`• \${anime.length} titles scanned locally\`,
      \`• \${alreadyReady} already have usable metadata/artwork\`,
      \`• \${updateQueue.length} need Jikan metadata/artwork repair\`,
      '',
      updateQueue.length
        ? 'Only missing/dirty titles will hit Jikan.'
        : 'No Jikan metadata refresh needed.',
      '',
      'Continue and build recommendation catalog / genomes?'
    ].join('\\n');

    if (!confirm(message)) return;

    setSyncing(true);
    setSyncText('Scanning local database...');
    setSyncProgress({
      ...emptyProgress,
      label: 'Local Database Audit',
      processed: alreadyReady,
      total: anime.length,
      percent: updateQueue.length ? 1 : 50,
      current: \`\${alreadyReady} skipped locally\`
    });

    let nextAnime = [...anime];

    if (updateQueue.length) {
      for (let passIndex = 0; passIndex < updateQueue.length; passIndex++) {
        const { index } = updateQueue[passIndex];
        const title = nextAnime[index].title;
        const isRepair = needsArtworkRepair(nextAnime[index]);

        setLibraryProgress({
          processed: passIndex + 1,
          total: updateQueue.length,
          title,
          label: isRepair ? 'Repairing Artwork / Metadata' : 'Refreshing Missing Metadata'
        });

        setSyncText(\`\${isRepair ? 'Repairing artwork' : 'Refreshing missing metadata'} \${passIndex + 1}/\${updateQueue.length}: \${title}\`);

        try {
          const refreshed = await fetchMetadata(nextAnime[index]);
          nextAnime[index] = setItemSyncStatus(refreshed, {
            metadata: true,
            poster: !needsArtworkRepair(refreshed),
            dirty: false,
            lastMetadataSync: new Date().toISOString()
          });
        } catch (error) {
          console.warn('Metadata failed:', title, error);
          nextAnime[index] = setItemSyncStatus(nextAnime[index], {
            metadataError: error?.message || String(error),
            lastMetadataAttempt: new Date().toISOString()
          });
        }

        const saved = await updateData({ ...data, anime: nextAnime });
        nextAnime = [...(saved.anime || nextAnime)];
        await sleep(isRepair ? 1750 : 1250);
      }
    } else {
      setSyncText(\`Local scan complete — \${alreadyReady} titles skipped. No metadata calls needed.\`);
      await sleep(500);
    }

    const latest = await animeRepository.getDatabase();

    const catalogResult = await updateCatalogMetadata({
      library: latest.anime || nextAnime,
      catalog: latest.catalog || catalog,
      repository: animeRepository,
      limit: 50,
      onProgress: ({ index, total, title }) => {
        setCatalogProgress({
          processed: index,
          total,
          title
        });

        setSyncText(\`Building recommendation catalog \${index}/\${total}: \${title}\`);
      }
    });

    let savedData = catalogResult.saved;

    if (window.JoeAnimeDB?.generateMissingGenomesForLibrary) {
      setSyncProgress({
        step: 2,
        stepTotal: 2,
        label: 'Generating Missing Genomes',
        processed: 0,
        total: savedData.anime?.length || 0,
        percent: 95,
        current: 'Local Genome audit first'
      });

      setSyncText('Checking local Genome coverage and generating only missing cards...');

      const genomeResult = await window.JoeAnimeDB.generateMissingGenomesForLibrary(savedData.anime || [], {
        limit: 0,
        delayMs: 1200
      });

      if (!genomeResult?.ok) {
        console.warn('Genome batch failed:', genomeResult);
        setSyncText('Catalog updated, but Genome generation failed: ' + (genomeResult?.error || 'Unknown error'));
      }
    }

    setData(savedData);

    const missing = (savedData.anime || nextAnime).filter((item) => needsArtworkRepair(item)).length;

    setSyncProgress({
      step: 2,
      stepTotal: 2,
      label: 'Update Complete',
      processed: catalogResult.updated,
      total: catalogResult.total,
      percent: 100,
      current: ''
    });

    setSyncText(
      missing
        ? \`Done — \${alreadyReady} skipped locally, \${updateQueue.length} refreshed, \${missing} poster(s) still need manual art. Catalog/genomes updated.\`
        : \`Done — \${alreadyReady} skipped locally, \${updateQueue.length} refreshed. Catalog/genomes updated.\`
    );

    await sleep(2200);
    setSyncing(false);
    setSyncText('');
    setSyncProgress(emptyProgress);
  }
`;

hook = hook.slice(0, syncStart) + newSync + hook.slice(syncEnd);
write(hookRel, hook);

// 4) Add/repair batch Genome IPC bridge if not already present.
patchFile('electron/main.cjs', (text) => {
  let out = text;

  if (!out.includes("const { execFile } = require('child_process');")) {
    out = out.replace(
      "const path = require('path');",
      "const path = require('path');\nconst { execFile } = require('child_process');"
    );
  }

  if (!out.includes('function joeRunNodeScript')) {
    const helper = `
function joeRunNodeScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [scriptPath, ...args], { cwd: path.join(__dirname, '..') }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

`;
    out = out.includes("let mainWindow") ? out.replace("let mainWindow", helper + "let mainWindow") : helper + out;
  }

  if (!out.includes("ipcMain.handle('genome:generateMissingForLibrary'")) {
    const handler = `
ipcMain.handle('genome:generateMissingForLibrary', async (_event, animeList, options = {}) => {
  try {
    const cleanList = Array.isArray(animeList) ? animeList : [];
    const limit = Number(options.limit || 0);
    const delayMs = Number(options.delayMs || 1200);
    const tempFile = path.join(__dirname, '..', '.tmp-genome-library.json');
    const batchScript = path.join(__dirname, '..', 'scripts', 'generateMissingGenomesForList.cjs');

    fs.writeFileSync(tempFile, JSON.stringify(cleanList, null, 2), 'utf8');

    const result = await joeRunNodeScript(batchScript, [
      tempFile,
      String(limit),
      String(delayMs)
    ]);

    try { fs.unlinkSync(tempFile); } catch {}

    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      ok: false,
      error: error.message || String(error),
      stdout: error.stdout || '',
      stderr: error.stderr || ''
    };
  }
});

`;
    out = out.includes("app.whenReady") ? out.replace("app.whenReady", handler + "\napp.whenReady") : out + "\n" + handler;
  }

  return out;
});

patchFile('electron/preload.cjs', (text) => {
  if (text.includes("generateMissingGenomesForLibrary:")) return text;

  return text.replace(
    /contextBridge\.exposeInMainWorld\(\s*['"]JoeAnimeDB['"]\s*,\s*\{/,
    (match) => match + "\n  generateMissingGenomesForLibrary: (animeList, options) => ipcRenderer.invoke('genome:generateMissingForLibrary', animeList, options),"
  );
});

// 5) Batch generator if missing.
const batchFile = path.join(root, 'scripts', 'generateMissingGenomesForList.cjs');
if (!fs.existsSync(batchFile)) {
  const batchScript = `const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const root = process.cwd();

function runNode(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [scriptPath, ...args], { cwd: root }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTitle(item) {
  if (typeof item === 'string') return item.trim();
  return String(item?.officialTitle || item?.titleEnglish || item?.title || item?.name || '').trim();
}

function normalizeKey(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').toLowerCase() : '';
}

function hasGenome(title, combinedText) {
  const clean = normalizeKey(title);
  if (!clean || clean.length < 3) return true;
  return combinedText.includes(clean) || combinedText.includes(clean.replaceAll(' ', '-'));
}

async function main() {
  const inputFile = process.argv[2];
  const limit = Number(process.argv[3] || 0);
  const delayMs = Number(process.argv[4] || 1200);

  const raw = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.anime || raw.items || raw.library || [];
  const titles = [...new Set(list.map(normalizeTitle).filter(Boolean))];

  const registry = readIfExists(path.join(root, 'src', 'ai', 'genome', 'genomeRegistry.js'));
  const generated = readIfExists(path.join(root, 'src', 'ai', 'genome', 'generated', 'generatedGenomeCards.js'));
  const combined = registry + '\\n' + generated;

  const missing = titles.filter((title) => !hasGenome(title, combined));
  const queue = limit > 0 ? missing.slice(0, limit) : missing;

  console.log('Local Genome audit complete.');
  console.log('Titles:', titles.length);
  console.log('Already covered:', titles.length - missing.length);
  console.log('Missing:', missing.length);
  console.log('Generating:', queue.length);

  if (!queue.length) return;

  const generator = path.join(root, 'scripts', 'generateGenomeCardForTitle.cjs');
  const rebuild = path.join(root, 'scripts', 'rebuildGenomeRegistry.cjs');

  for (const title of queue) {
    console.log('Generating Genome:', title);
    await runNode(generator, [title]);
    await sleep(delayMs);
  }

  await runNode(rebuild, []);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;
  fs.writeFileSync(batchFile, batchScript, 'utf8');
  console.log('Created:', path.relative(root, batchFile));
}

// 6) Check script.
const check = `const fs = require('fs');
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
`;

fs.writeFileSync(path.join(root, 'scripts', 'checkMoveAndSmartUpdater.cjs'), check, 'utf8');

// 7) Documentation.
const doc = `# Move JS Out of Styles + Smart Updater

## What changed

- Moved \`src/styles/useAnimeLibrary.js\` to \`src/hooks/useAnimeLibrary.js\`
- Moved \`src/styles/animeImporter.js\` to \`src/services/animeImporter.js\`
- Updated imports across \`src\`
- Upgraded metadata update to local-audit first:
  - skip titles that already have usable metadata/artwork
  - only hit Jikan for missing/dirty/repair items
  - then build catalog
  - then generate missing Genome cards

## Test

\`\`\`cmd
node scripts\\checkMoveAndSmartUpdater.cjs
npm run dev
\`\`\`

Then go to Settings and run the updater.

## Commit

\`\`\`cmd
git add .
git commit -m "refactor: move hooks out of styles and add smart updater"
git push
\`\`\`
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'MOVE_JS_AND_SMART_UPDATER.md'), doc, 'utf8');

console.log('');
console.log('Done.');
console.log('Run: node scripts\\\\checkMoveAndSmartUpdater.cjs');
