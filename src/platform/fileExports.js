import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNativeAndroid } from './runtime';

const FILE_HANDLE_DB = 'joeanime-file-handles-v1';
const FILE_HANDLE_STORE = 'handles';
const ROLLING_BACKUP_HANDLE = 'rolling-backup';

function downloadTextFile(filename, text, mimeType = 'text/plain') {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function openFileHandleDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }

    const request = window.indexedDB.open(FILE_HANDLE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(FILE_HANDLE_STORE)) {
        request.result.createObjectStore(FILE_HANDLE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open the file handle store.'));
  });
}

async function readStoredFileHandle(key) {
  const database = await openFileHandleDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database
        .transaction(FILE_HANDLE_STORE, 'readonly')
        .objectStore(FILE_HANDLE_STORE)
        .get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Could not read the saved file handle.'));
    });
  } finally {
    database.close();
  }
}

async function storeFileHandle(key, handle) {
  const database = await openFileHandleDatabase();
  try {
    await new Promise((resolve, reject) => {
      const request = database
        .transaction(FILE_HANDLE_STORE, 'readwrite')
        .objectStore(FILE_HANDLE_STORE)
        .put(handle, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Could not remember the file handle.'));
    });
  } finally {
    database.close();
  }
}

async function removeStoredFileHandle(key) {
  const database = await openFileHandleDatabase();
  try {
    await new Promise((resolve, reject) => {
      const request = database
        .transaction(FILE_HANDLE_STORE, 'readwrite')
        .objectStore(FILE_HANDLE_STORE)
        .delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Could not clear the saved file handle.'));
    });
  } finally {
    database.close();
  }
}

async function canWriteFileHandle(handle) {
  if (!handle) return false;
  if (typeof handle.queryPermission !== 'function') return true;
  if (await handle.queryPermission({ mode: 'readwrite' }) === 'granted') return true;
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
}

async function writeFileHandle(handle, text) {
  const writable = await handle.createWritable();
  await writable.write(String(text));
  await writable.close();
}

function jsonPickerOptions(suggestedName) {
  return {
    suggestedName,
    types: [{
      description: 'JoeAnimeDB JSON backup',
      accept: { 'application/json': ['.json'] }
    }]
  };
}

export async function saveTextExport(filename, text, mimeType = 'text/plain') {
  if (!isNativeAndroid()) {
    downloadTextFile(filename, text, mimeType);
    return { ok: true, method: 'download', filename };
  }

  try {
    await Filesystem.writeFile({
      path: filename,
      data: String(text),
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true
    });
    const { uri } = await Filesystem.getUri({
      path: filename,
      directory: Directory.Cache
    });
    await Share.share({
      title: filename,
      text: 'JoeAnimeDB export',
      url: uri,
      dialogTitle: `Save or share ${filename}`
    });
    return { ok: true, method: 'android-share', filename };
  } catch (error) {
    console.error(`Could not export ${filename}:`, error);
    window.alert('The export could not be opened. Your library was not changed.');
    return { ok: false, error: error?.message || String(error) };
  }
}

export async function saveRollingTextExport(filename, text, mimeType = 'application/json') {
  if (window.JoeAnimeDB?.storage?.saveRollingBackup) {
    return window.JoeAnimeDB.storage.saveRollingBackup(String(text), filename);
  }

  if (isNativeAndroid()) {
    return saveTextExport(filename, text, mimeType);
  }

  if (typeof window.showSaveFilePicker !== 'function') {
    downloadTextFile(filename, text, mimeType);
    return { ok: true, method: 'download-fallback', filename };
  }

  try {
    let handle = null;
    try {
      handle = await readStoredFileHandle(ROLLING_BACKUP_HANDLE);
    } catch (error) {
      console.warn('Could not read the saved rolling backup file handle.', error);
    }

    if (handle && !(await canWriteFileHandle(handle))) {
      try {
        await removeStoredFileHandle(ROLLING_BACKUP_HANDLE);
      } catch {}
      handle = null;
    }

    if (!handle) {
      handle = await window.showSaveFilePicker(jsonPickerOptions(filename));
      try {
        await storeFileHandle(ROLLING_BACKUP_HANDLE, handle);
      } catch (error) {
        console.warn('The rolling backup file handle could not be remembered between sessions.', error);
      }
    }

    await writeFileHandle(handle, text);
    return { ok: true, method: 'file-system-access', filename: handle.name || filename };
  } catch (error) {
    if (error?.name === 'AbortError') return { ok: false, canceled: true };
    throw error;
  }
}

export async function saveTextExportAs(filename, text, mimeType = 'application/json') {
  if (window.JoeAnimeDB?.storage?.saveBackupAs) {
    return window.JoeAnimeDB.storage.saveBackupAs(String(text), filename);
  }

  if (isNativeAndroid()) {
    return saveTextExport(filename, text, mimeType);
  }

  if (typeof window.showSaveFilePicker !== 'function') {
    downloadTextFile(filename, text, mimeType);
    return { ok: true, method: 'download-fallback', filename };
  }

  try {
    const handle = await window.showSaveFilePicker(jsonPickerOptions(filename));
    await writeFileHandle(handle, text);
    return { ok: true, method: 'file-system-access', filename: handle.name || filename };
  } catch (error) {
    if (error?.name === 'AbortError') return { ok: false, canceled: true };
    throw error;
  }
}
