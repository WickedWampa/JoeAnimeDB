export const STORAGE_KEY = 'joeanime-db-4';

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
    appVersion: window.JoeAnimeDB?.version || data?.version || '5.0',
    database: data,
    preferences: backupPreferences()
  };
}

export function exportBackup(data) {
  const payload = buildBackupPayload(data);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `JoeAnimeDB-5-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);

  return payload;
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
      version: window.JoeAnimeDB?.version || data.version || '5.0',
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
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: 'application/json;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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

function downloadText(filename, text){
  const blob=new Blob([text],{type:"text/plain;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
