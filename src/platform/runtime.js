import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

export function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function openExternalUrl(url) {
  const target = String(url || '').trim();

  if (!/^https:\/\//i.test(target)) {
    throw new Error('Only secure web links can be opened.');
  }

  // Preferred desktop path when the Electron preload exposes a native opener.
  if (window.JoeAnimeDB?.app?.openExternal) {
    const result = await window.JoeAnimeDB.app.openExternal(target);
    if (result?.ok === false) {
      throw new Error(result.error || 'Could not open this link.');
    }
    return true;
  }

  // Android should hand the URL to the system browser rather than trying
  // to navigate the Capacitor WebView.
  if (isNativeAndroid()) {
    await Browser.open({ url: target });
    return true;
  }

  // Electron builds without the newer app.openExternal bridge still use
  // BrowserWindow's setWindowOpenHandler to hand _blank links to the OS.
  // Do not fall back to replacing the Electron renderer if the handler
  // intentionally returns null.
  if (window.JoeAnimeDB?.desktop) {
    window.open(target, '_blank');
    return true;
  }

  // Normal web build. Some browsers treat a feature-string window.open()
  // as a popup and silently block it. Use the simplest user-gesture form,
  // then fall back to same-tab navigation so a streaming button can never
  // appear to do nothing.
  const opened = window.open(target, '_blank');

  if (opened) {
    try {
      opened.opener = null;
    } catch {}
    return true;
  }

  window.location.assign(target);
  return true;
}

export function installAndroidBackHandler(onBack) {
  if (!isNativeAndroid()) return undefined;

  let active = true;
  let listener = null;

  CapacitorApp.addListener('backButton', () => {
    const handled = onBack?.();
    if (!handled) CapacitorApp.exitApp();
  }).then((handle) => {
    if (!active) handle.remove();
    else listener = handle;
  });

  return () => {
    active = false;
    listener?.remove();
  };
}
