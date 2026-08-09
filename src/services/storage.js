import {
  saveRollingTextExport,
  saveTextExport,
  saveTextExportAs
} from '../platform/fileExports.js';
import { APP_VERSION } from '../appVersion.js';

export const STORAGE_KEY = 'joeanime-db-4';
export const LAST_BACKUP_KEY = 'joeanime-last-backup-v1';
export const ROLLING_BACKUP_FILENAME = 'JoeAnimeDB-backup.json';

export function loadData(seed) {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : seed;
  } catch {
    return seed;
  }
}

export function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function resetData() {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

function backupPreferences() {
  const read = (key) => {
    try {
      return localStorage.getItem(key) || '';
    } catch {
      return '';
    }
  };

  return {
    theme: read('joeanime-theme') || 'neon',
    displayName: read('joeanime-display-name'),
    discoverNextPage: read('joeanime-discover-next-page'),
    onboardingVersion: read('joeanime-onboarding-version'),
    onboardingState: read('joeanime-onboarding-state-v1'),
    followingNotifications: read('joeanime-following-notifications-enabled'),
    joeAIMemoryProfile: read('joeai.memory.profile.v1'),
    joeAIMemoryJournal: read('joeai.memory.journal.v1'),
    joeAIMemoryEvents: read('joeai.memory.events.v1')
  };
}

export function buildBackupPayload(data = {}) {
  return {
    format: 'JoeAnimeDB Full Backup',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    appVersion: window.JoeAnimeDB?.version || APP_VERSION,
    database: data,
    preferences: backupPreferences()
  };
}

function backupSnapshotWeight(snapshot = {}) {
  const animeCount = Array.isArray(snapshot?.anime) ? snapshot.anime.length : 0;
  const catalogCount = Array.isArray(snapshot?.catalog) ? snapshot.catalog.length : 0;
  return (animeCount * 1000) + catalogCount;
}

async function resolveLiveBackupDatabase(data = {}) {
  const currentSnapshot = data && typeof data === 'object' ? data : {};
  const getDatabase = window.JoeAnimeDB?.database?.getDatabase;

  if (typeof getDatabase !== 'function') return currentSnapshot;

  try {
    const liveSnapshot = await getDatabase();
    if (!liveSnapshot || !Array.isArray(liveSnapshot.anime)) {
      return currentSnapshot;
    }

    // Prefer the snapshot containing the most real records. This protects
    // against a stale React seed snapshot in Settings without allowing an
    // unexpectedly empty bridge response to replace valid in-memory data.
    return backupSnapshotWeight(liveSnapshot) >= backupSnapshotWeight(currentSnapshot)
      ? liveSnapshot
      : currentSnapshot;
  } catch (error) {
    console.warn('Could not read the live database for backup; using the current app snapshot.', error);
    return currentSnapshot;
  }
}

function recordSuccessfulBackup(result, payload, mode) {
  if (!result?.ok) return null;

  const record = {
    savedAt: new Date().toISOString(),
    exportedAt: payload.exportedAt,
    mode,
    method: result.method || 'export',
    filename: result.filename || ROLLING_BACKUP_FILENAME,
    path: result.path || ''
  };

  try {
    localStorage.setItem(LAST_BACKUP_KEY, JSON.stringify(record));
  } catch {}

  window.dispatchEvent(new CustomEvent('joeanime:backup-saved', { detail: record }));
  return record;
}

export function readLastBackupRecord() {
  try {
    const saved = localStorage.getItem(LAST_BACKUP_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

export async function exportBackup(data) {
  const database = await resolveLiveBackupDatabase(data);
  const payload = buildBackupPayload(database);
  const result = await saveRollingTextExport(
    ROLLING_BACKUP_FILENAME,
    JSON.stringify(payload, null, 2),
    'application/json'
  );

  return {
    payload,
    result,
    record: recordSuccessfulBackup(result, payload, 'rolling')
  };
}

export async function exportBackupAs(data) {
  const database = await resolveLiveBackupDatabase(data);
  const payload = buildBackupPayload(database);
  const filename = `JoeAnimeDB-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const result = await saveTextExportAs(
    filename,
    JSON.stringify(payload, null, 2),
    'application/json'
  );

  return {
    payload,
    result,
    record: recordSuccessfulBackup(result, payload, 'snapshot')
  };
}

export function parseBackupText(text = '') {
  let parsed;

  try {
    parsed = JSON.parse(String(text || ''));
  } catch {
    throw new Error('That file is not valid JSON.');
  }

  const database = parsed?.database || parsed?.data || parsed;
  if (!database || !Array.isArray(database.anime)) {
    throw new Error('That file is not a JoeAnimeDB full backup.');
  }

  return {
    database,
    preferences: parsed?.preferences || {},
    exportedAt: parsed?.exportedAt || '',
    schemaVersion: Number(parsed?.schemaVersion || 1)
  };
}

export function applyBackupPreferences(preferences = {}) {
  const mappings = [
    ['theme', 'joeanime-theme'],
    ['displayName', 'joeanime-display-name'],
    ['discoverNextPage', 'joeanime-discover-next-page'],
    ['onboardingVersion', 'joeanime-onboarding-version'],
    ['onboardingState', 'joeanime-onboarding-state-v1'],
    ['followingNotifications', 'joeanime-following-notifications-enabled'],
    ['joeAIMemoryProfile', 'joeai.memory.profile.v1'],
    ['joeAIMemoryJournal', 'joeai.memory.journal.v1'],
    ['joeAIMemoryEvents', 'joeai.memory.events.v1']
  ];

  mappings.forEach(([preferenceKey, storageKey]) => {
    if (!Object.prototype.hasOwnProperty.call(preferences, preferenceKey)) return;
    const value = preferences[preferenceKey];
    try {
      if (value === undefined || value === null || value === '') {
        localStorage.removeItem(storageKey);
      } else {
        localStorage.setItem(storageKey, String(value));
      }
    } catch {}
  });
}

export function exportDiagnostics({
  data = {},
  stats = {},
  providerHealth = null,
  storageInfo = null,
  lastUpdate = null,
  metadata = {}
} = {}) {
  const anime = Array.isArray(data.anime) ? data.anime : [];
  const catalog = Array.isArray(data.catalog) ? data.catalog : [];
  const payload = {
    format: 'JoeAnimeDB Diagnostics',
    generatedAt: new Date().toISOString(),
    app: {
      version: window.JoeAnimeDB?.version || APP_VERSION,
      desktop: Boolean(window.JoeAnimeDB?.desktop),
      databaseEngine: data.engine || stats.databaseEngine || 'Local',
      userAgent: navigator.userAgent
    },
    storage: storageInfo,
    counts: {
      library: anime.length,
      catalog: catalog.length,
      favorites: anime.filter((item) => item.favorite).length,
      following: catalog.filter((item) => item.followed).length,
      metadataRepairsRemaining: Number(metadata.repairsRemaining || 0),
      missingStudios: Number(metadata.missingStudios || 0),
      missingGenres: Number(metadata.missingGenres || 0)
    },
    providers: providerHealth,
    lastUpdate
  };

  downloadJson(
    `JoeAnimeDB-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
    payload
  );

  return payload;
}

function downloadJson(filename, value) {
  saveTextExport(filename, JSON.stringify(value, null, 2), 'application/json');
}

export function exportLibraryList(data = {}) {
  const exportedAt = new Date();
  const titles = sortedAnime(data)
    .map((item) => String(item.officialTitle || item.title || '').trim())
    .filter(Boolean);

  downloadText(
    `JoeAnimeDB-library-list-${exportedAt.toISOString().slice(0, 10)}.txt`,
    [
      'JoeAnimeDB Library List',
      `Exported: ${exportedAt.toLocaleString()}`,
      `Total titles: ${titles.length}`,
      '',
      ...titles.map((title, index) => `${index + 1}. ${title}`)
    ].join('\n')
  );

  return titles.length;
}


function sortedAnime(data = {}) {
  return (Array.isArray(data?.anime) ? data.anime : [])
    .slice()
    .sort((a,b)=>(a.officialTitle||a.title||'').localeCompare((b.officialTitle||b.title||'')));
}

export function exportRankedLibraryList(data = {}) {
  const rows = sortedAnime(data).map((a,i)=>
    `${i+1}. ${a.officialTitle||a.title} | Score: ${a.joeScore ?? a.score ?? a.rating ?? "-"} | Status: ${a.status ?? "-"}`
  );
  downloadText("JoeAnimeDB-ranked-library.txt",
    ["JoeAnimeDB Ranked Library","",...rows].join("\n"));
}

export function exportLibraryCsv(data = {}) {
  const rows = [
    "Title,Score,Status,Year,Genres",
    ...sortedAnime(data).map(a=>[
      `"${(a.officialTitle||a.title||"").replace(/"/g,'""')}"`,
      a.joeScore ?? a.score ?? a.rating ?? "",
      a.status ?? "",
      a.year ?? "",
      `"${(a.genres||[]).join("; ")}"`
    ].join(","))
  ];
  downloadText("JoeAnimeDB-library.csv", rows.join("\n"));
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function integerValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function malIdFor(item = {}) {
  const value = firstDefined(
    item.malId,
    item.mal_id,
    item.myanimelistId,
    item.myAnimeListId,
    item.externalIds?.mal,
    item.externalIds?.myanimelist,
    item.ids?.mal
  );
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function xmlText(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlCdata(value = '') {
  return `<![CDATA[${String(value).replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

function malDate(value) {
  if (!value) return '0000-00-00';

  if (typeof value === 'object') {
    const year = integerValue(value.year);
    const month = integerValue(value.month);
    const day = integerValue(value.day);
    if (year > 0) {
      return [
        String(year).padStart(4, '0'),
        String(month || 1).padStart(2, '0'),
        String(day || 1).padStart(2, '0')
      ].join('-');
    }
  }

  const raw = String(value).trim();
  const direct = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (direct) {
    return `${direct[1]}-${direct[2].padStart(2, '0')}-${direct[3].padStart(2, '0')}`;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? '0000-00-00'
    : parsed.toISOString().slice(0, 10);
}

function malStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

  if (['completed', 'complete', 'finished'].includes(normalized)) return 'Completed';
  if (['watching', 'current', 'rewatching', 're watching'].includes(normalized)) return 'Watching';
  if (['on hold', 'onhold', 'paused'].includes(normalized)) return 'On-Hold';
  if (['dropped', 'drop'].includes(normalized)) return 'Dropped';
  if (['plan to watch', 'planned', 'planning', 'plan'].includes(normalized)) return 'Plan to Watch';
  return 'Plan to Watch';
}

function malSeriesType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'tv' || normalized.includes('television')) return 'TV';
  if (normalized === 'movie' || normalized.includes('film')) return 'Movie';
  if (normalized === 'ova') return 'OVA';
  if (normalized === 'ona') return 'ONA';
  if (normalized === 'special') return 'Special';
  if (normalized === 'music') return 'Music';
  return 'Unknown';
}

function malPriority(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === '2' || normalized === 'high') return 2;
  if (normalized === '1' || normalized === 'medium' || normalized === 'med') return 1;
  return 0;
}

function listTags(item = {}) {
  const tags = firstDefined(item.tags, item.personalTags, item.userTags, []);
  if (Array.isArray(tags)) {
    return tags
      .map((tag) => typeof tag === 'string' ? tag : tag?.name)
      .filter(Boolean)
      .join(', ');
  }
  return String(tags || '');
}

function exportScore(item = {}) {
  const raw = Number(firstDefined(
    item.joeScore,
    item.score,
    item.finalScore,
    item.rating,
    item.personalScore,
    0
  ));
  if (!Number.isFinite(raw) || raw <= 0) return { from: 0, to: 0, rounded: false };
  const clamped = Math.min(10, Math.max(1, raw));
  const rounded = Math.round(clamped);
  return { from: raw, to: rounded, rounded: rounded !== raw };
}

function watchedEpisodes(item = {}, status, totalEpisodes) {
  const explicit = firstDefined(
    item.watchedEpisodes,
    item.episodesWatched,
    item.episodeProgress,
    item.progress,
    item.watchedEpisodeCount,
    item.currentEpisode
  );
  if (explicit !== undefined) return integerValue(explicit);
  return status === 'Completed' ? totalEpisodes : 0;
}

function malAnimeXml(item, malId, scoreInfo) {
  const title = String(item.officialTitle || item.title || '').trim();
  const status = malStatus(firstDefined(item.status, item.watchStatus));
  const totalEpisodes = integerValue(firstDefined(item.episodeCount, item.episodes, item.totalEpisodes));
  const progress = watchedEpisodes(item, status, totalEpisodes);
  const rewatches = integerValue(firstDefined(item.rewatches, item.rewatchCount, item.timesRewatched));
  const isRewatching = Boolean(item.rewatching) || /rewatch/i.test(String(item.status || ''));
  const startDate = malDate(firstDefined(item.startDate, item.startedAt, item.watchStartDate));
  const finishDate = malDate(firstDefined(
    item.finishDate,
    item.completedDate,
    item.completedAt,
    item.watchEndDate
  ));
  const notes = firstDefined(item.notes, item.personalNotes, '');

  return [
    '  <anime>',
    `    <series_animedb_id>${malId}</series_animedb_id>`,
    `    <series_title>${xmlCdata(title)}</series_title>`,
    `    <series_type>${malSeriesType(firstDefined(item.type, item.subtype, item.format))}</series_type>`,
    `    <series_episodes>${totalEpisodes}</series_episodes>`,
    '    <my_id>0</my_id>',
    `    <my_watched_episodes>${progress}</my_watched_episodes>`,
    `    <my_start_date>${xmlText(startDate)}</my_start_date>`,
    `    <my_finish_date>${xmlText(finishDate)}</my_finish_date>`,
    `    <my_score>${scoreInfo.to}</my_score>`,
    `    <my_status>${status}</my_status>`,
    `    <my_comments>${xmlCdata(notes)}</my_comments>`,
    `    <my_times_watched>${rewatches}</my_times_watched>`,
    '    <my_rewatch_value>0</my_rewatch_value>',
    `    <my_priority>${malPriority(item.priority)}</my_priority>`,
    `    <my_tags>${xmlCdata(listTags(item))}</my_tags>`,
    `    <my_rewatching>${isRewatching ? 1 : 0}</my_rewatching>`,
    `    <my_rewatching_ep>${isRewatching ? progress : 0}</my_rewatching_ep>`,
    '    <my_discuss>1</my_discuss>',
    '    <my_sns>default</my_sns>',
    '    <update_on_import>1</update_on_import>',
    '  </anime>'
  ].join('\n');
}

export function buildMalXmlExport(data = {}) {
  const exported = [];
  const unresolved = [];
  const roundedScores = [];
  const animeXml = [];

  sortedAnime(data).forEach((item) => {
    const title = String(item.officialTitle || item.title || 'Untitled anime').trim();
    const malId = malIdFor(item);

    if (!malId) {
      unresolved.push({
        title,
        reason: 'A MyAnimeList ID is required for MAL and AniList list imports.',
        anilistId: firstDefined(item.anilistId, item.anilist_id, item.externalIds?.anilist),
        kitsuId: firstDefined(item.kitsuId, item.kitsu_id, item.externalIds?.kitsu)
      });
      return;
    }

    const scoreInfo = exportScore(item);
    if (scoreInfo.rounded) {
      roundedScores.push({ title, from: scoreInfo.from, to: scoreInfo.to });
    }

    exported.push({ title, malId });
    animeXml.push(malAnimeXml(item, malId, scoreInfo));
  });

  const completed = exported.filter(({ malId }) => {
    const item = sortedAnime(data).find((row) => malIdFor(row) === malId);
    return malStatus(firstDefined(item?.status, item?.watchStatus)) === 'Completed';
  }).length;
  const watching = exported.filter(({ malId }) => {
    const item = sortedAnime(data).find((row) => malIdFor(row) === malId);
    return malStatus(firstDefined(item?.status, item?.watchStatus)) === 'Watching';
  }).length;
  const onHold = exported.filter(({ malId }) => {
    const item = sortedAnime(data).find((row) => malIdFor(row) === malId);
    return malStatus(firstDefined(item?.status, item?.watchStatus)) === 'On-Hold';
  }).length;
  const dropped = exported.filter(({ malId }) => {
    const item = sortedAnime(data).find((row) => malIdFor(row) === malId);
    return malStatus(firstDefined(item?.status, item?.watchStatus)) === 'Dropped';
  }).length;
  const planned = Math.max(0, exported.length - completed - watching - onHold - dropped);

  const xml = [
    '<?xml version="1.0" encoding="UTF-8" ?>',
    '<myanimelist>',
    '  <myinfo>',
    '    <user_id>0</user_id>',
    '    <user_name>JoeAnimeDB User</user_name>',
    '    <user_export_type>1</user_export_type>',
    `    <user_total_anime>${exported.length}</user_total_anime>`,
    `    <user_total_watching>${watching}</user_total_watching>`,
    `    <user_total_completed>${completed}</user_total_completed>`,
    `    <user_total_onhold>${onHold}</user_total_onhold>`,
    `    <user_total_dropped>${dropped}</user_total_dropped>`,
    `    <user_total_plantowatch>${planned}</user_total_plantowatch>`,
    '  </myinfo>',
    ...animeXml,
    '</myanimelist>',
    ''
  ].join('\n');

  return { xml, exported, unresolved, roundedScores };
}

export function exportMalCompatibleXml(data = {}, target = 'mal') {
  const report = buildMalXmlExport(data);
  if (!report.exported.length) return report;

  const destination = String(target).toLowerCase() === 'anilist' ? 'AniList' : 'MyAnimeList';
  const date = new Date().toISOString().slice(0, 10);
  saveTextExport(
    `JoeAnimeDB-${destination}-export-${date}.xml`,
    report.xml,
    'application/xml'
  );
  return report;
}

function downloadText(filename, text){
  saveTextExport(filename, text, 'text/plain');
}
