const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('JoeAnimeDB', {
  generateMissingGenomesForLibrary: (animeList, options) => ipcRenderer.invoke('genome:generateMissingForLibrary', animeList, options),
  onGenomeGenerationProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};

    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('genome:generationProgress', listener);

    return () => {
      ipcRenderer.removeListener('genome:generationProgress', listener);
    };
  },
  generateGenome: (title) => ipcRenderer.invoke('genome:generate', title),
  desktop: true,
  app: {
    getInfo: () => ipcRenderer.invoke('app:getInfo'),
    openExternal: (url) => ipcRenderer.invoke('app:openExternal', url)
  },
  updates: {
    getStatus: () => ipcRenderer.invoke('app:getUpdateStatus'),
    check: () => ipcRenderer.invoke('app:checkForUpdates'),
    download: () => ipcRenderer.invoke('app:downloadUpdate'),
    install: () => ipcRenderer.invoke('app:installUpdate'),
    onStatus: (callback) => {
      if (typeof callback !== 'function') return () => {};

      const listener = (_event, status) => callback(status);
      ipcRenderer.on('app:updateStatus', listener);

      return () => {
        ipcRenderer.removeListener('app:updateStatus', listener);
      };
    }
  },
  storage: {
    getInfo: () => ipcRenderer.invoke('app:getStorageInfo'),
    saveRollingBackup: (text, filename) => ipcRenderer.invoke('app:saveRollingBackup', text, filename),
    saveBackupAs: (text, filename) => ipcRenderer.invoke('app:saveBackupAs', text, filename),
    openDataFolder: () => ipcRenderer.invoke('app:openFolder', 'data'),
    openBackupsFolder: () => ipcRenderer.invoke('app:openFolder', 'backups'),
    openLogsFolder: () => ipcRenderer.invoke('app:openFolder', 'logs')
  },
  database: {
    init: (seedDatabase) => ipcRenderer.invoke('db:init', seedDatabase),
    getDatabase: () => ipcRenderer.invoke('db:getDatabase'),
    getAll: () => ipcRenderer.invoke('db:getAll'),
    getCatalog: () => ipcRenderer.invoke('db:getCatalog'),
    replaceAll: (anime) => ipcRenderer.invoke('db:replaceAll', anime),
    restoreBackup: (snapshot) => ipcRenderer.invoke('db:restoreBackup', snapshot),
    updateAnime: (anime) => ipcRenderer.invoke('db:updateAnime', anime),
    importCatalog: (catalog) => ipcRenderer.invoke('db:importCatalog', catalog),
    updateCatalogAnime: (anime) => ipcRenderer.invoke('db:updateCatalogAnime', anime),
    getJoeAIState: () => ipcRenderer.invoke('db:getJoeAIState'),
    recordJoeAIFeedback: (entry) => ipcRenderer.invoke('db:recordJoeAIFeedback', entry),
    setJoeAIPreference: (preference) => ipcRenderer.invoke('db:setJoeAIPreference', preference),
    deleteJoeAIFeedback: (id) => ipcRenderer.invoke('db:deleteJoeAIFeedback', id),
    deleteJoeAIPreference: (key) => ipcRenderer.invoke('db:deleteJoeAIPreference', key),
    resetJoeAILearning: () => ipcRenderer.invoke('db:resetJoeAILearning'),
    setJoeAIConversationContext: (context) => ipcRenderer.invoke('db:setJoeAIConversationContext', context),
    clearJoeAIConversationContext: () => ipcRenderer.invoke('db:clearJoeAIConversationContext'),
    reset: (seedDatabase) => ipcRenderer.invoke('db:reset', seedDatabase)
  }
});
