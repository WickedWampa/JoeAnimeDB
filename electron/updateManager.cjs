const UPDATE_CHECK_DELAY_MS = 15 * 1000;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function cleanError(error) {
  return error?.message || String(error || 'Unknown update error');
}

function releaseNotesText(value) {
  if (typeof value === 'string') return value.slice(0, 4000);
  if (!Array.isArray(value)) return '';

  return value
    .map((entry) => entry?.note || entry?.version || '')
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 4000);
}

function publicUpdateInfo(info = {}) {
  return {
    version: info.version || '',
    releaseName: info.releaseName || '',
    releaseDate: info.releaseDate || '',
    releaseNotes: releaseNotesText(info.releaseNotes)
  };
}

function createUpdateManager({
  app,
  BrowserWindow,
  ipcMain,
  autoUpdater,
  logger = console,
  isSupported = app.isPackaged,
  startupDelayMs = UPDATE_CHECK_DELAY_MS,
  intervalMs = UPDATE_CHECK_INTERVAL_MS
}) {
  let started = false;
  let startupTimer = null;
  let intervalTimer = null;
  let status = {
    state: isSupported ? 'idle' : 'development',
    currentVersion: app.getVersion(),
    availableVersion: '',
    percent: 0,
    message: isSupported
      ? 'Ready to check for updates.'
      : 'Automatic updates are available in supported installed desktop builds.',
    checkedAt: ''
  };

  function sendStatus() {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send('app:updateStatus', status);
      }
    }
  }

  function setStatus(state, patch = {}) {
    status = {
      ...status,
      ...patch,
      state,
      currentVersion: app.getVersion()
    };
    sendStatus();
    return status;
  }

  async function checkForUpdates({ automatic = false } = {}) {
    if (!isSupported) {
      return {
        ok: false,
        reason: 'development',
        status: setStatus('development', {
          message: 'Automatic updates are available in supported installed desktop builds.'
        })
      };
    }

    if (['checking', 'downloading'].includes(status.state)) {
      return { ok: true, status };
    }

    setStatus('checking', {
      message: automatic ? 'Checking for updates in the background…' : 'Checking for updates…',
      percent: 0
    });

    try {
      await autoUpdater.checkForUpdates();
      return { ok: true, status };
    } catch (error) {
      logger.error?.('[JoeAnimeDB Updater] Check failed:', error);
      return {
        ok: false,
        error: cleanError(error),
        status: setStatus('error', {
          message: `Update check failed: ${cleanError(error)}`
        })
      };
    }
  }

  async function downloadUpdate() {
    if (!isSupported) {
      return { ok: false, reason: 'development', status };
    }

    if (!['available', 'error'].includes(status.state) || !status.availableVersion) {
      return {
        ok: false,
        error: 'No update is ready to download.',
        status
      };
    }

    setStatus('downloading', {
      message: `Downloading v${status.availableVersion}…`,
      percent: 0
    });

    try {
      await autoUpdater.downloadUpdate();
      return { ok: true, status };
    } catch (error) {
      logger.error?.('[JoeAnimeDB Updater] Download failed:', error);
      return {
        ok: false,
        error: cleanError(error),
        status: setStatus('error', {
          message: `Update download failed: ${cleanError(error)}`
        })
      };
    }
  }

  function installUpdate() {
    if (!isSupported || status.state !== 'downloaded') {
      return {
        ok: false,
        error: 'No downloaded update is ready to install.',
        status
      };
    }

    setStatus('installing', {
      message: 'Restarting JoeAnimeDB to install the update…',
      percent: 100
    });

    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return { ok: true, status };
  }

  function registerEvents() {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = app.getVersion().includes('-');
    autoUpdater.allowDowngrade = false;
    autoUpdater.disableWebInstaller = true;
    autoUpdater.logger = logger;

    autoUpdater.on('checking-for-update', () => {
      setStatus('checking', {
        message: 'Checking GitHub for a newer JoeAnimeDB release…',
        percent: 0
      });
    });

    autoUpdater.on('update-available', (info) => {
      const update = publicUpdateInfo(info);
      setStatus('available', {
        ...update,
        availableVersion: update.version,
        message: `JoeAnimeDB v${update.version} is available.`,
        checkedAt: new Date().toISOString(),
        percent: 0
      });
    });

    autoUpdater.on('update-not-available', () => {
      setStatus('up-to-date', {
        availableVersion: '',
        releaseName: '',
        releaseDate: '',
        releaseNotes: '',
        message: `JoeAnimeDB v${app.getVersion()} is up to date.`,
        checkedAt: new Date().toISOString(),
        percent: 0
      });
    });

    autoUpdater.on('download-progress', (progress = {}) => {
      const percent = Math.max(0, Math.min(100, Math.round(progress.percent || 0)));
      setStatus('downloading', {
        percent,
        bytesPerSecond: Math.max(0, Math.round(progress.bytesPerSecond || 0)),
        transferred: Math.max(0, progress.transferred || 0),
        total: Math.max(0, progress.total || 0),
        message: `Downloading v${status.availableVersion || 'update'}… ${percent}%`
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      const update = publicUpdateInfo(info);
      setStatus('downloaded', {
        ...update,
        availableVersion: update.version || status.availableVersion,
        message: `JoeAnimeDB v${update.version || status.availableVersion} is ready to install.`,
        percent: 100
      });
    });

    autoUpdater.on('error', (error) => {
      logger.error?.('[JoeAnimeDB Updater] Error:', error);
      setStatus('error', {
        message: `Updater error: ${cleanError(error)}`
      });
    });
  }

  function registerIpc() {
    ipcMain.handle('app:getUpdateStatus', async () => status);
    ipcMain.handle('app:checkForUpdates', async () => checkForUpdates());
    ipcMain.handle('app:downloadUpdate', async () => downloadUpdate());
    ipcMain.handle('app:installUpdate', async () => installUpdate());
  }

  function start() {
    if (started) return;
    started = true;
    registerEvents();
    registerIpc();

    if (!isSupported) {
      sendStatus();
      return;
    }

    startupTimer = setTimeout(() => {
      void checkForUpdates({ automatic: true });
    }, startupDelayMs);
    startupTimer.unref?.();

    intervalTimer = setInterval(() => {
      void checkForUpdates({ automatic: true });
    }, intervalMs);
    intervalTimer.unref?.();
  }

  function stop() {
    if (startupTimer) clearTimeout(startupTimer);
    if (intervalTimer) clearInterval(intervalTimer);
    startupTimer = null;
    intervalTimer = null;
  }

  return {
    start,
    stop,
    getStatus: () => status,
    checkForUpdates,
    downloadUpdate,
    installUpdate
  };
}

module.exports = {
  createUpdateManager,
  publicUpdateInfo,
  releaseNotesText
};
