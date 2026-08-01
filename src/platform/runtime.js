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

  if (isNativeAndroid()) {
    await Browser.open({ url: target });
    return true;
  }

  window.open(target, '_blank', 'noopener,noreferrer');
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
