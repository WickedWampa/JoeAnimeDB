import { parseRecoveryCode, recoveryCodeFor } from './cloudSync.js';

const QR_HASH_KEY = 'jadb-recovery';
const PENDING_QR_KEY = 'joeanime-pending-recovery-qr-v1';
const DEFAULT_PUBLIC_APP_URL = 'https://joeanimedb.com/';

function publicAppUrl() {
  return String(import.meta.env?.VITE_PUBLIC_APP_URL || DEFAULT_PUBLIC_APP_URL).trim() || DEFAULT_PUBLIC_APP_URL;
}

export function buildRecoveryQrUrl(config, baseUrl = publicAppUrl()) {
  const code = recoveryCodeFor(config);
  if (!code) throw new Error('Enable sync before showing a Recovery QR.');

  const url = new URL(baseUrl, DEFAULT_PUBLIC_APP_URL);
  url.hash = `${QR_HASH_KEY}=${encodeURIComponent(code)}`;
  return url.toString();
}

export function recoveryCodeFromQrValue(value) {
  const text = String(value || '').trim();
  if (!text) throw new Error('That QR code is empty.');

  if (text.startsWith('JADB1.')) {
    parseRecoveryCode(text);
    return text;
  }

  let url;
  try {
    url = new URL(text, DEFAULT_PUBLIC_APP_URL);
  } catch {
    throw new Error('That is not a JoeAnimeDB Recovery QR.');
  }

  const params = new URLSearchParams(String(url.hash || '').replace(/^#/, ''));
  const code = String(params.get(QR_HASH_KEY) || '').trim();
  if (!code) throw new Error('That is not a JoeAnimeDB Recovery QR.');

  parseRecoveryCode(code);
  return code;
}

export function captureRecoveryQrFromLocation({
  location = globalThis.location,
  history = globalThis.history,
  storage = globalThis.sessionStorage
} = {}) {
  if (!location || !storage) return '';

  let code = '';
  try {
    code = recoveryCodeFromQrValue(location.href || `${location.pathname || '/'}${location.search || ''}${location.hash || ''}`);
  } catch {
    return '';
  }

  storage.setItem(PENDING_QR_KEY, code);

  try {
    const params = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    params.delete(QR_HASH_KEY);
    const nextHash = params.toString() ? `#${params.toString()}` : '';
    const cleanUrl = `${location.pathname || '/'}${location.search || ''}${nextHash}`;
    history?.replaceState?.(history.state ?? null, '', cleanUrl);
  } catch {
    // The secret is still safely captured in sessionStorage even if a shell
    // does not allow History API cleanup.
  }

  return code;
}

export function peekPendingRecoveryQrCode(storage = globalThis.sessionStorage) {
  try {
    return String(storage?.getItem(PENDING_QR_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function takePendingRecoveryQrCode(storage = globalThis.sessionStorage) {
  const code = peekPendingRecoveryQrCode(storage);
  if (!code) return '';
  try {
    storage?.removeItem(PENDING_QR_KEY);
  } catch {}
  return code;
}
