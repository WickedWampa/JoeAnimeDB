const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const database = require('./database.cjs');

const isDev = !app.isPackaged;

/**
 * Installer-safe storage.
 *
 * Development keeps using Electron's normal userData folder.
 * Packaged installer builds also use Electron's per-user AppData location,
 * which is writable without administrator permissions:
 *
 *   %APPDATA%\JoeAnimeDB\
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


function registerDatabaseHandlers() {
  ipcMain.handle('db:init', async (_event, seedDatabase) => {
    const folders = ensureAppFolders();
    return database.initDatabase(folders.data, seedDatabase);
  });
  ipcMain.handle('db:getDatabase', async () => database.getDatabase());
  ipcMain.handle('db:getAll', async () => database.getAll());
  ipcMain.handle('db:getCatalog', async () => database.getCatalog());
  ipcMain.handle('db:replaceAll', async (_event, anime) => database.replaceAll(anime));
  ipcMain.handle('db:updateAnime', async (_event, anime) => database.upsertAnime(anime));
  ipcMain.handle('db:importCatalog', async (_event, catalog) => database.importCatalog(catalog));
  ipcMain.handle('db:updateCatalogAnime', async (_event, anime) => database.upsertCatalogAnime(anime));
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


function runNodeScript(scriptPath, args = []) {
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

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1100,
    minHeight: 720,
    title: 'JoeAnimeDB 5.0',
    backgroundColor: '#050910',
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
    const generatorScript = path.join(__dirname, '..', 'scripts', 'generateGenomeCardForTitle.cjs');
    const rebuildScript = path.join(__dirname, '..', 'scripts', 'rebuildGenomeRegistry.cjs');

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


app.whenReady().then(() => {
  ensureAppFolders();
  registerDatabaseHandlers();
  createWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
