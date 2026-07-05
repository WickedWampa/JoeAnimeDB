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

// 1) Local audit module.
// No Jikan calls. No network. Just checks what is already complete.
const auditModule = `import { ACTIVE_GENOME_REGISTRY } from './genome/genomeRegistry';

function norm(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function titleKeys(item = {}) {
  return [
    item.title,
    item.officialTitle,
    item.titleEnglish,
    item.japaneseTitle,
    item.titleJapanese,
    ...(item.titleSynonyms || [])
  ].filter(Boolean).map(norm).filter(Boolean);
}

const genomeTitleSet = new Set(
  ACTIVE_GENOME_REGISTRY.flatMap((card) => [
    card.id,
    ...(card.titles || [])
  ]).filter(Boolean).map(norm)
);

function hasGenome(item = {}) {
  return titleKeys(item).some((key) => genomeTitleSet.has(key) || genomeTitleSet.has(key.replaceAll(' ', '-')));
}

function hasMetadata(item = {}) {
  return Boolean(
    item.malId ||
    item.officialTitle ||
    item.synopsis ||
    item.description ||
    item.studio ||
    item.year ||
    item.episodeCount ||
    item.episodes ||
    (item.genres && item.genres.length)
  );
}

function hasPoster(item = {}) {
  return Boolean(item.cover || item.image || item.poster || item.posterUrl || item.imageUrl);
}

function hasRelations(item = {}) {
  return Boolean(item.relations?.length || item.related?.length || item.franchise);
}

export function auditAnimeLibraryForUpdates(anime = []) {
  const rows = anime.map((item) => {
    const metadata = hasMetadata(item);
    const genome = hasGenome(item);
    const poster = hasPoster(item);
    const relations = hasRelations(item);

    const missing = [];
    if (!metadata) missing.push('metadata');
    if (!genome) missing.push('genome');
    if (!poster) missing.push('poster');

    const healthParts = [metadata, genome, poster, relations];
    const health = Math.round((healthParts.filter(Boolean).length / healthParts.length) * 100);

    return {
      id: item.id || item.malId || item.title,
      title: item.officialTitle || item.title,
      metadata,
      genome,
      poster,
      relations,
      missing,
      health,
      action: missing.length ? 'queued' : 'skipped'
    };
  });

  const complete = rows.filter((row) => row.metadata && row.genome && row.poster).length;
  const needsMetadata = rows.filter((row) => !row.metadata).length;
  const needsGenome = rows.filter((row) => !row.genome).length;
  const needsPoster = rows.filter((row) => !row.poster).length;
  const needsRelations = rows.filter((row) => !row.relations).length;

  const averageHealth = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + row.health, 0) / rows.length)
    : 100;

  return {
    total: rows.length,
    complete,
    skipped: complete,
    needsMetadata,
    needsGenome,
    needsPoster,
    needsRelations,
    averageHealth,
    metadataQueue: rows.filter((row) => !row.metadata).map((row) => row.title),
    genomeQueue: rows.filter((row) => !row.genome).map((row) => row.title),
    posterQueue: rows.filter((row) => !row.poster).map((row) => row.title),
    rows
  };
}

export function formatDatabaseHealthReport(report) {
  return [
    '🩺 JoeAnimeDB Health Report',
    '',
    \`Total titles: \${report.total}\`,
    \`Already complete: \${report.complete}\`,
    \`Needs metadata: \${report.needsMetadata}\`,
    \`Needs Genome: \${report.needsGenome}\`,
    \`Needs poster: \${report.needsPoster}\`,
    \`Needs relations: \${report.needsRelations}\`,
    '',
    \`Overall database health: \${report.averageHealth}%\`,
    '',
    report.genomeQueue.length
      ? 'Genome queue:\\n' + report.genomeQueue.slice(0, 20).map((title) => '• ' + title).join('\\n')
      : 'Genome queue: clear ✓'
  ].join('\\n');
}
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'databaseHealthAudit.js'), auditModule, 'utf8');

// 2) Batch generator now accepts audit/skip behavior and is more explicit.
// Existing script may already exist; patch with improved local-scan wording and polite delay.
const batchPath = path.join(root, 'scripts', 'generateMissingGenomesForList.cjs');
if (!fs.existsSync(batchPath)) {
  console.warn('Batch generator missing; creating it.');
}

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

const root = findRoot(process.cwd());

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

function registryText() {
  const registryFile = path.join(root, 'src', 'ai', 'genome', 'genomeRegistry.js');
  return fs.existsSync(registryFile) ? fs.readFileSync(registryFile, 'utf8').toLowerCase() : '';
}

function generatedText() {
  const generatedFile = path.join(root, 'src', 'ai', 'genome', 'generated', 'generatedGenomeCards.js');
  return fs.existsSync(generatedFile) ? fs.readFileSync(generatedFile, 'utf8').toLowerCase() : '';
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

  if (!inputFile || !fs.existsSync(inputFile)) {
    console.error('Usage: node scripts/generateMissingGenomesForList.cjs <anime-list.json> [limit] [delayMs]');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.anime || raw.items || raw.library || [];
  const titles = [...new Set(list.map(normalizeTitle).filter(Boolean))];

  const combined = registryText() + '\\n' + generatedText();

  console.log('Phase 1: Local Genome audit. No Jikan calls yet.');
  const skipped = [];
  const missing = [];

  for (const title of titles) {
    if (hasGenome(title, combined)) skipped.push(title);
    else missing.push(title);
  }

  const queue = limit > 0 ? missing.slice(0, limit) : missing;

  console.log('Local scan complete.');
  console.log('Anime titles found:', titles.length);
  console.log('Already have Genome:', skipped.length);
  console.log('Missing Genome:', missing.length);
  console.log('Generating now:', queue.length);
  console.log('Polite delay:', delayMs + 'ms');

  if (!queue.length) {
    console.log('Nothing to generate. Registry already has Genome coverage for this list.');
    return;
  }

  const generator = path.join(root, 'scripts', 'generateGenomeCardForTitle.cjs');
  const rebuild = path.join(root, 'scripts', 'rebuildGenomeRegistry.cjs');

  const generated = [];
  const failed = [];

  console.log('');
  console.log('Phase 2: Generate missing Genome cards only.');

  for (const title of queue) {
    try {
      console.log('');
      console.log('Generating Genome:', title);
      await runNode(generator, [title]);
      generated.push(title);
      await sleep(delayMs);
    } catch (error) {
      failed.push(title + (error.message ? ': ' + error.message : ''));
      console.warn('Failed:', title, error.message);
      await sleep(Math.max(delayMs, 2000));
    }
  }

  console.log('');
  console.log('Phase 3: Rebuilding registry once.');
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

fs.writeFileSync(batchPath, batchScript, 'utf8');

// 3) Patch Settings UI to show better local triage language.
// If previous patch already added updateDatabaseWithGenomes, replace its status messages with local scan framing.
patchFile('src/pages/PlaceholderPages.jsx', (text) => {
  let out = text;

  if (!out.includes("import { auditAnimeLibraryForUpdates")) {
    out = out.replace(
      "import { buildTonightsWatch } from '../ai/tonightsWatch';",
      "import { buildTonightsWatch } from '../ai/tonightsWatch'; import { auditAnimeLibraryForUpdates, formatDatabaseHealthReport } from '../ai/databaseHealthAudit';"
    );
  }

  if (out.includes("async function updateDatabaseWithGenomes()") && !out.includes("const audit = auditAnimeLibraryForUpdates")) {
    out = out.replace(
      "    setGenomeUpdateStatus('Updating database metadata...');",
      "    const audit = auditAnimeLibraryForUpdates(data?.anime || data || []);\\n    setGenomeUpdateStatus(formatDatabaseHealthReport(audit));"
    );

    out = out.replace(
      "        setGenomeUpdateStatus('Generating missing Genome cards...');",
      "        setGenomeUpdateStatus(formatDatabaseHealthReport(audit) + '\\\\n\\\\nGenerating missing Genome cards only...');"
    );

    out = out.replace(
      "          setGenomeUpdateStatus('Database updated and missing Genome cards generated. Restart/refresh if new cards do not appear immediately.');",
      "          setGenomeUpdateStatus(formatDatabaseHealthReport(audit) + '\\\\n\\\\nDatabase updated. Missing Genome cards generated. Registry rebuilt.');"
    );
  }

  // If auto-gen button has not been installed yet, add it conservatively.
  if (!out.includes("async function updateDatabaseWithGenomes")) {
    out = out.replace(
      "}) {\\n  return (",
      `}) {
  const [genomeUpdateStatus, setGenomeUpdateStatus] = React.useState('');

  async function updateDatabaseWithGenomes() {
    const audit = auditAnimeLibraryForUpdates(data?.anime || data || []);
    setGenomeUpdateStatus(formatDatabaseHealthReport(audit));

    try {
      await syncMetadata?.();

      if (window.JoeAnimeDB?.generateMissingGenomesForLibrary) {
        setGenomeUpdateStatus(formatDatabaseHealthReport(audit) + '\\n\\nGenerating missing Genome cards only...');

        const result = await window.JoeAnimeDB.generateMissingGenomesForLibrary(data?.anime || data || [], {
          limit: 0
        });

        if (result?.ok) {
          setGenomeUpdateStatus(formatDatabaseHealthReport(audit) + '\\n\\nDatabase updated. Missing Genome cards generated. Registry rebuilt.');
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

  return (`
    );

    out = out.replace(
      `<button onClick={syncMetadata}>Update Database</button>`,
      `<button onClick={updateDatabaseWithGenomes}>Update Database + Genomes</button>`
    );

    out = out.replace(
      `<div className="settingsActions">`,
      `{genomeUpdateStatus && <p className="settingsStatus">{genomeUpdateStatus}</p>}
      <div className="settingsActions">`
    );
  }

  return out;
});

// 4) Ensure Electron IPC batch bridge exists.
patchFile('electron/main.cjs', (text) => {
  let out = text;

  if (!out.includes("const { execFile } = require('child_process');")) {
    out = out.replace(
      "const path = require('path');",
      "const path = require('path');\\nconst { execFile } = require('child_process');"
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
    out = out.includes("app.whenReady") ? out.replace("app.whenReady", handler + "\\napp.whenReady") : out + "\\n" + handler;
  }

  return out;
});

patchFile('electron/preload.cjs', (text) => {
  if (text.includes("generateMissingGenomesForLibrary:")) return text;

  return text.replace(
    /contextBridge\\.exposeInMainWorld\\(\\s*['"]JoeAnimeDB['"]\\s*,\\s*\\{/,
    (match) => match + "\\n  generateMissingGenomesForLibrary: (animeList, options) => ipcRenderer.invoke('genome:generateMissingForLibrary', animeList, options),"
  );
});

// 5) Check script.
const check = `const fs = require('fs');
const path = require('path');

const root = process.cwd();
const checks = [
  ['databaseHealthAudit', path.join(root, 'src', 'ai', 'databaseHealthAudit.js')],
  ['batch generator', path.join(root, 'scripts', 'generateMissingGenomesForList.cjs')]
];

for (const [label, file] of checks) {
  console.log(label + ':', fs.existsSync(file) ? 'OK' : 'MISSING');
}

const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
const page = fs.readFileSync(path.join(root, 'src', 'pages', 'PlaceholderPages.jsx'), 'utf8');

console.log('batch IPC:', main.includes("ipcMain.handle('genome:generateMissingForLibrary'") ? 'OK' : 'MISSING');
console.log('preload bridge:', preload.includes('generateMissingGenomesForLibrary') ? 'OK' : 'MISSING');
console.log('local audit UI:', page.includes('auditAnimeLibraryForUpdates') ? 'OK' : 'MISSING');
`;

fs.writeFileSync(path.join(root, 'scripts', 'checkFastHealthUpdater.cjs'), check, 'utf8');

// 6) Docs.
const doc = `# Fast Local Health Updater

The updater now starts with a local audit before touching Jikan.

## Flow

1. Local scan:
   - metadata ✓
   - genome ✓
   - poster ✓
   - relations ✓

2. Instantly skips complete titles.

3. Only missing Genome cards are sent to the generator.

4. Registry rebuilds once at the end.

## Why this matters

This makes the updater feel much faster and avoids unnecessary Jikan requests.

## Test

\`\`\`cmd
node scripts\\checkFastHealthUpdater.cjs
npm run dev
\`\`\`

Then go to Settings and click:

\`\`\`text
Update Database + Genomes
\`\`\`

## Polite Jikan behavior

Batch generation uses a default 1200ms delay between generated titles.
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'FAST_LOCAL_HEALTH_UPDATER.md'), doc, 'utf8');

console.log('');
console.log('Fast local health updater installed.');
console.log('Run: node scripts\\\\checkFastHealthUpdater.cjs');
