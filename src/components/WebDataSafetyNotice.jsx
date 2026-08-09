import React, { useEffect, useState } from 'react';
import { exportBackup } from '../services/storage';
import { requestWebPersistentStorage } from '../platform/webDatabase';

const ACKNOWLEDGMENT_KEY = 'joeanime-web-data-safety-ack-v1';

function hasAcknowledged() {
  try {
    return localStorage.getItem(ACKNOWLEDGMENT_KEY) === 'yes';
  } catch {
    return false;
  }
}

export function WebDataSafetyNotice({ data, hidden = false, onOpenSettings }) {
  const [acknowledged, setAcknowledged] = useState(hasAcknowledged);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [persistence, setPersistence] = useState(null);

  useEffect(() => {
    if (document.documentElement.dataset.platform !== 'web') return;

    let active = true;
    requestWebPersistentStorage().then((result) => {
      if (active) setPersistence(result);
    });

    return () => {
      active = false;
    };
  }, []);

  if (
    hidden ||
    acknowledged ||
    document.documentElement.dataset.platform !== 'web'
  ) {
    return null;
  }

  async function saveBackup() {
    if (saving) return;
    setSaving(true);
    setMessage('Preparing your backup...');
    try {
      const outcome = await exportBackup(data);
      if (outcome?.result?.canceled) {
        setMessage('Backup cancelled.');
      } else if (outcome?.result?.ok) {
        setMessage(
          outcome.result.method === 'download-fallback'
            ? 'Backup downloaded. Keep it somewhere safe.'
            : 'Rolling backup saved. Future backups can update the same file.'
        );
      } else {
        throw new Error(outcome?.result?.error || 'The backup could not be saved.');
      }
    } catch (error) {
      setMessage(`Backup failed: ${error?.message || String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  function acknowledge() {
    try {
      localStorage.setItem(ACKNOWLEDGMENT_KEY, 'yes');
    } catch {}
    setAcknowledged(true);
  }

  return (
    <div className="webDataSafetyOverlay" role="dialog" aria-modal="true" aria-labelledby="web-data-safety-title">
      <section className="webDataSafetyCard">
        <p className="webDataSafetyEyebrow">Before you continue on the web</p>
        <h2 id="web-data-safety-title">Protect your local library</h2>
        <p>
          JoeAnimeDB stores your web library inside this browser. Clearing site data, resetting the
          browser, or switching browsers can erase the local copy.
        </p>
        <ul>
          <li>Your library uses the browser's larger <strong>IndexedDB</strong> storage.</li>
          <li>Keep using <strong>joeanimedb.com</strong>; browser storage belongs to one exact site.</li>
          <li>Update <strong>JoeAnimeDB-backup.json</strong> regularly.</li>
          <li>Restore it later from Settings, Library, Restore Full Backup.</li>
        </ul>
        {persistence?.supported && (
          <p className={`webDataPersistenceStatus ${persistence.persisted ? 'isProtected' : ''}`}>
            {persistence.persisted
              ? 'Protected browser storage is enabled for this device.'
              : 'Standard browser storage is active. Keep a separate backup in case site data is cleared.'}
          </p>
        )}
        {message && <p className="webDataSafetyMessage" aria-live="polite">{message}</p>}
        <div className="webDataSafetyActions">
          <button type="button" className="primary" onClick={saveBackup} disabled={saving}>
            {saving ? 'Saving...' : 'Export Backup Now'}
          </button>
          <button type="button" onClick={() => onOpenSettings?.()}>Open Backup Settings</button>
          <button type="button" className="quiet" onClick={acknowledge}>I Understand</button>
        </div>
      </section>
    </div>
  );
}
