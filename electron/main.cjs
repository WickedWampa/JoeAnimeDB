const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const database = require('./database.cjs');

const isDev = !app.isPackaged;

function registerDatabaseHandlers() {
  ipcMain.handle('db:init', async (_event, seedDatabase) => database.initDatabase(app.getPath('userData'), seedDatabase));
  ipcMain.handle('db:getDatabase', async () => database.getDatabase());
  ipcMain.handle('db:getAll', async () => database.getAll());
  ipcMain.handle('db:replaceAll', async (_event, anime) => database.replaceAll(anime));
  ipcMain.handle('db:updateAnime', async (_event, anime) => database.upsertAnime(anime));
  ipcMain.handle('db:reset', async (_event, seedDatabase) => database.reset(seedDatabase));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1100,
    minHeight: 720,
    title: 'JoeAnimeDB 4.3.1 SQLite Foundation',
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

app.whenReady().then(() => {
  registerDatabaseHandlers();
  createWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
