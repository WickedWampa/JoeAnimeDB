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
console.log('Cloud sync encryption, recovery code, Recovery QR, and Recovery Kit tests passed.');
