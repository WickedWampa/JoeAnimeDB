import { App as CapacitorApp } from '@capacitor/app';
import { APP_VERSION } from '../appVersion';
import { createMobileDatabaseAdapter } from './mobileDatabase';
import { createMobileUpdateManager } from './mobileUpdates';
import { isNativeAndroid, openExternalUrl } from './runtime';
import { recordStartupTiming } from '../services/startupPerformance';

function markPlatform(platform) {
  document.documentElement.dataset.platform = platform;
  document.body?.classList.add(`platform-${platform}`);
}

export function initializePlatformBridge() {
  if (window.JoeAnimeDB?.desktop) {
    markPlatform('desktop');
    return;
  }

  if (!isNativeAndroid()) {
    markPlatform('web');
    window.JoeAnimeDB = {
      ...(window.JoeAnimeDB || {}),
      version: APP_VERSION,
      desktop: false,
      mobile: false,
      platform: 'web'
    };
    return;
  }

  markPlatform('android');
  let nativeInfo = {
    name: 'JoeAnimeDB',
    version: APP_VERSION,
    build: ''
  };
  const updates = createMobileUpdateManager({ currentVersion: APP_VERSION });

  window.JoeAnimeDB = {
    version: nativeInfo.version,
    build: nativeInfo.build,
    desktop: false,
    mobile: true,
    platform: 'android',
    database: createMobileDatabaseAdapter(),
    updates,
    app: {
      getInfo: async () => ({
        name: nativeInfo.name,
        version: nativeInfo.version,
        build: nativeInfo.build,
        platform: 'android',
        packaged: true
      }),
      openExternal: async (url) => ({ ok: await openExternalUrl(url) })
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

  updates.start();

  // Native package metadata is not required to open SQLite or navigate Home.
  // Resolve it in the background so a slow Capacitor bridge cannot freeze the
  // first D-pad press.
  const infoStartedAt = globalThis.performance?.now?.() ?? Date.now();
  void CapacitorApp.getInfo()
    .then((info) => {
      nativeInfo = { ...nativeInfo, ...info };
      Object.assign(window.JoeAnimeDB, {
        version: nativeInfo.version,
        build: nativeInfo.build
      });
      recordStartupTiming(
        'platformAppInfo',
        (globalThis.performance?.now?.() ?? Date.now()) - infoStartedAt
      );
    })
    .catch((error) => {
      console.warn('Android app metadata will use the packaged fallback.', error);
      recordStartupTiming(
        'platformAppInfo',
        (globalThis.performance?.now?.() ?? Date.now()) - infoStartedAt,
        { fallback: true }
      );
    });
}
