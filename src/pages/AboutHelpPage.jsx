import React, { useEffect, useMemo, useState } from 'react';
import { APP_VERSION } from '../appVersion';
import {
  BadgeInfo,
  BookOpenText,
  Bot,
  CheckCircle2,
  CircleHelp,
  Clipboard,
  Coffee,
  Database,
  Download,
  ExternalLink,
  FileJson,
  FolderArchive,
  FolderOpen,
  GraduationCap,
  HeartHandshake,
  RefreshCw,
  Rocket,
  ScrollText,
  ServerCog,
  Wrench
} from 'lucide-react';
import { checkMetadataProviders } from '../services/providerHealth';
import { exportDiagnostics } from '../services/storage';
import '../styles/about-help.css';

const RELEASE_NOTES_URL = 'https://github.com/WickedWampa/JoeAnimeDB/releases';
const SUPPORT_URL = 'https://buymeacoffee.com/wickedwampa';
const KITSU_URL = 'https://kitsu.io/';
const WIKIDATA_URL = 'https://www.wikidata.org/';
const FALLBACK_VERSION = APP_VERSION;

function displayVersion(value = '') {
  const clean = String(value || '').trim().replace(/^v/i, '');
  return clean ? `v${clean}` : `v${FALLBACK_VERSION}`;
}

export function AboutHelpPage({
  data,
  stats,
  onReplayTutorial
}) {
  const isAndroid = window.JoeAnimeDB?.platform === 'android';
  const [systemInfo, setSystemInfo] = useState(null);
  const [providerHealth, setProviderHealth] = useState(null);
  const [checkingProviders, setCheckingProviders] = useState(false);
  const [updateStatus, setUpdateStatus] = useState({
    state: 'loading',
    message: 'Loading update status…',
    percent: 0
  });
  const [updateBusy, setUpdateBusy] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let active = true;

    async function loadSystemInfo() {
      const [storageResult, appResult] = await Promise.allSettled([
        window.JoeAnimeDB?.storage?.getInfo?.(),
        window.JoeAnimeDB?.app?.getInfo?.()
      ]);

      if (!active) return;

      setSystemInfo({
        ...(storageResult.status === 'fulfilled' ? storageResult.value || {} : {}),
        ...(appResult.status === 'fulfilled' ? appResult.value || {} : {})
      });
    }

    void loadSystemInfo();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const updates = window.JoeAnimeDB?.updates;

    if (!updates) {
      setUpdateStatus({
        state: 'unavailable',
        message: 'Automatic updates are unavailable in this build.',
        percent: 0
      });
      return undefined;
    }

    let active = true;
    const unsubscribe = updates.onStatus?.((nextStatus) => {
      if (active && nextStatus) setUpdateStatus(nextStatus);
    });

    updates.getStatus?.()
      .then((nextStatus) => {
        if (active && nextStatus) setUpdateStatus(nextStatus);
      })
      .catch((error) => {
        if (!active) return;
        setUpdateStatus({
          state: 'error',
          message: `Could not load update status: ${error?.message || String(error)}`,
          percent: 0
        });
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const version = displayVersion(
    systemInfo?.version ||
    window.JoeAnimeDB?.version ||
    FALLBACK_VERSION
  );

  const buildLabel = useMemo(() => {
    if (isAndroid) return `Android · build ${systemInfo?.build || window.JoeAnimeDB?.build || 'beta'}`;
    if (systemInfo?.packaged === false) return 'Development build';
    if (systemInfo?.architecture) return `Desktop · ${systemInfo.architecture}`;
    return 'Desktop Beta';
  }, [isAndroid, systemInfo]);

  async function openExternal(url) {
    try {
      if (window.JoeAnimeDB?.app?.openExternal) {
        const result = await window.JoeAnimeDB.app.openExternal(url);
        if (!result?.ok) throw new Error(result?.error || 'The link could not be opened.');
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      setStatus(`Could not open link: ${error?.message || String(error)}`);
    }
  }

  async function openFolder(kind) {
    const openers = {
      data: window.JoeAnimeDB?.storage?.openDataFolder,
      backups: window.JoeAnimeDB?.storage?.openBackupsFolder,
      logs: window.JoeAnimeDB?.storage?.openLogsFolder
    };
    const labels = {
      data: 'Data',
      backups: 'Backup',
      logs: 'Logs'
    };
    const opener = openers[kind];

    if (!opener) {
      setStatus(`${labels[kind]} folder access is available in the desktop build.`);
      return;
    }

    try {
      const result = await opener();
      setStatus(
        result?.ok
          ? `${labels[kind]} folder opened.`
          : result?.error || `${labels[kind]} folder could not be opened.`
      );
    } catch (error) {
      setStatus(`Could not open ${labels[kind].toLowerCase()} folder: ${error?.message || String(error)}`);
    }
  }

  async function testProviders() {
    if (checkingProviders) return;
    setCheckingProviders(true);
    setStatus('Checking Kitsu and Wikidata...');

    try {
      const result = await checkMetadataProviders();
      setProviderHealth(result);
      setStatus(
        result.online === result.total
          ? 'Kitsu and Wikidata are online.'
          : `${result.online}/${result.total} metadata providers are online. Cached data remains available.`
      );
    } catch (error) {
      setStatus(`Provider check failed: ${error?.message || String(error)}`);
    } finally {
      setCheckingProviders(false);
    }
  }

  function downloadSystemDiagnostics() {
    exportDiagnostics({
      data,
      stats,
      providerHealth,
      storageInfo: systemInfo,
      metadata: {
        source: 'About / Help'
      }
    });
    setStatus('Diagnostics exported. Personal notes and ratings were not included.');
  }

  async function copySystemDetails() {
    const details = [
      `JoeAnimeDB ${version}`,
      `Build: ${buildLabel}`,
      `Database: ${stats?.databaseEngine || data?.engine || 'Local'}`,
      `Library: ${data?.anime?.length || 0} titles`,
      `Catalog: ${data?.catalog?.length || 0} titles`,
      `Data: ${systemInfo?.database || systemInfo?.data || 'Desktop storage'}`
    ].join('\n');

    try {
      await navigator.clipboard.writeText(details);
      setStatus('System details copied to the clipboard.');
    } catch {
      setStatus('Could not copy system details. Export Diagnostics instead.');
    }
  }

  function replayTutorial() {
    onReplayTutorial?.();
    setStatus('The first-time tutorial was reopened.');
  }

  async function runUpdateAction(action) {
    const updates = window.JoeAnimeDB?.updates;
    const actions = {
      check: updates?.check,
      download: updates?.download,
      install: updates?.install
    };
    const handler = actions[action];

    if (!handler || updateBusy) {
      setStatus('Automatic updates are unavailable in this build.');
      return;
    }

    setUpdateBusy(true);

    try {
      const result = await handler();
      if (result?.status) setUpdateStatus(result.status);

      if (!result?.ok) {
        throw new Error(result?.error || result?.status?.message || 'The update action could not be completed.');
      }

      if (action === 'check') setStatus('Update check started.');
      if (action === 'download') {
        setStatus(isAndroid
          ? 'The APK download was opened. Tap the downloaded APK and approve the Android update.'
          : 'Update download started.');
      }
      if (action === 'install') setStatus('Restarting to install the update.');
    } catch (error) {
      setStatus(`Update failed: ${error?.message || String(error)}`);
    } finally {
      setUpdateBusy(false);
    }
  }

  const providerRows = providerHealth?.providers || [];
  const updateState = updateStatus?.state || 'idle';
  const updatePercent = Math.max(0, Math.min(100, Number(updateStatus?.percent || 0)));
  const updateVersion = updateStatus?.availableVersion || '';
  const updateWorking = updateBusy || ['checking', 'downloading', 'installing'].includes(updateState);

  function updateActionButton() {
    if (updateState === 'downloaded') {
      return (
        <button type="button" onClick={() => runUpdateAction('install')} disabled={updateWorking}>
          <Rocket /> Restart & Install
        </button>
      );
    }

    if (updateState === 'available') {
      return (
        <button type="button" onClick={() => runUpdateAction('download')} disabled={updateWorking}>
          <Download /> {isAndroid ? 'Download APK' : `Download ${updateVersion ? `v${updateVersion}` : 'Update'}`}
        </button>
      );
    }

    if (updateState === 'downloading') {
      return (
        <button type="button" disabled>
          <Download /> Downloading {updatePercent}%
        </button>
      );
    }

    if (updateState === 'installing') {
      return (
        <button type="button" disabled>
          <RefreshCw className="spinning" /> Restarting…
        </button>
      );
    }

    if (['development', 'unavailable', 'loading'].includes(updateState)) {
      return (
        <button type="button" disabled>
          <RefreshCw /> Installed Builds Only
        </button>
      );
    }

    return (
      <button type="button" onClick={() => runUpdateAction('check')} disabled={updateWorking}>
        <RefreshCw className={updateState === 'checking' ? 'spinning' : ''} />
        {updateState === 'checking' ? 'Checking…' : 'Check for Updates'}
      </button>
    );
  }

  return (
    <section className="aboutHelpPage">
      <header className="aboutHelpHero">
        <div>
          <p>About / Help</p>
          <h1>JoeAnimeDB</h1>
          <span>Your anime library, recommendation lab, and local taste history.</span>
          <div className="aboutVersion">
            <BadgeInfo />
            <strong>{version}</strong>
            <small>{buildLabel}</small>
          </div>
        </div>
        <CircleHelp aria-hidden="true" />
      </header>

      <div className="aboutHelpGrid">
        <section className="aboutPanel howJoeAI">
          <header>
            <Bot />
            <div>
              <p>Local Anime Intelligence</p>
              <h2>How JoeAI works</h2>
            </div>
          </header>
          <p>
            JoeAI builds a taste model from your scores, favorites, rewatches, watch history,
            Anime DNA and Genome cards. It compares those signals with unseen Kitsu catalog
            titles, then explains why each recommendation fits.
          </p>
          <div className="aboutSteps">
            <span><strong>1</strong> Your library supplies taste signals.</span>
            <span><strong>2</strong> Genome evidence adds themes, tone and viewer fantasy.</span>
            <span><strong>3</strong> Your feedback improves future rankings.</span>
          </div>
          <footer>
            <HeartHandshake />
            JoeAI learning and recommendation feedback are stored with your local database.
          </footer>
        </section>

        <section className="aboutPanel providers">
          <header>
            <ServerCog />
            <div>
              <p>Metadata Credits</p>
              <h2>Powered by open providers</h2>
            </div>
          </header>
          <button type="button" onClick={() => openExternal(KITSU_URL)}>
            <span>🍥</span>
            <div>
              <strong>Kitsu</strong>
              <small>Primary anime titles, artwork, synopsis, scores and release data</small>
            </div>
            <ExternalLink />
          </button>
          <button type="button" onClick={() => openExternal(WIKIDATA_URL)}>
            <span>🌐</span>
            <div>
              <strong>Wikidata</strong>
              <small>Targeted repair for missing studios, genres and structured facts</small>
            </div>
            <ExternalLink />
          </button>
          <div className="providerCheck">
            <button type="button" onClick={testProviders} disabled={checkingProviders}>
              <CheckCircle2 />
              {checkingProviders ? 'Checking Providers…' : 'Check Provider Status'}
            </button>
            {providerRows.map((provider) => (
              <span key={provider.id} className={provider.online ? 'online' : 'offline'}>
                {provider.label}: {provider.online ? 'Online' : 'Unavailable'}
              </span>
            ))}
          </div>
        </section>

        <section className="aboutPanel backup">
          <header>
            <FolderArchive />
            <div>
              <p>Backup Location</p>
              <h2>Your data stays findable</h2>
            </div>
          </header>
          <dl>
            <div>
              <dt>Database</dt>
              <dd>{systemInfo?.database || 'JoeAnime.db in the desktop data folder'}</dd>
            </div>
            <div>
              <dt>Safety backups</dt>
              <dd>{systemInfo?.backups || 'Backups folder inside JoeAnimeDB application data'}</dd>
            </div>
          </dl>
          <div className="aboutActionGrid">
            <button type="button" onClick={() => openFolder('backups')}>
              <FolderArchive /> Open Backup Folder
            </button>
            <button type="button" onClick={() => openFolder('data')}>
              <FolderOpen /> Open Data Folder
            </button>
          </div>
          <small>
            Full JSON backups are created from Settings → Library. Restore creates a SQLite
            safety copy before replacing the current database.
          </small>
        </section>

        <section className="aboutPanel troubleshooting">
          <header>
            <Wrench />
            <div>
              <p>Troubleshooting</p>
              <h2>Useful recovery tools</h2>
            </div>
          </header>
          <div className="aboutActionList">
            <button type="button" onClick={() => openFolder('logs')}>
              <BookOpenText />
              <span><strong>Open Diagnostic Logs</strong><small>Useful when the updater or desktop process fails</small></span>
            </button>
            <button type="button" onClick={downloadSystemDiagnostics}>
              <FileJson />
              <span><strong>Export Diagnostics</strong><small>Provider, version and database health without personal notes</small></span>
            </button>
            <button type="button" onClick={copySystemDetails}>
              <Clipboard />
              <span><strong>Copy System Details</strong><small>Paste build information into a bug report</small></span>
            </button>
            <button type="button" onClick={replayTutorial}>
              <GraduationCap />
              <span><strong>Replay Tutorial</strong><small>Review importing, Library and JoeAI controls</small></span>
            </button>
          </div>
        </section>
      </div>

      <section className={`aboutUpdatePanel state-${updateState}`}>
        <div className="aboutUpdateIcon">
          <Download />
        </div>
        <div className="aboutUpdateCopy">
          <p>{isAndroid ? 'Android App Updates' : 'Desktop App Updates'}</p>
          <h2>
            {updateState === 'downloaded'
              ? `v${updateVersion || 'Next'} is ready`
              : updateState === 'available'
                ? `Update v${updateVersion || 'available'}`
                : 'Keep JoeAnimeDB current'}
          </h2>
          <span>{updateStatus?.message || 'Check GitHub for the latest JoeAnimeDB installer.'}</span>
          {updateState === 'downloading' && (
            <div
              className="aboutUpdateProgress"
              role="progressbar"
              aria-label="Update download progress"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={updatePercent}
            >
              <i style={{ width: `${updatePercent}%` }} />
            </div>
          )}
          <small>
            {isAndroid
              ? 'Android will ask you to approve the APK update. Your local library and JoeAI data remain in private app storage.'
              : 'Update installs replace application files only. Your library and JoeAI data remain in your local data folder.'}
          </small>
        </div>
        <div className="aboutUpdateActions">
          {updateActionButton()}
          <button type="button" className="secondary" onClick={() => openExternal(RELEASE_NOTES_URL)}>
            Release Notes <ExternalLink />
          </button>
        </div>
      </section>

      <section className="aboutReleaseNotes">
        <div>
          <ScrollText />
          <span>
            <strong>What changed in this release?</strong>
            <small>Read feature notes, fixes and known release details on GitHub.</small>
          </span>
        </div>
        <button type="button" onClick={() => openExternal(RELEASE_NOTES_URL)}>
          View Release Notes <ExternalLink />
        </button>
      </section>

      <section className="aboutSupportPanel">
        <div>
          <Coffee />
          <span>
            <strong>Enjoying JoeAnimeDB?</strong>
            <small>Support development, hosting, and future releases with a one-time coffee.</small>
          </span>
        </div>
        <button type="button" onClick={() => openExternal(SUPPORT_URL)}>
          Buy me a coffee <ExternalLink />
        </button>
      </section>

      {status && <p className="aboutHelpStatus" role="status">{status}</p>}
    </section>
  );
}
