import { APP_VERSION } from '../appVersion.js';
import { buildBackupPayload, resolveLiveBackupDatabase } from './storage.js';

const SYNC_CONFIG_KEY = 'joeanime-cloud-sync-v1';
const RECOVERY_KIT_FORMAT = 'JoeAnimeDB Recovery Kit';
const RECOVERY_CODE_PREFIX = 'JADB1';
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

function syncApiUrl() {
  return String(import.meta.env?.VITE_SYNC_API_URL || '').trim().replace(/\/$/, '');
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBase64Url(bytes) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function combineBytes(left, right) {
  const combined = new Uint8Array(left.length + right.length);
  combined.set(left, 0);
  combined.set(right, left.length);
  return combined;
}

async function digestPurpose(secret, purpose) {
  const secretBytes = base64UrlToBytes(secret);
  return new Uint8Array(await globalThis.crypto.subtle.digest(
    'SHA-256',
    combineBytes(TEXT_ENCODER.encode(`JoeAnimeDB:${purpose}:`), secretBytes)
  ));
}

async function encryptionKey(secret) {
  const material = await digestPurpose(secret, 'encryption');
  return globalThis.crypto.subtle.importKey(
    'raw',
    material,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

async function authenticationToken(secret) {
  return bytesToBase64Url(await digestPurpose(secret, 'authentication'));
}

async function compress(bytes) {
  if (typeof CompressionStream !== 'function') {
    return { bytes, compression: 'none' };
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return {
    bytes: new Uint8Array(await new Response(stream).arrayBuffer()),
    compression: 'gzip'
  };
}

async function decompress(bytes, compression) {
  if (compression !== 'gzip') return bytes;
  if (typeof DecompressionStream !== 'function') {
    throw new Error('This device cannot open the compressed sync snapshot.');
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function cloudSyncAvailable() {
  return Boolean(syncApiUrl());
}

export function readCloudSyncConfig() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_CONFIG_KEY) || 'null');
    return parsed?.vaultId && parsed?.secret ? parsed : null;
  } catch {
    return null;
  }
}

function saveCloudSyncConfig(config) {
  const normalized = {
    vaultId: String(config.vaultId || ''),
    secret: String(config.secret || ''),
    deviceId: String(config.deviceId || bytesToBase64Url(randomBytes(12))),
    revision: Math.max(0, Number(config.revision || 0)),
    lastSyncedAt: String(config.lastSyncedAt || ''),
    createdAt: String(config.createdAt || new Date().toISOString())
  };
  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(normalized));
  return normalized;
}

export function createCloudSyncIdentity() {
  return saveCloudSyncConfig({
    vaultId: bytesToBase64Url(randomBytes(18)),
    secret: bytesToBase64Url(randomBytes(32)),
    deviceId: bytesToBase64Url(randomBytes(12)),
    revision: 0,
    createdAt: new Date().toISOString()
  });
}

export function disconnectCloudSync() {
  localStorage.removeItem(SYNC_CONFIG_KEY);
}

export function recoveryCodeFor(config = readCloudSyncConfig()) {
  if (!config?.vaultId || !config?.secret) return '';
  return `${RECOVERY_CODE_PREFIX}.${config.vaultId}.${config.secret}`;
}

export function parseRecoveryCode(value) {
  const [prefix, vaultId, secret] = String(value || '').trim().split('.');
  if (prefix !== RECOVERY_CODE_PREFIX || !vaultId || !secret) {
    throw new Error('That is not a valid JoeAnimeDB recovery code.');
  }
  if (base64UrlToBytes(vaultId).length < 16 || base64UrlToBytes(secret).length !== 32) {
    throw new Error('That JoeAnimeDB recovery code is incomplete.');
  }
  return { vaultId, secret };
}

export function linkCloudSyncWithCode(code) {
  const identity = parseRecoveryCode(code);
  return saveCloudSyncConfig({
    ...identity,
    deviceId: bytesToBase64Url(randomBytes(12)),
    revision: 0,
    createdAt: new Date().toISOString()
  });
}

export async function encryptSyncPayload(value, secret, vaultId) {
  const iv = randomBytes(12);
  const packed = await compress(TEXT_ENCODER.encode(JSON.stringify(value)));
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: TEXT_ENCODER.encode(`JoeAnimeDB:${vaultId}:1`)
    },
    await encryptionKey(secret),
    packed.bytes
  );

  return {
    algorithm: 'AES-256-GCM',
    compression: packed.compression,
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext))
  };
}

export async function decryptSyncPayload(envelope, secret, vaultId) {
  if (envelope?.algorithm !== 'AES-256-GCM') {
    throw new Error('This sync snapshot uses an unsupported encryption format.');
  }

  try {
    const plaintext = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64UrlToBytes(envelope.iv),
        additionalData: TEXT_ENCODER.encode(`JoeAnimeDB:${vaultId}:1`)
      },
      await encryptionKey(secret),
      base64UrlToBytes(envelope.ciphertext)
    );
    const unpacked = await decompress(new Uint8Array(plaintext), envelope.compression);
    return JSON.parse(TEXT_DECODER.decode(unpacked));
  } catch (error) {
    throw new Error(`The encrypted sync snapshot could not be opened: ${error?.message || String(error)}`);
  }
}

async function request(path, options = {}, config = readCloudSyncConfig()) {
  const baseUrl = syncApiUrl();
  if (!baseUrl) {
    throw new Error('Cloud sync is not configured in this build yet.');
  }
  if (!config) throw new Error('This device is not linked to a sync library.');

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await authenticationToken(config.secret)}`,
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Sync request failed with status ${response.status}.`);
    error.status = response.status;
    error.details = body;
    throw error;
  }
  return body;
}

export async function uploadCloudLibrary(data, config = readCloudSyncConfig()) {
  if (!config) throw new Error('Enable sync or import a Recovery Kit first.');
  const backup = buildBackupPayload(await resolveLiveBackupDatabase(data));
  const encrypted = await encryptSyncPayload(backup, config.secret, config.vaultId);
  const common = {
    vaultId: config.vaultId,
    deviceId: config.deviceId,
    appVersion: window.JoeAnimeDB?.version || APP_VERSION,
    envelope: encrypted
  };

  let response;
  if (config.revision > 0) {
    response = await request(`/v1/vaults/${encodeURIComponent(config.vaultId)}`, {
      method: 'PUT',
      body: JSON.stringify({ ...common, expectedRevision: config.revision })
    }, config);
  } else {
    try {
      response = await request('/v1/vaults', {
        method: 'POST',
        body: JSON.stringify(common)
      }, config);
    } catch (error) {
      if (error.status !== 409) throw error;
      const remote = await downloadCloudLibrary(config);
      throw new Error(
        `A cloud library already exists at revision ${remote.revision}. Restore it before uploading from this device.`
      );
    }
  }

  const nextConfig = saveCloudSyncConfig({
    ...config,
    revision: response.revision,
    lastSyncedAt: response.updatedAt
  });
  return { ...response, backup, config: nextConfig };
}

export async function downloadCloudLibrary(config = readCloudSyncConfig()) {
  if (!config) throw new Error('Enable sync or import a Recovery Kit first.');
  const response = await request(`/v1/vaults/${encodeURIComponent(config.vaultId)}`, {
    method: 'GET'
  }, config);
  const backup = await decryptSyncPayload(response.envelope, config.secret, config.vaultId);
  const nextConfig = saveCloudSyncConfig({
    ...config,
    revision: response.revision,
    lastSyncedAt: response.updatedAt
  });
  return { ...response, backup, config: nextConfig };
}

export async function deleteCloudLibrary(config = readCloudSyncConfig()) {
  if (!config) return;
  await request(`/v1/vaults/${encodeURIComponent(config.vaultId)}`, {
    method: 'DELETE'
  }, config);
  disconnectCloudSync();
}

export async function buildRecoveryKit(data, config = readCloudSyncConfig()) {
  if (!config) throw new Error('Enable sync before creating a Recovery Kit.');
  const backup = buildBackupPayload(await resolveLiveBackupDatabase(data));
  return {
    format: RECOVERY_KIT_FORMAT,
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    warning: 'This file contains the secret that unlocks your encrypted library. Keep it private.',
    identity: {
      vaultId: config.vaultId,
      secret: config.secret,
      revision: config.revision,
      createdAt: config.createdAt
    },
    snapshot: await encryptSyncPayload(backup, config.secret, config.vaultId)
  };
}

export async function importRecoveryKitText(text) {
  let kit;
  try {
    kit = JSON.parse(String(text || ''));
  } catch {
    throw new Error('That Recovery Kit is not valid JSON.');
  }
  if (kit?.format !== RECOVERY_KIT_FORMAT || !kit?.identity?.vaultId || !kit?.identity?.secret) {
    throw new Error('That file is not a JoeAnimeDB Recovery Kit.');
  }
  const backup = await decryptSyncPayload(
    kit.snapshot,
    kit.identity.secret,
    kit.identity.vaultId
  );
  if (!Array.isArray(backup?.database?.anime)) {
    throw new Error('The Recovery Kit does not contain a valid JoeAnimeDB library.');
  }
  const config = saveCloudSyncConfig({
    vaultId: kit.identity.vaultId,
    secret: kit.identity.secret,
    deviceId: bytesToBase64Url(randomBytes(12)),
    revision: Number(kit.identity.revision || 0),
    createdAt: kit.identity.createdAt || new Date().toISOString()
  });
  return { kit, backup, config };
}
