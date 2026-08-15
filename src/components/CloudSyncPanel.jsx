import React from 'react';
import { saveTextExportAs } from '../platform/fileExports.js';
import {
  buildRecoveryKit,
  cloudSyncAvailable,
  createCloudSyncIdentity,
  deleteCloudLibrary,
  disconnectCloudSync,
  downloadCloudLibrary,
  importRecoveryKitText,
  linkCloudSyncWithCode,
  readCloudSyncConfig,
  recoveryCodeFor,
  uploadCloudLibrary
} from '../services/cloudSync.js';
import { applyBackupPreferences } from '../services/storage.js';
import '../styles/cloud-sync.css';

function formatDate(value) {
  if (!value) return 'Not synced yet';
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value;
}

export function CloudSyncPanel({
  data,
  onRestoreBackup,
  onThemeChange,
  onSaveDisplayName
}) {
  const [config, setConfig] = React.useState(() => readCloudSyncConfig());
  const [busy, setBusy] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [recoveryCodeInput, setRecoveryCodeInput] = React.useState('');
  const [showRecoveryCodeLink, setShowRecoveryCodeLink] = React.useState(false);
  const kitInputRef = React.useRef(null);
  const apiReady = cloudSyncAvailable();

  function refreshConfig() {
    setConfig(readCloudSyncConfig());
  }

  async function applyBackup(backup, label) {
    await onRestoreBackup?.(backup.database);
    applyBackupPreferences(backup.preferences || {});
    if (backup.preferences?.theme) onThemeChange?.(backup.preferences.theme);
    if (backup.preferences?.displayName) {
      await onSaveDisplayName?.(backup.preferences.displayName);
    }
    setStatus(`${label} restored. Reload JoeAnimeDB if a saved appearance preference does not update immediately.`);
  }

  function enableSync() {
    const identity = createCloudSyncIdentity();
    setConfig(identity);
    setStatus('Sync identity created. Download the Recovery Kit, then upload this library.');
  }

  function beginLinkWithCode() {
    setRecoveryCodeInput('');
    setShowRecoveryCodeLink(true);
    setStatus(config
      ? 'Paste the recovery code from the device whose cloud library you want to use.'
      : 'Paste the recovery code from your other JoeAnimeDB device.');
  }

  function cancelLinkWithCode() {
    setRecoveryCodeInput('');
    setShowRecoveryCodeLink(false);
  }

  function linkWithCode(event) {
    event?.preventDefault();
    const code = recoveryCodeInput.trim();

    if (!code) {
      setStatus('Paste a JoeAnimeDB recovery code first.');
      return;
    }

    if (config) {
      const confirmed = window.confirm(
        'Replace this device\'s current sync link with the recovery code from another device?\n\n' +
        'Your local library will not be changed. After linking, choose Restore Cloud Library to load the shared cloud copy.'
      );
      if (!confirmed) return;
    }

    try {
      const identity = linkCloudSyncWithCode(code);
      setConfig(identity);
      setRecoveryCodeInput('');
      setShowRecoveryCodeLink(false);
      setStatus('This device is linked. Choose Restore Cloud Library to load the shared library.');
    } catch (error) {
      setStatus(error?.message || String(error));
    }
  }

  async function copyRecoveryCode() {
    const code = recoveryCodeFor(config);
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setStatus('Recovery code copied. Treat it like a password.');
    } catch {
      window.prompt('Copy this recovery code:', code);
    }
  }

  async function exportKit() {
    if (!config || busy) return;
    setBusy('kit');
    setStatus('Preparing the Recovery Kit...');
    try {
      const kit = await buildRecoveryKit(data, config);
      const filename = `JoeAnimeDB-Recovery-Kit-${new Date().toISOString().slice(0, 10)}.json`;
      const result = await saveTextExportAs(
        filename,
        JSON.stringify(kit, null, 2),
        'application/json'
      );
      setStatus(result?.canceled
        ? 'Recovery Kit export cancelled.'
        : 'Recovery Kit saved. Keep it private and store a second copy somewhere safe.');
    } catch (error) {
      setStatus(`Recovery Kit failed: ${error?.message || String(error)}`);
    } finally {
      setBusy('');
    }
  }

  async function importKit(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) return;
    setBusy('import');
    setStatus(`Opening ${file.name}...`);
    try {
      const imported = await importRecoveryKitText(await file.text());
      const count = imported.backup.database.anime.length;
      const confirmed = window.confirm(
        `Link this device and restore ${count} library title${count === 1 ? '' : 's'} from the Recovery Kit?\n\n` +
        'The current local database will be replaced.'
      );
      if (!confirmed) {
        refreshConfig();
        setStatus('Device linked. Local library restore was skipped.');
        return;
      }
      await applyBackup(imported.backup, 'Recovery Kit');
      refreshConfig();
    } catch (error) {
      setStatus(`Recovery Kit import failed: ${error?.message || String(error)}`);
    } finally {
      setBusy('');
    }
  }

  async function upload() {
    if (!config || busy) return;
    setBusy('upload');
    setStatus('Encrypting and uploading this library...');
    try {
      const result = await uploadCloudLibrary(data, config);
      setConfig(result.config);
      setStatus(`Cloud library updated at revision ${result.revision}.`);
    } catch (error) {
      refreshConfig();
      setStatus(`Upload failed: ${error?.message || String(error)}`);
    } finally {
      setBusy('');
    }
  }

  async function restoreCloud() {
    if (!config || busy) return;
    const confirmed = window.confirm(
      'Restore the encrypted cloud library on this device?\n\nThe current local database will be replaced.'
    );
    if (!confirmed) return;
    setBusy('download');
    setStatus('Downloading and decrypting the cloud library...');
    try {
      const result = await downloadCloudLibrary(config);
      await applyBackup(result.backup, `Cloud revision ${result.revision}`);
      setConfig(result.config);
    } catch (error) {
      setStatus(`Cloud restore failed: ${error?.message || String(error)}`);
    } finally {
      setBusy('');
    }
  }

  function disconnect() {
    if (!window.confirm('Disconnect this device? The local library and cloud copy will be kept.')) return;
    disconnectCloudSync();
    setConfig(null);
    setShowRecoveryCodeLink(false);
    setRecoveryCodeInput('');
    setStatus('This device was disconnected. Its local library was not changed.');
  }

  async function removeCloudCopy() {
    if (!config || busy) return;
    const confirmed = window.confirm(
      'Permanently delete the encrypted cloud copy and disconnect this device?\n\nYour local library will be kept.'
    );
    if (!confirmed) return;
    setBusy('delete');
    try {
      await deleteCloudLibrary(config);
      setConfig(null);
      setShowRecoveryCodeLink(false);
      setRecoveryCodeInput('');
      setStatus('Cloud copy deleted. The local library was kept.');
    } catch (error) {
      setStatus(`Cloud deletion failed: ${error?.message || String(error)}`);
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="cloudSyncPanel">
      <header>
        <div>
          <p className="settingsWorkshopEyebrow">Optional Device Sync</p>
          <h2>Keep Your Library With You</h2>
          <p>No account, email address, or subscription. JoeAnimeDB encrypts the snapshot on this device before it is uploaded.</p>
        </div>
        <span className={config ? 'linked' : ''}>{config ? 'Linked' : 'Local only'}</span>
      </header>

      {!apiReady && (
        <aside>
          The sync backend is not configured in this build. Recovery Kits work now; cloud upload and restore become available after the free Cloudflare Worker is deployed.
        </aside>
      )}

      {config ? (
        <>
          <div className="cloudSyncFacts">
            <div><small>Cloud revision</small><strong>{config.revision || 'Not uploaded'}</strong></div>
            <div><small>Last sync</small><strong>{formatDate(config.lastSyncedAt)}</strong></div>
            <div><small>Protection</small><strong>AES-256-GCM</strong></div>
          </div>

          <div className="cloudSyncActions">
            <button type="button" className="primary" onClick={upload} disabled={Boolean(busy) || !apiReady}>
              <strong>{busy === 'upload' ? 'Uploading...' : 'Upload This Library'}</strong>
              <small>Create a new encrypted cloud revision</small>
            </button>

            <button type="button" onClick={restoreCloud} disabled={Boolean(busy) || !apiReady}>
              <strong>{busy === 'download' ? 'Restoring...' : 'Restore Cloud Library'}</strong>
              <small>Replace this device from the cloud copy</small>
            </button>

            <button type="button" onClick={exportKit} disabled={Boolean(busy)}>
              <strong>{busy === 'kit' ? 'Preparing...' : 'Download Recovery Kit'}</strong>
              <small>Encrypted snapshot plus the device-link secret</small>
            </button>

            <button type="button" onClick={copyRecoveryCode} disabled={Boolean(busy)}>
              <strong>Copy Recovery Code</strong>
              <small>Link another device without an account</small>
            </button>

            <button type="button" onClick={beginLinkWithCode} disabled={Boolean(busy)}>
              <strong>Link With Recovery Code</strong>
              <small>Switch this device to an existing cloud library</small>
            </button>
          </div>

          <details>
            <summary>Device and cloud controls</summary>
            <div>
              <button type="button" onClick={disconnect} disabled={Boolean(busy)}>Disconnect This Device</button>
              <button type="button" className="danger" onClick={removeCloudCopy} disabled={Boolean(busy) || !apiReady}>
                Delete Cloud Copy
              </button>
            </div>
          </details>
        </>
      ) : (
        <div className="cloudSyncStart">
          <button type="button" className="primary" onClick={enableSync}>
            <strong>Enable Sync</strong>
            <small>Create a private library identity on this device</small>
          </button>

          <button type="button" onClick={beginLinkWithCode}>
            <strong>Link With Recovery Code</strong>
            <small>Connect to an existing encrypted cloud library</small>
          </button>
        </div>
      )}

      {showRecoveryCodeLink && (
        <form className="cloudSyncCodeLink" onSubmit={linkWithCode}>
          <label htmlFor="cloudSyncRecoveryCode">Recovery code from your other device</label>
          <div className="cloudSyncCodeLinkRow">
            <input
              id="cloudSyncRecoveryCode"
              type="password"
              value={recoveryCodeInput}
              onChange={(event) => setRecoveryCodeInput(event.target.value)}
              placeholder="Paste recovery code"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck="false"
              disabled={Boolean(busy)}
              autoFocus
            />
            <button
              type="submit"
              className="primary"
              disabled={Boolean(busy) || !recoveryCodeInput.trim()}
            >
              Link This Device
            </button>
            <button type="button" onClick={cancelLinkWithCode} disabled={Boolean(busy)}>
              Cancel
            </button>
          </div>
          <small>
            Linking changes only the sync identity. It does not overwrite this device&apos;s local library until you choose Restore Cloud Library.
          </small>
        </form>
      )}

      <input
        ref={kitInputRef}
        className="settingsImportInput"
        type="file"
        accept=".json,application/json"
        onChange={importKit}
      />

      <button
        type="button"
        className="cloudSyncImport"
        onClick={() => kitInputRef.current?.click()}
        disabled={Boolean(busy)}
      >
        Import Recovery Kit
      </button>

      {status && <p className="cloudSyncStatus" aria-live="polite">{status}</p>}

      <footer>
        Local storage remains the primary copy. A Recovery Kit contains the secret that unlocks the encrypted snapshot, so keep the file private and back it up separately.
      </footer>
    </section>
  );
}
