const fs = require('fs');
const path = require('path');

function findRoot(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (
      fs.existsSync(path.join(dir, 'package.json')) &&
      fs.existsSync(path.join(dir, 'electron', 'main.cjs')) &&
      fs.existsSync(path.join(dir, 'src'))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const root = findRoot(process.cwd());

function patchFile(rel, fn) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    console.warn('Missing ' + rel);
    return false;
  }

  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before);

  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    console.log('Patched ' + rel);
  } else {
    console.log('No change needed ' + rel);
  }

  return true;
}

// 1) Batch generator script.
// Scans a JSON export/list of anime objects or titles and generates missing Genome drafts.
const batchScript = `const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

function findRoot(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'src'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

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

function normalizeTitle(item) {
  if (typeof item === 'string') return item.trim();
  return String(item?.officialTitle || item?.titleEnglish || item?.title || item?.name || '').trim();
}

function existingGenomeTitles() {
  const registryFile = path.join(root, 'src', 'ai', 'genome', 'genomeRegistry.js');
  if (!fs.existsSync(registryFile)) return new Set();

  const text = fs.readFileSync(registryFile, 'utf8').toLowerCase();
  return {
    has(title) {
      const clean = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!clean || clean.length < 3) return true;
      return text.includes(clean) || text.includes(clean.replaceAll(' ', '-'));
    }
  };
}

const root = findRoot(process.cwd());

async function main() {
  const inputFile = process.argv[2];
  const limit = Number(process.argv[3] || 0);

  if (!inputFile || !fs.existsSync(inputFile)) {
    console.error('Usage: node scripts/generateMissingGenomesForList.cjs <anime-list.json> [limit]');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.anime || raw.items || raw.library || [];
  const titles = [...new Set(list.map(normalizeTitle).filter(Boolean))];

  const registry = existingGenomeTitles();
  const missing = titles.filter((title) => !registry.has(title));
  const queue = limit > 0 ? missing.slice(0, limit) : missing;

  const generator = path.join(root, 'scripts', 'generateGenomeCardForTitle.cjs');
  const rebuild = path.join(root, 'scripts', 'rebuildGenomeRegistry.cjs');

  const generated = [];
  const skipped = titles.filter((title) => registry.has(title));
  const failed = [];

  console.log('Anime titles found:', titles.length);
  console.log('Already have Genome:', skipped.length);
  console.log('Missing Genome:', missing.length);
  console.log('Generating now:', queue.length);

  for (const title of queue) {
    try {
      console.log('');
      console.log('Generating Genome:', title);
      await runNode(generator, [title]);
      generated.push(title);
      await new Promise((resolve) => setTimeout(resolve, 900));
    } catch (error) {
      failed.push(title + (error.message ? ': ' + error.message : ''));
      console.warn('Failed:', title, error.message);
    }
  }

  console.log('');
  console.log('Rebuilding registry...');
  await runNode(rebuild, []);

  console.log('');
  console.log('Genome batch complete.');
  console.log('Generated:', generated.length);
  console.log('Skipped:', skipped.length);
  console.log('Failed:', failed.length);

  if (failed.length) {
    console.log('');
    console.log('Failed titles:');
    failed.forEach((x) => console.log('- ' + x));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

fs.writeFileSync(path.join(root, 'scripts', 'generateMissingGenomesForList.cjs'), batchScript, 'utf8');

// 2) Electron main: add batch IPC endpoint if helper already exists from bridge v2.
// Also add helper if missing.
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
    execFile(
      process.execPath,
      [scriptPath, ...args],
      { cwd: path.join(__dirname, '..') },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }

        resolve({ stdout, stderr });
      }
    );
  });
}

`;
    if (out.includes("let mainWindow")) {
      out = out.replace("let mainWindow", helper + "let mainWindow");
    } else {
      out = helper + out;
    }
  }

  if (!out.includes("ipcMain.handle('genome:generateMissingForLibrary'")) {
    const handler = `
ipcMain.handle('genome:generateMissingForLibrary', async (_event, animeList, options = {}) => {
  try {
    const cleanList = Array.isArray(animeList) ? animeList : [];
    const limit = Number(options.limit || 0);
    const tempFile = path.join(__dirname, '..', '.tmp-genome-library.json');
    const batchScript = path.join(__dirname, '..', 'scripts', 'generateMissingGenomesForList.cjs');

    fs.writeFileSync(tempFile, JSON.stringify(cleanList, null, 2), 'utf8');

    const result = await joeRunNodeScript(batchScript, [
      tempFile,
      String(limit)
    ]);

    try {
      fs.unlinkSync(tempFile);
    } catch {}

    return {
      ok: true,
      stdout: result.stdout,
      stderr: result.stderr
    };
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
    if (out.includes("app.whenReady")) {
      out = out.replace("app.whenReady", handler + "\napp.whenReady");
    } else {
      out += "\n" + handler;
    }
  }

  return out;
});

// 3) Preload: expose batch function on window.JoeAnimeDB.
patchFile('electron/preload.cjs', (text) => {
  let out = text;

  if (!out.includes("generateMissingGenomesForLibrary:")) {
    out = out.replace(
      /contextBridge\.exposeInMainWorld\(\s*['"]JoeAnimeDB['"]\s*,\s*\{/,
      (match) => match + "\n  generateMissingGenomesForLibrary: (animeList, options) => ipcRenderer.invoke('genome:generateMissingForLibrary', animeList, options),"
    );
  }

  return out;
});

// 4) Patch SettingsPage update database button behavior.
// We will wrap syncMetadata with genome generation if possible.
patchFile('src/pages/PlaceholderPages.jsx', (text) => {
  if (text.includes("async function updateDatabaseWithGenomes")) return text;

  let out = text;

  const marker = `export function SettingsPage({
  data,
  syncMetadata,`;
  if (!out.includes(marker)) {
    console.warn('Could not find SettingsPage marker.');
    return out;
  }

  const helperInsert = `export function SettingsPage({
  data,
  syncMetadata,`;

  out = out.replace(marker, helperInsert);

  const statusHookMarker = `}) {
  return (`;
  const statusHook = `}) {
  const [genomeUpdateStatus, setGenomeUpdateStatus] = React.useState('');

  async function updateDatabaseWithGenomes() {
    setGenomeUpdateStatus('Updating database metadata...');

    try {
      await syncMetadata?.();

      if (window.JoeAnimeDB?.generateMissingGenomesForLibrary) {
        setGenomeUpdateStatus('Generating missing Genome cards...');

        const result = await window.JoeAnimeDB.generateMissingGenomesForLibrary(data?.anime || data || [], {
          limit: 0
        });

        if (result?.ok) {
          setGenomeUpdateStatus('Database updated and missing Genome cards generated. Restart/refresh if new cards do not appear immediately.');
        } else {
          setGenomeUpdateStatus('Database updated, but Genome generation failed: ' + (result?.error || 'Unknown error'));
        }
      } else {
        setGenomeUpdateStatus('Database updated. Genome bridge is not available yet.');
      }
    } catch (error) {
      setGenomeUpdateStatus('Update failed: ' + (error?.message || String(error)));
    }
  }

  return (`;

  out = out.replace(statusHookMarker, statusHook);

  out = out.replace(
    `<button onClick={syncMetadata}>Update Database</button>`,
    `<button onClick={updateDatabaseWithGenomes}>Update Database + Genomes</button>`
  );

  out = out.replace(
    `<div className="settingsActions">`,
    `{genomeUpdateStatus && <p className="settingsStatus">{genomeUpdateStatus}</p>}
      <div className="settingsActions">`
  );

  return out;
});

// 5) Bridge check script.
const check = `const fs = require('fs');
const path = require('path');

const root = process.cwd();
const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
const pages = fs.readFileSync(path.join(root, 'src', 'pages', 'PlaceholderPages.jsx'), 'utf8');

console.log('Auto Genome on Update check:');
console.log('main batch IPC:', main.includes("ipcMain.handle('genome:generateMissingForLibrary'") ? 'OK' : 'MISSING');
console.log('preload batch bridge:', preload.includes('generateMissingGenomesForLibrary') ? 'OK' : 'MISSING');
console.log('settings button:', pages.includes('Update Database + Genomes') ? 'OK' : 'MISSING');
console.log('batch script:', fs.existsSync(path.join(root, 'scripts', 'generateMissingGenomesForList.cjs')) ? 'OK' : 'MISSING');
`;

fs.writeFileSync(path.join(root, 'scripts', 'checkAutoGenomeUpdate.cjs'), check, 'utf8');

const doc = `# Auto Generate Genomes on Database Update

This changes the Settings button from:

\`\`\`text
Update Database
\`\`\`

to:

\`\`\`text
Update Database + Genomes
\`\`\`

## What it does

1. Runs the existing metadata update.
2. Sends the library list to Electron main.
3. Generates missing Genome cards for titles without Genome coverage.
4. Rebuilds the Genome registry.

## Added

- scripts/generateMissingGenomesForList.cjs
- ipcMain handler: genome:generateMissingForLibrary
- preload bridge: window.JoeAnimeDB.generateMissingGenomesForLibrary
- Settings button wrapper
- scripts/checkAutoGenomeUpdate.cjs

## Test

\`\`\`cmd
node scripts\\checkAutoGenomeUpdate.cjs
npm run dev
\`\`\`

Then go to Settings and click:

\`\`\`text
Update Database + Genomes
\`\`\`

## Note

For a huge library, first run may take a while because Jikan requests are spaced out to avoid hammering the API.
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'AUTO_GENERATE_GENOMES_ON_DATABASE_UPDATE.md'), doc, 'utf8');

console.log('');
console.log('Auto-generate Genomes on database update installed.');
console.log('Run: node scripts\\\\checkAutoGenomeUpdate.cjs');
