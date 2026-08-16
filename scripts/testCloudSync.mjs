import assert from 'node:assert/strict';

const stored = new Map();
globalThis.localStorage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, String(value)),
  removeItem: (key) => stored.delete(key)
};
globalThis.window = {
  JoeAnimeDB: { version: 'test', database: {} }
};
if (typeof globalThis.btoa !== 'function') {
  globalThis.btoa = (value) => Buffer.from(value, 'binary').toString('base64');
  globalThis.atob = (value) => Buffer.from(value, 'base64').toString('binary');
}

const {
  buildRecoveryKit,
  createCloudSyncIdentity,
  decryptSyncPayload,
  encryptSyncPayload,
  importRecoveryKitText,
  parseRecoveryCode,
  recoveryCodeFor
} = await import('../src/services/cloudSync.js');
const {
  buildRecoveryQrUrl,
  captureRecoveryQrFromLocation,
  recoveryCodeFromQrValue,
  takePendingRecoveryQrCode
} = await import('../src/services/recoveryQr.js');

const {
  compareSyncLibraries,
  readSyncSafetyCopy,
  saveSyncSafetyCopy,
  summarizeSyncLibrary
} = await import('../src/services/syncSafety.js');

const identity = createCloudSyncIdentity();
const recoveryCode = recoveryCodeFor(identity);
const parsedCode = parseRecoveryCode(recoveryCode);
assert.equal(parsedCode.vaultId, identity.vaultId);
assert.equal(parsedCode.secret, identity.secret);

const pairingUrl = buildRecoveryQrUrl(identity, 'https://joeanimedb.com/');
assert.equal(recoveryCodeFromQrValue(pairingUrl), recoveryCode);
assert.equal(recoveryCodeFromQrValue(recoveryCode), recoveryCode);
assert.equal(pairingUrl.includes('#jadb-recovery='), true);

const pending = new Map();
const sessionStorage = {
  getItem: (key) => pending.get(key) ?? null,
  setItem: (key, value) => pending.set(key, String(value)),
  removeItem: (key) => pending.delete(key)
};
const parsedPairingUrl = new URL(pairingUrl);
let cleanedUrl = '';
const captured = captureRecoveryQrFromLocation({
  location: {
    href: pairingUrl,
    pathname: parsedPairingUrl.pathname,
    search: parsedPairingUrl.search,
    hash: parsedPairingUrl.hash
  },
  history: {
    state: null,
    replaceState: (_state, _title, value) => { cleanedUrl = value; }
  },
  storage: sessionStorage
});
assert.equal(captured, recoveryCode);
assert.equal(cleanedUrl.includes('jadb-recovery'), false);
assert.equal(takePendingRecoveryQrCode(sessionStorage), recoveryCode);
assert.equal(takePendingRecoveryQrCode(sessionStorage), '');

const sample = {
  title: 'Encrypted test',
  nested: { score: 9.4 },
  rows: Array.from({ length: 25 }, (_, index) => ({ id: index, status: 'Completed' }))
};
const encrypted = await encryptSyncPayload(sample, identity.secret, identity.vaultId);
assert.notEqual(encrypted.ciphertext.includes('Encrypted test'), true);
assert.deepEqual(
  await decryptSyncPayload(encrypted, identity.secret, identity.vaultId),
  sample
);
const database = {
  anime: [{ id: 1, title: 'Bleach', status: 'Completed', score: 9.9 }],
  catalog: [],
  joeAI: { feedback: [], preferences: [], conversation: {} }
};
const kit = await buildRecoveryKit(database, identity);
assert.equal(kit.format, 'JoeAnimeDB Recovery Kit');
assert.equal(Object.prototype.hasOwnProperty.call(kit, 'database'), false);
const imported = await importRecoveryKitText(JSON.stringify(kit));
assert.equal(imported.backup.database.anime[0].title, 'Bleach');
assert.equal(imported.config.vaultId, identity.vaultId);


function titles(count, prefix = 'Anime') {
  return {
    database: {
      anime: Array.from({ length: count }, (_, index) => ({
        id: `${prefix}-${index + 1}`,
        title: `${prefix} ${index + 1}`
      }))
    }
  };
}

const equalLocal = titles(135);
const equalCloud = titles(135);
const equalSafety = compareSyncLibraries(equalLocal, equalCloud, {
  remoteExists: true,
  localRevision: 7,
  cloudRevision: 7
});
assert.equal(equalSafety.uploadRisk, 'safe');
assert.equal(equalSafety.removedCount, 0);
assert.equal(equalSafety.addedCount, 0);
assert.equal(equalSafety.recommendedAction, 'none');
assert.equal(summarizeSyncLibrary(equalLocal).count, 135);

const emptyLocalSafety = compareSyncLibraries(titles(0), titles(135), {
  remoteExists: true,
  localRevision: 7,
  cloudRevision: 7
});
assert.equal(emptyLocalSafety.uploadRisk, 'critical');
assert.equal(emptyLocalSafety.uploadPhrase, 'REPLACE WITH EMPTY');
assert.equal(emptyLocalSafety.recommendedAction, 'restore');

const staleSafety = compareSyncLibraries(titles(135), titles(136), {
  remoteExists: true,
  localRevision: 7,
  cloudRevision: 8
});
assert.equal(staleSafety.uploadRisk, 'blocked');
assert.equal(staleSafety.uploadBlocked, true);
assert.equal(staleSafety.recommendedAction, 'restore');

const smallDeletion = compareSyncLibraries(titles(134), titles(135), {
  remoteExists: true,
  localRevision: 8,
  cloudRevision: 8
});
assert.equal(smallDeletion.uploadRisk, 'warning');
assert.equal(smallDeletion.removedCount, 1);

const largeDeletion = compareSyncLibraries(titles(80), titles(135), {
  remoteExists: true,
  localRevision: 8,
  cloudRevision: 8
});
assert.equal(largeDeletion.uploadRisk, 'danger');
assert.equal(largeDeletion.uploadPhrase, 'UPLOAD 80');
assert.equal(largeDeletion.removedCount, 55);

const sameCountDifferentLibrary = compareSyncLibraries(titles(135, 'Local'), titles(135, 'Cloud'), {
  remoteExists: true,
  localRevision: 8,
  cloudRevision: 8
});
assert.equal(sameCountDifferentLibrary.uploadRisk, 'danger');
assert.equal(sameCountDifferentLibrary.removedCount, 135);
assert.equal(sameCountDifferentLibrary.addedCount, 135);

const emptyCloudRestore = compareSyncLibraries(titles(25), titles(0), {
  remoteExists: true,
  localRevision: 1,
  cloudRevision: 1
});
assert.equal(emptyCloudRestore.restoreRisk, 'critical');
assert.equal(emptyCloudRestore.restorePhrase, 'RESTORE EMPTY');



const ratedCloud = {
  database: {
    anime: Array.from({ length: 40 }, (_, index) => ({
      id: `rated-${index + 1}`,
      title: `Rated ${index + 1}`,
      joeScore: 9.0,
      notes: index < 12 ? `note ${index + 1}` : '',
      favorite: index < 8
    }))
  }
};
const metadataWipedLocal = {
  database: {
    anime: ratedCloud.database.anime.map((item) => ({ id: item.id, title: item.title }))
  }
};
const metadataLossSafety = compareSyncLibraries(metadataWipedLocal, ratedCloud, {
  remoteExists: true,
  localRevision: 4,
  cloudRevision: 4
});
assert.equal(metadataLossSafety.removedCount, 0);
assert.equal(metadataLossSafety.addedCount, 0);
assert.equal(metadataLossSafety.uploadRisk, 'danger');
assert.match(metadataLossSafety.uploadReason, /ratings/);

const firstUpload = compareSyncLibraries(titles(25), {}, {
  remoteExists: false,
  localRevision: 0,
  cloudRevision: 0
});
assert.equal(firstUpload.uploadRisk, 'safe');
assert.equal(firstUpload.recommendedAction, 'upload');

const savedSafetyCopy = saveSyncSafetyCopy(equalCloud, {
  kind: 'cloud-before-upload',
  vaultId: identity.vaultId,
  revision: 7
});
assert.equal(savedSafetyCopy.backup.database.anime.length, 135);
assert.equal(readSyncSafetyCopy(identity).revision, 7);
assert.equal(
  readSyncSafetyCopy({ vaultId: 'different-vault' }),
  null,
  'Safety copies must stay scoped to the matching sync vault'
);

console.log('Cloud sync encryption, recovery, and destructive-sync safety tests passed.');
