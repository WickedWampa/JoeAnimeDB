import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const packageMetadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

function check(name, operation) {
  checks.push({ name, operation });
}

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }

  clear() {
    this.values.clear();
  }
}

globalThis.localStorage = new MemoryStorage();
globalThis.window = {
  JoeAnimeDB: { version: packageMetadata.version },
  dispatchEvent() {}
};
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { language: 'en-US', userAgent: 'JoeAnimeDB release gate' }
});
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};

const storage = await import('../src/services/storage.js');
const importer = await import('../src/services/libraryListImporter.js');
const safety = await import('../src/services/contentSafety.js');

check('local persistence round trip and corrupt-data fallback', () => {
  localStorage.clear();
  const seed = { anime: [{ id: 'seed' }] };
  const saved = { anime: [{ id: 'bleach', title: 'Bleach', joeScore: 9.9 }] };
  storage.saveData(saved);
  assert.deepEqual(storage.loadData(seed), saved);

  localStorage.setItem(storage.STORAGE_KEY, '{not valid json');
  assert.deepEqual(storage.loadData(seed), seed);
});

check('full backup creation, parse, and preference restore', () => {
  localStorage.clear();
  localStorage.setItem('joeanime-theme', 'inferno');
  localStorage.setItem('joeanime-display-name', 'Joe');
  localStorage.setItem('joeanime-discover-next-page', '4');

  const database = {
    anime: [{ id: 'bleach', title: 'Bleach' }],
    catalog: [{ id: 'one-piece', title: 'One Piece' }]
  };
  const payload = storage.buildBackupPayload(database);
  const restored = storage.parseBackupText(JSON.stringify(payload));

  assert.equal(payload.format, 'JoeAnimeDB Full Backup');
  assert.equal(payload.schemaVersion, 2);
  assert.equal(payload.preferences.theme, 'inferno');
  assert.deepEqual(restored.database, database);
  assert.equal(restored.preferences.discoverNextPage, '4');

  storage.applyBackupPreferences({
    theme: 'sakura',
    displayName: '',
    discoverNextPage: '8'
  });
  assert.equal(localStorage.getItem('joeanime-theme'), 'sakura');
  assert.equal(localStorage.getItem('joeanime-display-name'), null);
  assert.equal(localStorage.getItem('joeanime-discover-next-page'), '8');

  assert.throws(() => storage.parseBackupText('not-json'), /not valid JSON/i);
  assert.throws(() => storage.parseBackupText('{"hello":"world"}'), /not a JoeAnimeDB full backup/i);
});

check('MAL XML export and import preserve supported personal data', () => {
  const source = {
    anime: [
      {
        id: 'bleach',
        title: 'Bleach',
        malId: 269,
        status: 'Completed',
        episodeCount: 366,
        watchedEpisodes: 366,
        joeScore: 9.7,
        rewatches: 2,
        startDate: '2024-01-02',
        completedDate: '2024-04-03',
        notes: 'Still rules.',
        userTags: ['shonen', 'favorite']
      },
      {
        id: 'frieren',
        title: 'Frieren: Beyond Journey’s End',
        malId: 52991,
        status: 'Watching',
        episodeCount: 28,
        watchProgress: 12,
        rating: 8.4
      },
      { id: 'local-only', title: 'Local Only', status: 'Plan to Watch' }
    ]
  };

  const report = storage.buildMalXmlExport(source);
  assert.equal(report.exported.length, 2);
  assert.equal(report.unresolved.length, 1);
  assert.equal(report.roundedScores.length, 2);
  assert.match(report.xml, /<user_total_anime>2<\/user_total_anime>/);

  const rows = importer.parseLibraryImport(report.xml, 'JoeAnimeDB-MAL.xml');
  assert.equal(rows.length, 2);
  const bleach = rows.find((row) => row.malId === 269);
  assert.equal(bleach.status, 'Completed');
  assert.equal(bleach.episodesWatched, 366);
  assert.equal(bleach.rewatches, 2);
  assert.equal(bleach.score, 10);
  assert.equal(bleach.startedAt, '2024-01-02');
  assert.equal(bleach.completedAt, '2024-04-03');
});

check('AniList JSON, CSV, and text import normalization', () => {
  const aniListRows = importer.parseLibraryImport(JSON.stringify({
    scoreFormat: 'POINT_100',
    lists: [{
      entries: [{
        status: 'CURRENT',
        score: 87,
        progress: 7,
        repeat: 1,
        media: {
          id: 154587,
          idMal: 52991,
          title: { english: 'Frieren: Beyond Journey’s End' }
        }
      }]
    }]
  }), 'anilist.json');
  assert.equal(aniListRows.length, 1);
  assert.equal(aniListRows[0].score, 8.7);
  assert.equal(aniListRows[0].episodesWatched, 7);
  assert.equal(aniListRows[0].anilistId, 154587);
  assert.equal(aniListRows[0].malId, 52991);

  const csvRows = importer.parseLibraryImport(
    'Title,Score,Status,MAL ID,Progress\n"Bleach",9.9,Completed,269,366',
    'library.csv'
  );
  assert.equal(csvRows.length, 1);
  assert.equal(csvRows[0].malId, 269);
  assert.equal(csvRows[0].watchProgress, 366);

  const textRows = importer.parseLibraryImport(
    'JoeAnimeDB Ranked Library\n\n1. One Piece | Score: 9.8 | Status: Watching',
    'ranked.txt'
  );
  assert.equal(textRows.length, 1);
  assert.equal(textRows[0].title, 'One Piece');
  assert.equal(textRows[0].status, 'Watching');
});

check('content filtering enforces each safety mode', () => {
  const titles = [
    { id: 'g', ageRating: 'G' },
    { id: 'pg', ageRating: 'PG-13' },
    { id: 'r', ageRating: 'R' },
    { id: 'explicit', ageRating: 'R18+' },
    { id: 'nsfw', ageRating: 'PG', nsfw: true },
    { id: 'unknown' }
  ];

  assert.deepEqual(safety.filterContentBySafety(titles, 'kid-safe').map((item) => item.id), ['g', 'pg']);
  assert.deepEqual(safety.filterContentBySafety(titles, 'teen').map((item) => item.id), ['g', 'pg', 'unknown']);
  assert.deepEqual(safety.filterContentBySafety(titles, 'mature').map((item) => item.id), ['g', 'pg', 'r', 'unknown']);
  assert.equal(safety.filterContentBySafety(titles, 'unrestricted').length, titles.length);
});

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

check('Android QR scanner declares camera permission', async () => {
  const manifestSource = await source('android/app/src/main/AndroidManifest.xml');
  assert.match(manifestSource, /android\.permission\.CAMERA/);
});

check('rolling backup replacement is wired for web and desktop', async () => {
  const [exportsSource, electronSource] = await Promise.all([
    source('src/platform/fileExports.js'),
    source('electron/main.cjs')
  ]);

  assert.match(exportsSource, /readStoredFileHandle\(ROLLING_BACKUP_HANDLE\)/);
  assert.match(exportsSource, /storeFileHandle\(ROLLING_BACKUP_HANDLE, handle\)/);
  assert.match(exportsSource, /await writeFileHandle\(handle, text\)/);
  assert.match(electronSource, /let filePath = readRollingBackupPath\(\)/);
  assert.match(electronSource, /rememberRollingBackupPath\(filePath\)/);
  assert.match(electronSource, /return writeBackupFile\(filePath, rawText\)/);
});

check('backup restore is wired on desktop, web, and Android', async () => {
  const [electronSource, repositorySource, mobileSource] = await Promise.all([
    source('electron/main.cjs'),
    source('src/repositories/animeRepository.js'),
    source('src/platform/mobileDatabase.js')
  ]);

  assert.match(electronSource, /ipcMain\.handle\('db:restoreBackup'/);
  assert.match(repositorySource, /async restoreBackup\(database = \{\}\)/);
  assert.match(mobileSource, /async restoreBackup\(snapshot = \{\}\)/);
});

check('Beta 18 version identity is consistent across platforms', async () => {
  const [androidSource, preloadSource, mainSource, viteSource, settingsSource, aboutSource] = await Promise.all([
    source('android/app/build.gradle'),
    source('electron/preload.cjs'),
    source('electron/main.cjs'),
    source('vite.config.js'),
    source('src/pages/PlaceholderPages.jsx'),
    source('src/pages/AboutHelpPage.jsx')
  ]);

  assert.equal(packageMetadata.version, '5.0.0-beta.19');
  assert.match(androidSource, /versionCode\s+5000019/);
  assert.match(androidSource, /versionName\s+"5\.0\.0-beta\.18"/);
  assert.doesNotMatch(preloadSource, /require\(['"]\.\.\/package\.json['"]\)/);
  assert.match(mainSource, /version:\s*app\.getVersion\(\)/);
  assert.match(viteSource, /__APP_VERSION__:\s*JSON\.stringify\(packageMetadata\.version\)/);
  assert.doesNotMatch(settingsSource, /data\?\.version\s*\|\|\s*'5\.0'/);
  assert.doesNotMatch(aboutSource, /data\?\.version\s*\|\|/);
});

check('desktop SQLite cannot be hidden by stale New User Mode', async () => {
  const libraryHookSource = await source('src/hooks/useAnimeLibrary.js');

  assert.match(
    libraryHookSource,
    /requestedNewUserMode\s*&&\s*!window\.JoeAnimeDB\?\.desktop/
  );
  assert.match(
    libraryHookSource,
    /requestedNewUserMode\s*&&\s*window\.JoeAnimeDB\?\.desktop/
  );
  assert.match(
    libraryHookSource,
    /localStorage\.removeItem\('joeanime-new-user-mode'\)/
  );
});

check('Electron preload boots in the sandbox and exposes SQLite', async () => {
  const preloadSource = await source('electron/preload.cjs');
  let exposed = null;
  const ipcRenderer = {
    invoke() {},
    on() {},
    removeListener() {}
  };

  vm.runInNewContext(preloadSource, {
    require(specifier) {
      assert.equal(specifier, 'electron', `Sandbox preload imported blocked module: ${specifier}`);
      return {
        contextBridge: {
          exposeInMainWorld(name, value) {
            exposed = { name, value };
          }
        },
        ipcRenderer
      };
    }
  });

  assert.equal(exposed?.name, 'JoeAnimeDB');
  assert.equal(exposed?.value?.desktop, true);
  assert.equal(typeof exposed?.value?.database?.init, 'function');
  assert.equal(typeof exposed?.value?.database?.getDatabase, 'function');
});

function lineNumber(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

function buttonTags(text) {
  const tags = [];
  let index = 0;

  while ((index = text.indexOf('<button', index)) >= 0) {
    const start = index;
    let quote = '';
    let braceDepth = 0;
    index += '<button'.length;

    for (; index < text.length; index += 1) {
      const character = text[index];
      const previous = text[index - 1];

      if (quote) {
        if (character === quote && previous !== '\\') quote = '';
        continue;
      }
      if (character === '"' || character === "'" || character === '`') {
        quote = character;
        continue;
      }
      if (character === '{') braceDepth += 1;
      else if (character === '}') braceDepth = Math.max(0, braceDepth - 1);
      else if (character === '>' && braceDepth === 0) {
        tags.push({ start, text: text.slice(start, index + 1) });
        index += 1;
        break;
      }
    }
  }

  return tags;
}

async function jsxFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await jsxFiles(target));
    else if (entry.isFile() && entry.name.endsWith('.jsx')) files.push(target);
  }
  return files;
}

check('visible HTML buttons have an explicit effect', async () => {
  const files = await jsxFiles(path.join(root, 'src'));
  const missing = [];
  let total = 0;

  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const tag of buttonTags(text)) {
      total += 1;
      const disabled = /\bdisabled(?:\s|=|>)/.test(tag.text);
      const effect = /\bon(?:Click|PointerDown|MouseDown|TouchStart|KeyDown)\s*=/.test(tag.text)
        || /\btype\s*=\s*["']submit["']/.test(tag.text);
      if (!disabled && !effect) {
        missing.push(`${path.relative(root, file)}:${lineNumber(text, tag.start)}`);
      }
    }
  }

  assert.ok(total > 0, 'No HTML buttons were found.');
  assert.deepEqual(missing, [], `Buttons without an explicit effect: ${missing.join(', ')}`);
  console.log(`[info] Audited ${total} HTML buttons across ${files.length} JSX files.`);
});

if (process.argv.includes('--live')) {
  check('live Where to Watch proxy returns usable providers', async () => {
    const url = new URL('https://joeanimedb.com/api/watchmode');
    url.searchParams.set('title', 'Bleach');
    url.searchParams.set('year', '2004');
    url.searchParams.set('type', 'TV');
    url.searchParams.set('region', 'US');

    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const payload = await response.json();
    assert.equal(response.ok, true, payload.error || `HTTP ${response.status}`);
    assert.equal(payload.status, 'ready');
    assert.ok(Array.isArray(payload.providers) && payload.providers.length > 0);
    payload.providers.forEach((provider) => assert.match(String(provider.url || ''), /^https:\/\//));
  });
}

let failures = 0;
for (const { name, operation } of checks) {
  try {
    await operation();
    console.log(`[ok] ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`[fail] ${name}`);
    console.error(error?.stack || error);
  }
}

if (failures) {
  console.error(`\nBeta 18 release gate failed: ${failures} check(s).`);
  process.exitCode = 1;
} else {
  console.log(`\nBeta 18 automated release gate passed: ${checks.length} checks.`);
}
