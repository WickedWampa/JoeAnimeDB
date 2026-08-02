import { Browser } from '@capacitor/browser';

const RELEASES_API_URL = 'https://api.github.com/repos/WickedWampa/JoeAnimeDB/releases?per_page=20';
const RELEASES_PAGE_URL = 'https://github.com/WickedWampa/JoeAnimeDB/releases';
const UPDATE_CHECK_DELAY_MS = 15 * 1000;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function cleanVersion(value = '') {
  return String(value || '').trim().replace(/^v/i, '');
}

function versionParts(value = '') {
  const [main = '0', prerelease = ''] = cleanVersion(value).split('-', 2);
  return {
    main: main.split('.').map((part) => Number.parseInt(part, 10) || 0),
    prerelease: prerelease
      ? prerelease.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part.toLowerCase()))
      : []
  };
}

export function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  const width = Math.max(a.main.length, b.main.length);

  for (let index = 0; index < width; index += 1) {
    const difference = (a.main[index] || 0) - (b.main[index] || 0);
    if (difference) return difference > 0 ? 1 : -1;
  }

  if (!a.prerelease.length && !b.prerelease.length) return 0;
  if (!a.prerelease.length) return 1;
  if (!b.prerelease.length) return -1;

  const prereleaseWidth = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < prereleaseWidth; index += 1) {
    const aPart = a.prerelease[index];
    const bPart = b.prerelease[index];
    if (aPart === undefined) return -1;
    if (bPart === undefined) return 1;
    if (aPart === bPart) continue;
    if (typeof aPart === 'number' && typeof bPart === 'number') return aPart > bPart ? 1 : -1;
    if (typeof aPart === 'number') return -1;
    if (typeof bPart === 'number') return 1;
    return String(aPart).localeCompare(String(bPart)) > 0 ? 1 : -1;
  }

  return 0;
}

function releaseVersion(release = {}) {
  return cleanVersion(release.tag_name || release.name || '');
}

function apkAsset(release = {}) {
  return (release.assets || []).find((asset) => /\.apk$/i.test(asset?.name || '')) || null;
}

function publicRelease(release = {}) {
  const asset = apkAsset(release);
  return {
    version: releaseVersion(release),
    releaseName: release.name || release.tag_name || '',
    releaseDate: release.published_at || release.created_at || '',
    releaseNotes: String(release.body || '').slice(0, 4000),
    releaseUrl: release.html_url || RELEASES_PAGE_URL,
    apkName: asset?.name || '',
    apkUrl: asset?.browser_download_url || ''
  };
}

export function createMobileUpdateManager({ currentVersion }) {
  const listeners = new Set();
  let startupTimer = null;
  let intervalTimer = null;
  let status = {
    state: 'idle',
    platform: 'android',
    currentVersion: cleanVersion(currentVersion),
    availableVersion: '',
    percent: 0,
    message: 'Ready to check for Android updates.',
    checkedAt: ''
  };

  function emit(nextState, patch = {}) {
    status = {
      ...status,
      ...patch,
      state: nextState,
      platform: 'android',
      currentVersion: cleanVersion(currentVersion)
    };
    for (const listener of listeners) listener({ ...status });
    return { ...status };
  }

  async function check({ automatic = false } = {}) {
    if (status.state === 'checking') return { ok: true, status: { ...status } };

    emit('checking', {
      message: automatic
        ? 'Checking for Android updates in the background…'
        : 'Checking GitHub for a newer Android build…',
      percent: 0
    });

    try {
      const response = await fetch(RELEASES_API_URL, {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);

      const releases = await response.json();
      const update = (Array.isArray(releases) ? releases : [])
        .filter((release) => !release?.draft && apkAsset(release))
        .map(publicRelease)
        .filter((release) => release.version && compareVersions(release.version, currentVersion) > 0)
        .sort((left, right) => compareVersions(right.version, left.version))[0];

      const checkedAt = new Date().toISOString();
      if (!update) {
        return {
          ok: true,
          status: emit('up-to-date', {
            availableVersion: '',
            apkName: '',
            apkUrl: '',
            releaseUrl: RELEASES_PAGE_URL,
            message: `JoeAnimeDB v${cleanVersion(currentVersion)} is up to date on Android.`,
            checkedAt,
            percent: 0
          })
        };
      }

      return {
        ok: true,
        status: emit('available', {
          ...update,
          availableVersion: update.version,
          message: `JoeAnimeDB v${update.version} is available for Android.`,
          checkedAt,
          percent: 0
        })
      };
    } catch (error) {
      const message = error?.message || String(error);
      return {
        ok: false,
        error: message,
        status: emit('error', {
          message: `Android update check failed: ${message}`,
          checkedAt: new Date().toISOString()
        })
      };
    }
  }

  async function download() {
    if (!status.apkUrl || !status.availableVersion) {
      return { ok: false, error: 'No Android APK update is available.', status: { ...status } };
    }

    try {
      await Browser.open({ url: status.apkUrl });
      return {
        ok: true,
        status: emit('available', {
          message: `APK download opened for v${status.availableVersion}. After it downloads, tap the APK and approve the Android update.`
        })
      };
    } catch (error) {
      const message = error?.message || String(error);
      return {
        ok: false,
        error: message,
        status: emit('error', { message: `Could not open the APK download: ${message}` })
      };
    }
  }

  function onStatus(listener) {
    if (typeof listener !== 'function') return () => undefined;
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function start() {
    if (startupTimer || intervalTimer) return;
    startupTimer = window.setTimeout(() => {
      startupTimer = null;
      void check({ automatic: true });
    }, UPDATE_CHECK_DELAY_MS);
    intervalTimer = window.setInterval(() => void check({ automatic: true }), UPDATE_CHECK_INTERVAL_MS);
  }

  function stop() {
    if (startupTimer) window.clearTimeout(startupTimer);
    if (intervalTimer) window.clearInterval(intervalTimer);
    startupTimer = null;
    intervalTimer = null;
  }

  return {
    getStatus: async () => ({ ...status }),
    check: () => check(),
    download,
    install: download,
    onStatus,
    start,
    stop
  };
}
