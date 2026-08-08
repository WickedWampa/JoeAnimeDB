const { app, BrowserWindow, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const database = require('./database.cjs');
const { createUpdateManager } = require('./updateManager.cjs');

const APP_USER_MODEL_ID = 'com.joeanimedb.app';

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

const isDev = !app.isPackaged;

/**
 * Installer-safe storage.
 *
 * Development keeps using Electron's normal userData folder.
 * Packaged desktop builds use Electron's per-user data location, which is
 * writable without administrator permissions:
 *
 *   Windows: %APPDATA%\JoeAnimeDB\
 *   Linux:   ~/.config/JoeAnimeDB/
 *
 * Both contain:
 *     JoeAnime.db
 *     backups\
 *     logs\
 *
 * The clean first-run seed still ensures new installs start empty.
 */
function getAppFolders() {
  const root = app.getPath('userData');

  return {
    root,
    data: root,
    runtime: root,
    backups: path.join(root, 'backups'),
    logs: path.join(root, 'logs')
  };
}

function ensureAppFolders() {
  const folders = getAppFolders();
  [folders.data, folders.backups, folders.logs].forEach((folder) => {
    fs.mkdirSync(folder, { recursive: true });
  });
  return folders;
}

function updaterLogValue(value) {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function writeUpdaterLog(level, ...values) {
  const method = typeof console[level] === 'function' ? level : 'log';
  console[method](...values);

  try {
    const folders = ensureAppFolders();
    const line = [
      new Date().toISOString(),
      level.toUpperCase(),
      ...values.map(updaterLogValue)
    ].join(' ');
    fs.appendFileSync(path.join(folders.logs, 'updates.log'), `${line}\n`, 'utf8');
  } catch (error) {
    console.warn('Could not write the updater log.', error);
  }
}

const updateManager = createUpdateManager({
  app,
  BrowserWindow,
  ipcMain,
  autoUpdater,
  isSupported:
    app.isPackaged &&
    ['win32', 'linux'].includes(process.platform) &&
    !process.env.PORTABLE_EXECUTABLE_DIR,
  logger: {
    info: (...values) => writeUpdaterLog('info', ...values),
    warn: (...values) => writeUpdaterLog('warn', ...values),
    error: (...values) => writeUpdaterLog('error', ...values),
    debug: (...values) => writeUpdaterLog('debug', ...values)
  }
});


function registerDatabaseHandlers() {
  ipcMain.handle('db:init', async (_event, seedDatabase) => {
    const folders = ensureAppFolders();
    return database.initDatabase(folders.data, seedDatabase);
  });
  ipcMain.handle('db:getDatabase', async () => database.getDatabase());
  ipcMain.handle('db:getAll', async () => database.getAll());
  ipcMain.handle('db:getCatalog', async () => database.getCatalog());
  ipcMain.handle('db:replaceAll', async (_event, anime) => database.replaceAll(anime));
  ipcMain.handle('db:restoreBackup', async (_event, snapshot) => {
    const folders = ensureAppFolders();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safetyBackup = path.join(
      folders.backups,
      `JoeAnime-before-restore-${timestamp}.db`
    );

    await database.backupDatabase(safetyBackup);
    return database.restoreDatabase(snapshot);
  });
  ipcMain.handle('db:updateAnime', async (_event, anime) => database.upsertAnime(anime));
  ipcMain.handle('db:importCatalog', async (_event, catalog) => database.importCatalog(catalog));
  ipcMain.handle('db:updateCatalogAnime', async (_event, anime) => database.upsertCatalogAnime(anime));
  ipcMain.handle('db:getJoeAIState', async () => database.getJoeAIState());
  ipcMain.handle('db:recordJoeAIFeedback', async (_event, entry) => database.recordJoeAIFeedback(entry));
  ipcMain.handle('db:setJoeAIPreference', async (_event, preference) => database.setJoeAIPreference(preference));
  ipcMain.handle('db:deleteJoeAIFeedback', async (_event, id) => database.deleteJoeAIFeedback(id));
  ipcMain.handle('db:deleteJoeAIPreference', async (_event, key) => database.deleteJoeAIPreference(key));
  ipcMain.handle('db:resetJoeAILearning', async () => database.resetJoeAILearning());
  ipcMain.handle('db:setJoeAIConversationContext', async (_event, context) => database.setJoeAIConversationContext(context));
  ipcMain.handle('db:clearJoeAIConversationContext', async () => database.clearJoeAIConversationContext());
  ipcMain.handle('db:reset', async (_event, seedDatabase) => database.reset(seedDatabase));
}


ipcMain.handle('app:getStorageInfo', async () => {
  const folders = ensureAppFolders();
  return {
    packaged: app.isPackaged,
    root: folders.root,
    data: folders.data,
    backups: folders.backups,
    logs: folders.logs,
    database: path.join(folders.data, 'JoeAnime.db')
  };
});

ipcMain.handle('app:getInfo', async () => ({
  name: app.getName(),
  version: app.getVersion(),
  packaged: app.isPackaged,
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  architecture: process.arch
}));

function safeBackupText(value) {
  const text = String(value || '');
  if (!text.trim()) throw new Error('The backup was empty.');
  if (Buffer.byteLength(text, 'utf8') > 150 * 1024 * 1024) {
    throw new Error('The backup is too large to save safely.');
  }
  return text;
}

function backupLocationFile() {
  return path.join(ensureAppFolders().root, 'rolling-backup-location.json');
}

function readRollingBackupPath() {
  try {
    const parsed = JSON.parse(fs.readFileSync(backupLocationFile(), 'utf8'));
    return typeof parsed?.path === 'string' ? parsed.path : '';
  } catch {
    return '';
  }
}

function rememberRollingBackupPath(filePath) {
  fs.writeFileSync(
    backupLocationFile(),
    JSON.stringify({ path: filePath, updatedAt: new Date().toISOString() }, null, 2),
    'utf8'
  );
}

function writeBackupFile(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, safeBackupText(text), 'utf8');
  return {
    ok: true,
    method: 'desktop-file',
    path: filePath,
    filename: path.basename(filePath)
  };
}

ipcMain.handle('app:saveRollingBackup', async (event, rawText) => {
  try {
    const folders = ensureAppFolders();
    let filePath = readRollingBackupPath();

    if (!filePath) {
      const parent = BrowserWindow.fromWebContents(event.sender);
      const choice = await dialog.showSaveDialog(parent, {
        title: 'Choose rolling backup location',
        defaultPath: path.join(folders.backups, 'JoeAnimeDB-backup.json'),
        filters: [{ name: 'JoeAnimeDB JSON backup', extensions: ['json'] }],
        properties: ['createDirectory', 'showOverwriteConfirmation']
      });
      if (choice.canceled || !choice.filePath) return { ok: false, canceled: true };
      filePath = choice.filePath;
      rememberRollingBackupPath(filePath);
    }

    return writeBackupFile(filePath, rawText);
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});

ipcMain.handle('app:saveBackupAs', async (event, rawText, suggestedName) => {
  try {
    const folders = ensureAppFolders();
    const parent = BrowserWindow.fromWebContents(event.sender);
    const choice = await dialog.showSaveDialog(parent, {
      title: 'Save JoeAnimeDB backup as',
      defaultPath: path.join(
        folders.backups,
        path.basename(String(suggestedName || 'JoeAnimeDB-backup.json'))
      ),
      filters: [{ name: 'JoeAnimeDB JSON backup', extensions: ['json'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation']
    });
    if (choice.canceled || !choice.filePath) return { ok: false, canceled: true };
    return writeBackupFile(choice.filePath, rawText);
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});

ipcMain.handle('app:openFolder', async (_event, kind) => {
  const folders = ensureAppFolders();
  const target = kind === 'logs'
    ? folders.logs
    : kind === 'data'
      ? folders.data
      : kind === 'backups'
        ? folders.backups
      : null;

  if (!target) {
    return { ok: false, error: 'Unknown JoeAnimeDB folder.' };
  }

  const error = await shell.openPath(target);
  return error
    ? { ok: false, error }
    : { ok: true, path: target };
});

ipcMain.handle('app:openExternal', async (_event, rawUrl) => {
  try {
    const target = new URL(String(rawUrl || ''));
    const allowedHosts = new Set([
      'github.com',
      'kitsu.io',
      'www.kitsu.io',
      'wikidata.org',
      'www.wikidata.org'
    ]);

    if (target.protocol !== 'https:' || !allowedHosts.has(target.hostname)) {
      return { ok: false, error: 'JoeAnimeDB blocked an untrusted external link.' };
    }

    await shell.openExternal(target.toString());
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});


function resolveAppScript(scriptName) {
  const candidates = [
    path.join(__dirname, '..', 'scripts', scriptName),
    path.join(process.resourcesPath || '', 'scripts', scriptName)
  ];

  const found = candidates.find((candidate) => candidate && fs.existsSync(candidate));

  if (!found) {
    throw new Error(
      `Required script not found: ${scriptName}\nChecked:\n${candidates.join('\n')}`
    );
  }

  return found;
}

function runNodeScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(scriptPath)) {
      reject(new Error(`Node script not found: ${scriptPath}`));
      return;
    }

    execFile(
      process.execPath,
      [scriptPath, ...args],
      {
        cwd: path.join(__dirname, '..'),
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1'
        },
        windowsHide: true
      },
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

const joeRunNodeScript = runNodeScript;

function normalizeProgressText(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function runGenomeBatchWithProgress(event, scriptPath, args = [], animeList = []) {
  return new Promise((resolve, reject) => {
    const titles = animeList.map((item) =>
      String(item?.officialTitle || item?.title || item?.titleEnglish || 'Unknown title').trim()
    );
    const normalizedTitles = titles.map(normalizeProgressText);
    const reported = new Set();
    let stdout = '';
    let stderr = '';
    let stdoutBuffer = '';

    function sendProgress(processed, title, phase = 'generating') {
      if (event.sender.isDestroyed()) return;
      event.sender.send('genome:generationProgress', {
        processed,
        total: titles.length,
        title,
        phase,
        percent: titles.length ? Math.round((processed / titles.length) * 100) : 100
      });
    }

    function inspectLine(line = '') {
      const cleanLine = normalizeProgressText(line);
      if (!cleanLine) return;

      // Prefer an explicit progress record if the batch runner supplies one.
      const protocolMatch = line.match(/JOEANIME_GENOME_PROGRESS\s+(\{.+\})/);
      if (protocolMatch) {
        try {
          const progress = JSON.parse(protocolMatch[1]);
          const processed = Math.max(0, Math.min(titles.length, Number(progress.processed || 0)));
          sendProgress(processed, progress.title || titles[processed] || '', progress.phase || 'generating');
          return;
        } catch {}
      }

      // Backward-compatible progress for the existing runner: its console
      // output names each title while processing it. Count each title once.
      const matchedIndex = normalizedTitles.findIndex((title, index) =>
        title.length >= 3 && !reported.has(index) && cleanLine.includes(title)
      );

      if (matchedIndex >= 0) {
        reported.add(matchedIndex);
        sendProgress(reported.size, titles[matchedIndex], 'generating');
      }
    }

    sendProgress(0, titles[0] || '', 'starting');

    const child = spawn(
      process.execPath,
      [scriptPath, ...args],
      {
        cwd: path.join(__dirname, '..'),
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1'
        },
        windowsHide: true
      }
    );

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      stdoutBuffer += text;

      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';
      lines.forEach(inspectLine);
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (stdoutBuffer) inspectLine(stdoutBuffer);

      if (code !== 0) {
        const error = new Error(`Genome batch exited with code ${code}.`);
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }

      sendProgress(titles.length, titles[titles.length - 1] || '', 'complete');
      resolve({ stdout, stderr });
    });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1100,
    minHeight: 720,
    title: 'JoeAnimeDB 5.0 Beta',
    backgroundColor: '#050910',
    icon: path.join(__dirname, '..', 'installer', 'joeanime.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}


ipcMain.handle('genome:generate', async (_event, title) => {
  const cleanTitle = String(title || '').trim();

  if (!cleanTitle) {
    return {
      ok: false,
      title: cleanTitle,
      error: 'No title provided.'
    };
  }

  try {
    const generatorScript = resolveAppScript('generateGenomeCardForTitle.cjs');
    const rebuildScript = resolveAppScript('rebuildGenomeRegistry.cjs');

    const generated = await runNodeScript(generatorScript, [cleanTitle]);
    const rebuilt = await runNodeScript(rebuildScript, []);

    return {
      ok: true,
      title: cleanTitle,
      generatedStdout: generated.stdout,
      generatedStderr: generated.stderr,
      rebuildStdout: rebuilt.stdout,
      rebuildStderr: rebuilt.stderr
    };
  } catch (error) {
    return {
      ok: false,
      title: cleanTitle,
      error: error.message,
      stdout: error.stdout || '',
      stderr: error.stderr || ''
    };
  }
});



ipcMain.handle('genome:generateMissingForLibrary', async (event, animeList, options = {}) => {
  const folders = ensureAppFolders();
  const tempFile = path.join(folders.runtime, '.tmp-genome-library.json');

  try {
    const cleanList = Array.isArray(animeList) ? animeList : [];
    const limit = Number(options.limit || 0);
    const batchScript = resolveAppScript('generateMissingGenomesForList.cjs');

    fs.writeFileSync(tempFile, JSON.stringify(cleanList, null, 2), 'utf8');

    const result = await runGenomeBatchWithProgress(
      event,
      batchScript,
      [tempFile, String(limit)],
      cleanList
    );

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
  } finally {
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch {}
  }
});


app.whenReady().then(() => {
  ensureAppFolders();
  registerDatabaseHandlers();
  createWindow();
  updateManager.start();
});

app.on('before-quit', () => {
  updateManager.stop();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
