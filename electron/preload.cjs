const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('JoeAnimeDB', {
  version: '4.3.1-sqlite',
  desktop: true,
  database: {
    init: (seedDatabase) => ipcRenderer.invoke('db:init', seedDatabase),
    getDatabase: () => ipcRenderer.invoke('db:getDatabase'),
    getAll: () => ipcRenderer.invoke('db:getAll'),
    replaceAll: (anime) => ipcRenderer.invoke('db:replaceAll', anime),
    updateAnime: (anime) => ipcRenderer.invoke('db:updateAnime', anime),
    reset: (seedDatabase) => ipcRenderer.invoke('db:reset', seedDatabase)
  }
});
