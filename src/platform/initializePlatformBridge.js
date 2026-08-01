import { App as CapacitorApp } from '@capacitor/app';
import { createMobileDatabaseAdapter } from './mobileDatabase';
import { isNativeAndroid, openExternalUrl } from './runtime';

function markPlatform(platform) {
  document.documentElement.dataset.platform = platform;
  document.body?.classList.add(`platform-${platform}`);
}

export async function initializePlatformBridge() {
  if (window.JoeAnimeDB?.desktop) {
    markPlatform('desktop');
    return;
  }

  if (!isNativeAndroid()) {
    markPlatform('web');
    return;
  }

  markPlatform('android');
  const info = await CapacitorApp.getInfo();

  window.JoeAnimeDB = {
    version: info.version,
    build: info.build,
    desktop: false,
    mobile: true,
    platform: 'android',
    database: createMobileDatabaseAdapter(),
    app: {
      getInfo: async () => ({
        name: info.name,
        version: info.version,
        build: info.build,
        platform: 'android',
        packaged: true
      }),
      openExternal: openExternalUrl
    },
    storage: {
      getInfo: async () => ({
        engine: 'SQLite/Capacitor',
        dataPath: 'Private Android app storage',
        backupsPath: 'Exports are saved through the Android share sheet',
        logsPath: 'Android application logs',
        portable: false,
        platform: 'android'
      })
    }
  };
}
