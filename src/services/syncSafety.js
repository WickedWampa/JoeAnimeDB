import { decryptSyncPayload } from './cloudSync.js';
import { buildBackupPayload, resolveLiveBackupDatabase } from './storage.js';

const TEXT_ENCODER = new TextEncoder();
const SYNC_SAFETY_COPY_KEY = 'joeanime-cloud-sync-safety-v1';

function syncApiUrl() {
  return String(import.meta.env?.VITE_SYNC_API_URL || '').trim().replace(/\/$/, '');
}

function base64UrlToBytes(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64Url(bytes) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function combineBytes(left, right) {
  const combined = new Uint8Array(left.length + right.length);
  combined.set(left, 0);
  combined.set(right, left.length);
  return combined;
}

async function authenticationToken(secret) {
  const secretBytes = base64UrlToBytes(secret);
  const material = await globalThis.crypto.subtle.digest(
    'SHA-256',
    combineBytes(TEXT_ENCODER.encode('JoeAnimeDB:authentication:'), secretBytes)
  );
  return bytesToBase64Url(new Uint8Array(material));
}

function normalizeTitle(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function animeKey(item = {}) {
  const title = normalizeTitle(item.officialTitle || item.title || item.englishTitle || item.romajiTitle || '');
  if (title) return `title:${title}`;
  if (item.malId) return `mal:${item.malId}`;
  if (item.kitsuId) return `kitsu:${item.kitsuId}`;
  if (item.id) return `id:${item.id}`;
  return '';
}

export function animeRowsFromBackupLike(value = {}) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.database?.anime)) return value.database.anime;
  if (Array.isArray(value?.anime)) return value.anime;
  if (Array.isArray(value?.library)) return value.library;
  return [];
}

export function summarizeSyncLibrary(value = {}) {
  const rows = animeRowsFromBackupLike(value);
  const keys = new Set(rows.map(animeKey).filter(Boolean));
  const metrics = rows.reduce((summary, item = {}) => {
    const rating = Number(item.joeScore ?? item.score ?? item.rating ?? item.userScore ?? 0);
    const note = String(item.notes ?? item.note ?? item.userNotes ?? '').trim();
    const rewatchCount = Number(item.rewatchCount ?? item.rewatches ?? 0);
    if (Number.isFinite(rating) && rating > 0) summary.rated += 1;
    if (note) summary.noted += 1;
    if (Boolean(item.favorite ?? item.isFavorite ?? item.favorited)) summary.favorites += 1;
    if ((Number.isFinite(rewatchCount) && rewatchCount > 0) || item.rewatched === true) summary.rewatched += 1;
    return summary;
  }, { rated: 0, noted: 0, favorites: 0, rewatched: 0 });

  return {
    count: rows.length,
    uniqueCount: keys.size,
    keys,
    rows,
    metrics
  };
}

export async function buildLocalSyncBackup(data) {
  return buildBackupPayload(await resolveLiveBackupDatabase(data));
}

export async function previewCloudLibrary(config) {
  if (!config?.vaultId || !config?.secret) {
    throw new Error('This device is not linked to a sync library.');
  }

  const baseUrl = syncApiUrl();
  if (!baseUrl) throw new Error('Cloud sync is not configured in this build yet.');

  const response = await fetch(`${baseUrl}/v1/vaults/${encodeURIComponent(config.vaultId)}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await authenticationToken(config.secret)}`
    }
  });
  const body = await response.json().catch(() => ({}));

  if (response.status === 404) {
    return { exists: false, revision: 0, updatedAt: '', backup: null };
  }
  if (!response.ok) {
    const error = new Error(body.error || `Sync preflight failed with status ${response.status}.`);
    error.status = response.status;
    error.details = body;
    throw error;
  }

  const backup = await decryptSyncPayload(body.envelope, config.secret, config.vaultId);
  return {
    ...body,
    exists: true,
    revision: Number(body.revision || 0),
    backup
  };
}

function setDifference(left, right) {
  return [...left].filter((key) => !right.has(key));
}

function metricLosses(source = {}, target = {}) {
  const losses = {};
  for (const key of ['rated', 'noted', 'favorites', 'rewatched']) {
    const before = Number(source?.[key] || 0);
    const after = Number(target?.[key] || 0);
    const lost = Math.max(0, before - after);
    const ratio = before > 0 ? lost / before : 0;
    losses[key] = { before, after, lost, ratio };
  }
  return losses;
}

function seriousMetricLoss(losses = {}) {
  return Object.values(losses).some((entry) => entry.lost >= 10 || (entry.lost >= 3 && entry.ratio >= 0.25));
}

function anyMetricLoss(losses = {}) {
  return Object.values(losses).some((entry) => entry.lost > 0);
}

function describeMetricLoss(losses = {}) {
  const labels = {
    rated: 'ratings',
    noted: 'notes',
    favorites: 'favorites',
    rewatched: 'rewatch markers'
  };
  const parts = Object.entries(losses)
    .filter(([, entry]) => entry.lost > 0)
    .map(([key, entry]) => `${entry.lost} ${labels[key]}`);
  return parts.length ? parts.join(', ') : '';
}

export function compareSyncLibraries(localLike, cloudLike, options = {}) {
  const local = summarizeSyncLibrary(localLike);
  const cloud = summarizeSyncLibrary(cloudLike);
  const remoteExists = options.remoteExists !== false;
  const cloudRevision = Number(options.cloudRevision || 0);
  const localRevision = Number(options.localRevision || 0);
  const addedKeys = setDifference(local.keys, cloud.keys);
  const removedKeys = setDifference(cloud.keys, local.keys);
  const removedRatio = cloud.uniqueCount > 0 ? removedKeys.length / cloud.uniqueCount : 0;
  const addedRatio = local.uniqueCount > 0 ? addedKeys.length / local.uniqueCount : 0;
  const uploadMetricLosses = metricLosses(cloud.metrics, local.metrics);
  const restoreMetricLosses = metricLosses(local.metrics, cloud.metrics);
  const staleRevision = remoteExists && cloudRevision > 0 && localRevision !== cloudRevision;

  let uploadRisk = 'safe';
  let uploadBlocked = false;
  let uploadPhrase = '';
  let uploadReason = '';

  if (staleRevision) {
    uploadRisk = 'blocked';
    uploadBlocked = true;
    uploadReason = `Cloud revision ${cloudRevision} is newer than this device's revision ${localRevision}. Restore before uploading.`;
  } else if (remoteExists && cloud.count > 0 && local.count === 0) {
    uploadRisk = 'critical';
    uploadPhrase = 'REPLACE WITH EMPTY';
    uploadReason = `This would replace ${cloud.count} cloud titles with an empty library.`;
  } else if (remoteExists && removedKeys.length > 0 && (removedRatio >= 0.25 || removedKeys.length >= 25)) {
    uploadRisk = 'danger';
    uploadPhrase = `UPLOAD ${local.count}`;
    uploadReason = `This upload would remove ${removedKeys.length} title${removedKeys.length === 1 ? '' : 's'} from the cloud copy.`;
  } else if (remoteExists && seriousMetricLoss(uploadMetricLosses)) {
    uploadRisk = 'danger';
    uploadPhrase = `UPLOAD ${local.count}`;
    uploadReason = `The title list is intact, but this upload would remove saved data: ${describeMetricLoss(uploadMetricLosses)}.`;
  } else if (remoteExists && removedKeys.length > 0) {
    uploadRisk = 'warning';
    uploadReason = `This upload would remove ${removedKeys.length} cloud title${removedKeys.length === 1 ? '' : 's'}.`;
  } else if (remoteExists && anyMetricLoss(uploadMetricLosses)) {
    uploadRisk = 'warning';
    uploadReason = `This upload would remove some saved data: ${describeMetricLoss(uploadMetricLosses)}.`;
  } else if (!remoteExists) {
    uploadReason = `No cloud snapshot exists yet. This will create one with ${local.count} title${local.count === 1 ? '' : 's'}.`;
  } else if (addedKeys.length > 0) {
    uploadReason = `This will add ${addedKeys.length} title${addedKeys.length === 1 ? '' : 's'} to the cloud copy.`;
  } else {
    uploadReason = 'Local and cloud libraries contain the same titles.';
  }

  let restoreRisk = 'safe';
  let restorePhrase = '';
  let restoreReason = '';

  if (!remoteExists) {
    restoreRisk = 'blocked';
    restoreReason = 'There is no cloud snapshot to restore.';
  } else if (cloud.count === 0 && local.count > 0) {
    restoreRisk = 'critical';
    restorePhrase = 'RESTORE EMPTY';
    restoreReason = `This would replace ${local.count} local titles with an empty cloud library.`;
  } else if (seriousMetricLoss(restoreMetricLosses)) {
    restoreRisk = 'danger';
    restorePhrase = `RESTORE ${cloud.count}`;
    restoreReason = `The title list may look safe, but restoring would remove saved data from this device: ${describeMetricLoss(restoreMetricLosses)}.`;
  } else if (addedKeys.length > 0 && (addedRatio >= 0.25 || addedKeys.length >= 25)) {
    restoreRisk = 'danger';
    restorePhrase = `RESTORE ${cloud.count}`;
    restoreReason = `Restoring would remove ${addedKeys.length} title${addedKeys.length === 1 ? '' : 's'} that exist only on this device.`;
  } else if (addedKeys.length > 0) {
    restoreRisk = 'warning';
    restoreReason = `Restoring would remove ${addedKeys.length} local-only title${addedKeys.length === 1 ? '' : 's'}.`;
  } else if (anyMetricLoss(restoreMetricLosses)) {
    restoreRisk = 'warning';
    restoreReason = `Restoring would remove some saved data from this device: ${describeMetricLoss(restoreMetricLosses)}.`;
  } else if (removedKeys.length > 0) {
    restoreReason = `Restoring will bring ${removedKeys.length} cloud title${removedKeys.length === 1 ? '' : 's'} onto this device.`;
  } else {
    restoreReason = 'Local and cloud libraries contain the same titles.';
  }

  const cloudHasMoreSavedData = anyMetricLoss(uploadMetricLosses) && !anyMetricLoss(restoreMetricLosses);
  const localHasMoreSavedData = anyMetricLoss(restoreMetricLosses) && !anyMetricLoss(uploadMetricLosses);
  const recommendedAction = !remoteExists
    ? 'upload'
    : local.count === 0 && cloud.count > 0
      ? 'restore'
      : staleRevision
        ? 'restore'
        : cloudHasMoreSavedData
          ? 'restore'
          : localHasMoreSavedData
            ? 'upload'
            : removedKeys.length > addedKeys.length
              ? 'restore'
              : addedKeys.length > removedKeys.length
                ? 'upload'
                : 'none';

  return {
    localCount: local.count,
    cloudCount: cloud.count,
    localUniqueCount: local.uniqueCount,
    cloudUniqueCount: cloud.uniqueCount,
    addedCount: addedKeys.length,
    removedCount: removedKeys.length,
    addedKeys,
    removedKeys,
    removedRatio,
    localMetrics: local.metrics,
    cloudMetrics: cloud.metrics,
    uploadMetricLosses,
    restoreMetricLosses,
    cloudRevision,
    localRevision,
    staleRevision,
    remoteExists,
    uploadRisk,
    uploadBlocked,
    uploadPhrase,
    uploadReason,
    restoreRisk,
    restorePhrase,
    restoreReason,
    recommendedAction
  };
}

export async function buildSyncPreflight(data, config) {
  const localBackup = await buildLocalSyncBackup(data);
  const remote = await previewCloudLibrary(config);
  const comparison = compareSyncLibraries(localBackup, remote.backup || {}, {
    remoteExists: remote.exists,
    cloudRevision: remote.revision,
    localRevision: config?.revision
  });

  return { localBackup, remote, comparison };
}

export function saveSyncSafetyCopy(backup, meta = {}) {
  if (!Array.isArray(backup?.database?.anime)) return null;
  const payload = {
    format: 'JoeAnimeDB Sync Safety Copy',
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    kind: String(meta.kind || 'manual'),
    vaultId: String(meta.vaultId || ''),
    revision: Math.max(0, Number(meta.revision || 0)),
    backup
  };

  try {
    localStorage.setItem(SYNC_SAFETY_COPY_KEY, JSON.stringify(payload));
    return payload;
  } catch {
    return null;
  }
}

export function readSyncSafetyCopy(config = {}) {
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_SAFETY_COPY_KEY) || 'null');
    if (parsed?.format !== 'JoeAnimeDB Sync Safety Copy' || !Array.isArray(parsed?.backup?.database?.anime)) {
      return null;
    }
    if (config?.vaultId && parsed.vaultId && parsed.vaultId !== config.vaultId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSyncSafetyCopy() {
  localStorage.removeItem(SYNC_SAFETY_COPY_KEY);
}

export function syncRiskLabel(risk = 'safe') {
  switch (risk) {
    case 'blocked': return 'Restore required';
    case 'critical': return 'Empty-library protection';
    case 'danger': return 'Large destructive change';
    case 'warning': return 'Review changes';
    default: return 'Safe to sync';
  }
}
