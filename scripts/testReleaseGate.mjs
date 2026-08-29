import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const packageMetadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

function check(name, operation) {
  checks.push({ name, operation });
}

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }

  clear() {
    this.values.clear();
  }
}

globalThis.localStorage = new MemoryStorage();
globalThis.window = {
  JoeAnimeDB: { version: packageMetadata.version },
  dispatchEvent() {}
};
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { language: 'en-US', userAgent: 'JoeAnimeDB release gate' }
});
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};

const storage = await import('../src/services/storage.js');
const importer = await import('../src/services/libraryListImporter.js');
const safety = await import('../src/services/contentSafety.js');
const onboarding = await import('../src/services/onboardingState.js');
const viteTestServer = await createViteServer({
  root,
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true }
});
const relationships = await viteTestServer.ssrLoadModule('/src/services/kitsuRelationshipService.js');
const animeImporter = await viteTestServer.ssrLoadModule('/src/services/animeImporter.js');
const titleResolver = await viteTestServer.ssrLoadModule('/src/services/titleResolver.js');
const homeSelector = await viteTestServer.ssrLoadModule('/src/services/homeDecisionSelector.js');
const homeDecisionData = await viteTestServer.ssrLoadModule('/src/hooks/useHomeDecisionData.js');
const recommendations = await viteTestServer.ssrLoadModule('/src/engine/recommendationEngine.js');
const quickPicks = await viteTestServer.ssrLoadModule('/src/services/homeQuickPick.js');
const startupPerformance = await viteTestServer.ssrLoadModule('/src/services/startupPerformance.js');
const libraryHook = await viteTestServer.ssrLoadModule('/src/hooks/useAnimeLibrary.js');
const titleIdentity = await viteTestServer.ssrLoadModule('/src/services/titleIdentity.js');
const libraryLinkageRepair = await viteTestServer.ssrLoadModule('/src/services/libraryKitsuLinkageRepair.js');
const libraryMalLinkageRepair = await viteTestServer.ssrLoadModule('/src/services/libraryMalLinkageRepair.js');
const catalogService = await viteTestServer.ssrLoadModule('/src/services/catalogService.js');
const malKitsuMappingService = await viteTestServer.ssrLoadModule('/src/services/malKitsuMappingService.js');
const discoverServicePool = await viteTestServer.ssrLoadModule('/src/services/discoverServicePool.js');
const watchmodeService = await viteTestServer.ssrLoadModule('/src/services/watchmodeService.js');
const kitsuStreamingService = await viteTestServer.ssrLoadModule('/src/services/kitsuStreamingService.js');
const streamingAvailabilityService = await viteTestServer.ssrLoadModule('/src/services/streamingAvailabilityService.js');
const watchmodeCatalogIndexer = await viteTestServer.ssrLoadModule('/src/services/watchmodeCatalogIndexer.js');
const watchmodeSharedCacheDiscovery = await viteTestServer.ssrLoadModule('/src/services/watchmodeSharedCacheDiscovery.js');
const watchmodeProxy = await viteTestServer.ssrLoadModule('/functions/api/watchmode.js');

check('local persistence round trip and corrupt-data fallback', () => {
  localStorage.clear();
  const seed = { anime: [{ id: 'seed' }] };
  const saved = { anime: [{ id: 'bleach', title: 'Bleach', joeScore: 9.9 }] };
  storage.saveData(saved);
  assert.deepEqual(storage.loadData(seed), saved);

  localStorage.setItem(storage.STORAGE_KEY, '{not valid json');
  assert.deepEqual(storage.loadData(seed), seed);
});

check('Beta 22 onboarding update reaches existing users exactly once', async () => {
  localStorage.clear();
  localStorage.setItem(onboarding.ONBOARDING_STATE_KEY, JSON.stringify({
    version: 1,
    status: 'completed',
    step: 4,
    dismissedTips: ['library']
  }));

  const upgraded = onboarding.readOnboardingState();
  assert.equal(upgraded.version, 2);
  assert.equal(upgraded.status, 'in-progress');
  assert.equal(upgraded.step, 1);
  assert.equal(upgraded.source, 'beta22-update');

  onboarding.finishOnboarding(upgraded);
  const completed = onboarding.readOnboardingState();
  assert.equal(completed.status, 'completed');
  assert.equal(completed.version, 2);
  assert.ok(completed.dismissedTips.includes('dashboard'));

  const onboardingSource = await source('src/components/FirstTimeOnboarding.jsx');
  assert.match(onboardingSource, /My streaming services/);
  assert.match(onboardingSource, /What is new on Home/);
  assert.match(onboardingSource, /Bring your library/);
  assert.match(onboardingSource, /MyAnimeList/);
  assert.match(onboardingSource, /AniList/);
  assert.match(onboardingSource, /TXT or CSV/);
  assert.match(onboardingSource, /parseLibraryImport/);
  assert.match(onboardingSource, /requireSafeIdentity: true/);
  assert.match(onboardingSource, /joeanime-library-import-review-v1/);
  assert.match(onboardingSource, /updateOnly \? 4 : 2/);
  assert.match(onboardingSource, /saveStreamingApps/);
  localStorage.clear();
});

check('full backup creation, parse, and preference restore', () => {
  localStorage.clear();
  localStorage.setItem('joeanime-theme', 'inferno');
  localStorage.setItem('joeanime-display-name', 'Joe');
  localStorage.setItem('joeanime-discover-next-page', '4');

  const database = {
    anime: [{ id: 'bleach', title: 'Bleach' }],
    catalog: [{ id: 'one-piece', title: 'One Piece' }]
  };
  const payload = storage.buildBackupPayload(database);
  const restored = storage.parseBackupText(JSON.stringify(payload));

  assert.equal(payload.format, 'JoeAnimeDB Full Backup');
  assert.equal(payload.schemaVersion, 2);
  assert.equal(payload.preferences.theme, 'inferno');
  assert.deepEqual(restored.database, database);
  assert.equal(restored.preferences.discoverNextPage, '4');

  storage.applyBackupPreferences({
    theme: 'sakura',
    displayName: '',
    discoverNextPage: '8'
  });
  assert.equal(localStorage.getItem('joeanime-theme'), 'sakura');
  assert.equal(localStorage.getItem('joeanime-display-name'), null);
  assert.equal(localStorage.getItem('joeanime-discover-next-page'), '8');

  assert.throws(() => storage.parseBackupText('not-json'), /not valid JSON/i);
  assert.throws(() => storage.parseBackupText('{"hello":"world"}'), /not a JoeAnimeDB full backup/i);
});

check('MAL XML export and import preserve supported personal data', () => {
  const source = {
    anime: [
      {
        id: 'bleach',
        title: 'Bleach',
        malId: 269,
        status: 'Completed',
        episodeCount: 366,
        watchedEpisodes: 366,
        joeScore: 9.7,
        rewatches: 2,
        startDate: '2024-01-02',
        completedDate: '2024-04-03',
        notes: 'Still rules.',
        userTags: ['shonen', 'favorite']
      },
      {
        id: 'frieren',
        title: 'Frieren: Beyond Journeyâ€™s End',
        malId: 52991,
        status: 'Watching',
        episodeCount: 28,
        watchProgress: 12,
        rating: 8.4
      },
      { id: 'local-only', title: 'Local Only', status: 'Plan to Watch' }
    ]
  };

  const report = storage.buildMalXmlExport(source);
  assert.equal(report.exported.length, 2);
  assert.equal(report.unresolved.length, 1);
  assert.equal(report.roundedScores.length, 2);
  assert.match(report.xml, /<user_total_anime>2<\/user_total_anime>/);

  const rows = importer.parseLibraryImport(report.xml, 'JoeAnimeDB-MAL.xml');
  assert.equal(rows.length, 2);
  const bleach = rows.find((row) => row.malId === 269);
  assert.equal(bleach.status, 'Completed');
  assert.equal(bleach.episodesWatched, 366);
  assert.equal(bleach.rewatches, 2);
  assert.equal(bleach.score, 10);
  assert.equal(bleach.startedAt, '2024-01-02');
  assert.equal(bleach.completedAt, '2024-04-03');
});

check('MAL import only persists high-confidence Kitsu identities', () => {
  const malRow = {
    title: 'Example Show',
    requestedTitle: 'Example Show',
    malId: 70001,
    status: 'Watching',
    score: 9.4,
    watchProgress: 7,
    episodesWatched: 7,
    rewatches: 2,
    notes: 'Imported note',
    userTags: ['favorite'],
    startedAt: '2026-01-02',
    sourceName: 'MyAnimeList XML'
  };
  const personal = importer.importedPersonalData(malRow);

  const highResolution = titleResolver.resolveAnimeTitleCandidates({
    query: malRow.title,
    candidates: [{ id: 'kitsu-501', kitsuId: '501', title: 'Example Show', type: 'TV', year: 2026 }]
  });
  const high = animeImporter.prepareSafeImportedCandidate({
    title: malRow.title,
    status: malRow.status,
    titleResolution: highResolution
  });
  const highRecord = { ...high.candidate, ...personal };
  assert.equal(high.identityDecision.safe, true);
  assert.equal(highRecord.malId, 70001);
  assert.equal(highRecord.kitsuId, '501');
  assert.equal(highRecord.joeScore, 9.4);
  assert.equal(highRecord.status, 'Watching');
  assert.equal(highRecord.watchProgress, 7);
  assert.equal(highRecord.rewatches, 2);
  assert.equal(highRecord.notes, 'Imported note');

  const ambiguousResolution = titleResolver.resolveAnimeTitleCandidates({
    query: malRow.title,
    candidates: [
      { id: 'kitsu-501', kitsuId: '501', title: 'Example Show', type: 'TV', year: 2026 },
      { id: 'kitsu-502', kitsuId: '502', title: 'Example Show', type: 'TV', year: 2026 }
    ]
  });
  const ambiguous = animeImporter.prepareSafeImportedCandidate({
    title: malRow.title,
    status: malRow.status,
    titleResolution: ambiguousResolution
  });
  const ambiguousRecord = { ...ambiguous.candidate, ...personal };
  assert.equal(ambiguous.identityDecision.needsReview, true);
  assert.equal(ambiguousRecord.kitsuId, undefined);
  assert.equal(ambiguousRecord.malId, 70001);
  assert.equal(ambiguousRecord.metadataNeedsReview, true);
  assert.equal(ambiguousRecord.identityNeedsReview, true);
  assert.equal(ambiguousRecord.watchProgress, 7);

  const noMatchResolution = titleResolver.resolveAnimeTitleCandidates({
    query: malRow.title,
    candidates: []
  });
  const noMatch = animeImporter.prepareSafeImportedCandidate({
    title: malRow.title,
    status: malRow.status,
    titleResolution: noMatchResolution
  });
  const noMatchRecord = { ...noMatch.candidate, ...personal };
  assert.equal(noMatch.identityDecision.unresolved, true);
  assert.equal(noMatchRecord.kitsuId, undefined);
  assert.equal(noMatchRecord.malId, 70001);
  assert.equal(noMatchRecord.status, 'Watching');
});

check('existing MAL imports safely backfill identity without replacing user data', () => {
  const existing = {
    id: 'legacy-example',
    title: 'Example Show',
    status: 'Completed',
    joeScore: 9.8,
    watchProgress: 24,
    rewatches: 3,
    favorite: true,
    notes: 'Keep this',
    userTags: ['legacy'],
    startedAt: '2024-01-01',
    finalRank: 4
  };
  const highResolution = titleResolver.resolveAnimeTitleCandidates({
    query: existing.title,
    candidates: [{ id: 'kitsu-601', kitsuId: '601', title: 'Example Show' }]
  });
  const linked = animeImporter.applySafeKitsuIdentity(existing, {
    titleResolution: highResolution
  }, 'test');
  assert.equal(linked.kitsuId, '601');
  for (const field of ['id', 'title', 'status', 'joeScore', 'watchProgress', 'rewatches', 'favorite', 'notes', 'startedAt', 'finalRank']) {
    assert.deepEqual(linked[field], existing[field]);
  }
  assert.deepEqual(linked.userTags, existing.userTags);

  const ambiguousResolution = titleResolver.resolveAnimeTitleCandidates({
    query: existing.title,
    candidates: [
      { id: 'kitsu-601', kitsuId: '601', title: 'Example Show' },
      { id: 'kitsu-602', kitsuId: '602', title: 'Example Show' }
    ]
  });
  const unchangedIdentity = animeImporter.applySafeKitsuIdentity(existing, {
    titleResolution: ambiguousResolution
  }, 'test');
  assert.equal(unchangedIdentity.kitsuId, undefined);
  assert.equal(unchangedIdentity.title, 'Example Show');
  assert.equal(unchangedIdentity.metadataNeedsReview, true);
  assert.equal(unchangedIdentity.joeScore, 9.8);
  assert.equal(unchangedIdentity.watchProgress, 24);
});

check('MAL import and metadata repair paths enforce identity review safety', async () => {
  const [settingsSource, detailSource, libraryHookSource, homeHookSource, importerSource] = await Promise.all([
    source('src/pages/PlaceholderPages.jsx'),
    source('src/components/DetailModal.jsx'),
    source('src/hooks/useAnimeLibrary.js'),
    source('src/hooks/useHomeDecisionData.js'),
    source('src/services/animeImporter.js')
  ]);

  assert.match(settingsSource, /requireSafeIdentity:\s*true/);
  assert.match(settingsSource, /resolveSafeKitsuIdentity\(merged\)/);
  assert.match(settingsSource, /!item\.identityNeedsReview[\s\S]*?needsWikidataRepair\(item\)/);
  assert.match(detailSource, /if \(anime\.identityNeedsReview\)/);
  assert.match(libraryHookSource, /if \(item\.identityNeedsReview\) return false/);
  assert.match(homeHookSource, /onLinkageRepairs:[\s\S]*?applyVerifiedCatalogLinkageRepair/);
  assert.match(importerSource, /\(!requireSafeIdentity \|\| identityDecision\.safe\)/);
  assert.match(importerSource, /if \(!\(requireSafeIdentity && identityDecision\.needsReview\)\)/);
});

check('AniList JSON, CSV, and text import normalization', () => {
  const aniListRows = importer.parseLibraryImport(JSON.stringify({
    scoreFormat: 'POINT_100',
    lists: [{
      entries: [{
        status: 'CURRENT',
        score: 87,
        progress: 7,
        repeat: 1,
        media: {
          id: 154587,
          idMal: 52991,
          title: { english: 'Frieren: Beyond Journeyâ€™s End' }
        }
      }]
    }]
  }), 'anilist.json');
  assert.equal(aniListRows.length, 1);
  assert.equal(aniListRows[0].score, 8.7);
  assert.equal(aniListRows[0].episodesWatched, 7);
  assert.equal(aniListRows[0].anilistId, 154587);
  assert.equal(aniListRows[0].malId, 52991);

  const csvRows = importer.parseLibraryImport(
    'Title,Score,Status,MAL ID,Progress\n"Bleach",9.9,Completed,269,366',
    'library.csv'
  );
  assert.equal(csvRows.length, 1);
  assert.equal(csvRows[0].malId, 269);
  assert.equal(csvRows[0].watchProgress, 366);

  const textRows = importer.parseLibraryImport(
    'JoeAnimeDB Ranked Library\n\n1. One Piece | Score: 9.8 | Status: Watching',
    'ranked.txt'
  );
  assert.equal(textRows.length, 1);
  assert.equal(textRows[0].title, 'One Piece');
  assert.equal(textRows[0].status, 'Watching');
});

check('content filtering enforces each safety mode', () => {
  const titles = [
    { id: 'g', ageRating: 'G' },
    { id: 'pg', ageRating: 'PG-13' },
    { id: 'r', ageRating: 'R' },
    { id: 'explicit', ageRating: 'R18+' },
    { id: 'nsfw', ageRating: 'PG', nsfw: true },
    { id: 'unknown' }
  ];

  assert.deepEqual(safety.filterContentBySafety(titles, 'kid-safe').map((item) => item.id), ['g', 'pg']);
  assert.deepEqual(safety.filterContentBySafety(titles, 'teen').map((item) => item.id), ['g', 'pg', 'unknown']);
  assert.deepEqual(safety.filterContentBySafety(titles, 'mature').map((item) => item.id), ['g', 'pg', 'r', 'unknown']);
  assert.equal(safety.filterContentBySafety(titles, 'unrestricted').length, titles.length);
});

check('Home continuation shelves classify, preserve artwork, dedupe, and exclude library titles', () => {
  const now = Date.parse('2026-08-22T12:00:00Z');
  const library = [
    { id: 'aot-2', kitsuId: '20958', title: 'Attack on Titan Season 2', status: 'Completed' },
    { id: 'owned', kitsuId: '999', title: 'Already Owned', status: 'Plan to Watch' }
  ];
  const raw = [
    {
      id: 'kitsu-aot-3', kitsuId: '11887', title: 'Attack on Titan Season 3', cover: 'https://img.example/aot3.jpg',
      continuationAiringStatus: 'finished', continuationStartDate: '2018-07-23',
      returningFromTitle: 'Attack on Titan Season 2', returningFromStatus: 'completed'
    },
    {
      id: 'kitsu-aot-3-duplicate', kitsuId: '11887', title: 'Attack on Titan Season 3',
      continuationAiringStatus: 'finished', continuationStartDate: '2018-07-23',
      returningFromTitle: 'Attack on Titan Season 2', returningFromStatus: 'completed'
    },
    {
      id: 'current', kitsuId: '200', title: 'Current Continuation',
      continuationAiringStatus: 'current', continuationStartDate: '2026-07-01',
      returningFromTitle: 'Current Source', returningFromStatus: 'watching'
    },
    {
      id: 'future', kitsuId: '201', title: 'Upcoming Continuation',
      continuationAiringStatus: 'upcoming', continuationStartDate: '2026-10-01',
      returningFromTitle: 'Future Source', returningFromStatus: 'completed'
    },
    {
      id: 'owned-candidate', kitsuId: '999', title: 'Already Owned',
      continuationAiringStatus: 'finished', continuationStartDate: '2020-01-01',
      returningFromTitle: 'Owned Source', returningFromStatus: 'completed'
    }
  ];
  const catalog = [{ kitsuId: '11887', title: 'Attack on Titan Season 3', cover: '' }];
  const finalized = relationships.finalizeContinuationTitles(raw, library, catalog, { now });
  const shelves = relationships.partitionContinuations(finalized);

  assert.deepEqual(shelves.returning.map((item) => item.title), ['Upcoming Continuation', 'Current Continuation']);
  assert.deepEqual(shelves.missedSequels.map((item) => item.title), ['Attack on Titan Season 3']);
  assert.equal(shelves.missedSequels[0].cover, 'https://img.example/aot3.jpg');
  assert.equal(finalized.filter((item) => item.kitsuId === '11887').length, 1);
  assert.equal(finalized.some((item) => item.kitsuId === '999'), false);
});

check('continuation sources include linked titles beyond the old cutoff and recover exact catalog IDs', () => {
  const library = Array.from({ length: 30 }, (_, index) => ({
    id: `source-${index + 1}`,
    title: `Source ${index + 1}`,
    status: index % 2 ? 'Completed' : 'Watching',
    kitsuId: String(index + 1),
    joeScore: 10 - (index / 100)
  }));
  library.push({ id: 'recovered', title: 'Catalog Recovery Match', status: 'Completed' });
  const catalog = [{ id: 'catalog-kitsu-9001', kitsuId: '9001', title: 'Catalog Recovery Match' }];
  const sources = relationships.continuationSourceCandidates(library, catalog);

  assert.equal(sources.length, 31);
  assert.ok(sources.some((item) => item.kitsuId === '30'));
  assert.equal(sources.find((item) => item.id === 'recovered')?.kitsuId, '9001');
  assert.equal(sources.find((item) => item.id === 'recovered')?.relationshipKitsuIdRecovered, true);
});

check('verified catalog self-healing persists only Kitsu identity and preserves personal data', () => {
  const libraryItem = {
    id: 'legacy-tybw',
    malId: '41467',
    title: 'Bleach TYBW',
    status: 'Completed',
    joeScore: 9.9,
    watchProgress: 13,
    rewatches: 2,
    favorite: true,
    notes: 'Do not overwrite',
    userTags: ['peak'],
    startedAt: '2025-01-01',
    completedAt: '2025-02-01',
    finalRank: 2
  };
  const catalog = [
    { id: 'catalog-original', malId: '269', kitsuId: '12', title: 'Bleach', year: 2004, type: 'TV' },
    {
      id: 'catalog-tybw', malId: '41467', kitsuId: '44511',
      title: 'BLEACH: Thousand-Year Blood War', year: 2022, type: 'TV'
    }
  ];

  const repairs = relationships.buildVerifiedCatalogLinkageRepairs([libraryItem], catalog);
  assert.equal(repairs.length, 1);
  assert.equal(repairs[0].kitsuId, '44511');

  const repaired = relationships.applyVerifiedCatalogLinkageRepair(libraryItem, repairs[0]);
  assert.equal(repaired.kitsuId, '44511');
  for (const field of ['id', 'malId', 'title', 'status', 'joeScore', 'watchProgress', 'rewatches', 'favorite', 'notes', 'startedAt', 'completedAt', 'finalRank']) {
    assert.deepEqual(repaired[field], libraryItem[field]);
  }
  assert.deepEqual(repaired.userTags, libraryItem.userTags);

  const ambiguousCatalog = [
    { id: 'catalog-a', kitsuId: '700', title: 'Same Title' },
    { id: 'catalog-b', kitsuId: '701', title: 'Same Title' }
  ];
  const ambiguousLibrary = { id: 'ambiguous', title: 'Same Title', status: 'Completed', joeScore: 8.8 };
  assert.equal(
    relationships.buildVerifiedCatalogLinkageRepairs([ambiguousLibrary], ambiguousCatalog).length,
    0
  );
  assert.equal(
    relationships.buildVerifiedCatalogLinkageRepairs([
      { ...ambiguousLibrary, identityNeedsReview: true }
    ], [{ id: 'catalog-only', kitsuId: '700', title: 'Same Title' }]).length,
    0
  );
});

check('Update Database safely repairs Kitsu linkage across all statuses without touching user data', async () => {
  const personal = {
    joeScore: 9.6,
    watchProgress: 7,
    rewatches: 3,
    favorite: true,
    notes: 'Personal note',
    userTags: ['favorite', 'dub'],
    startedAt: '2025-01-02',
    completedAt: '2025-02-03',
    finalRank: 4
  };
  const library = [
    { id: 'linked', title: 'Already Linked', status: 'Watching', kitsuId: '1', ...personal },
    { id: 'review', title: 'Existing Review', status: 'Completed', identityNeedsReview: true, ...personal },
    { id: 'catalog', title: 'Catalog Legacy', malId: '100', status: 'Plan to Watch', ...personal },
    { id: 'safe', title: 'Dropped Safe', status: 'Dropped', ...personal },
    { id: 'ambiguous', title: 'On Hold Ambiguous', status: 'On Hold', ...personal },
    { id: 'none', title: 'Watching No Match', status: 'Watching', ...personal },
    { id: 'error', title: 'Completed Lookup Error', status: 'Completed', ...personal },
    { id: 'after-error', title: 'Plan Safe After Error', status: 'Plan to Watch', ...personal }
  ];
  const catalog = [
    { id: 'catalog-100', title: 'Catalog Legacy', malId: '100', kitsuId: '9100', type: 'TV' }
  ];
  const resolverCalls = [];
  const safe = (kitsuId) => ({
    identityDecision: {
      safe: true,
      kitsuId,
      needsReview: false,
      unresolved: false,
      reason: 'High-confidence test identity.'
    }
  });
  const resolveIdentity = async (item) => {
    resolverCalls.push(item.id);
    if (item.id === 'safe') return safe('9200');
    if (item.id === 'ambiguous') {
      return {
        identityDecision: {
          safe: false,
          kitsuId: '',
          needsReview: true,
          unresolved: false,
          reason: 'Multiple plausible seasons.'
        }
      };
    }
    if (item.id === 'none') {
      return {
        identityDecision: {
          safe: false,
          kitsuId: '',
          needsReview: false,
          unresolved: true,
          reason: 'No candidates.'
        }
      };
    }
    if (item.id === 'error') throw new Error('Provider unavailable');
    if (item.id === 'after-error') return safe('9300');
    throw new Error(`Unexpected resolution for ${item.id}`);
  };

  const result = await libraryLinkageRepair.repairLibraryKitsuLinkages({
    library,
    catalog,
    resolveIdentity,
    yieldControl: async () => {}
  });

  assert.equal(result.scanned, 8);
  assert.equal(result.eligible, 6);
  assert.equal(result.skippedLinked, 1);
  assert.equal(result.repaired, 3);
  assert.equal(result.needsReview, 2);
  assert.equal(result.unresolved, 2);
  assert.equal(result.linkedBefore, 1);
  assert.equal(result.linkedAfter, 4);
  assert.deepEqual(resolverCalls, ['safe', 'ambiguous', 'none', 'error', 'after-error']);

  assert.equal(result.library.find((item) => item.id === 'catalog').kitsuId, '9100');
  assert.equal(result.library.find((item) => item.id === 'safe').kitsuId, '9200');
  assert.equal(result.library.find((item) => item.id === 'after-error').kitsuId, '9300');
  assert.equal(result.library.find((item) => item.id === 'ambiguous').kitsuId, undefined);
  assert.equal(result.library.find((item) => item.id === 'ambiguous').identityNeedsReview, true);
  assert.equal(result.library.find((item) => item.id === 'none').kitsuId, undefined);
  assert.equal(result.library.find((item) => item.id === 'error').kitsuId, undefined);
  assert.strictEqual(result.library.find((item) => item.id === 'linked'), library[0]);
  assert.strictEqual(result.library.find((item) => item.id === 'review'), library[1]);

  for (const repairedId of ['catalog', 'safe', 'ambiguous', 'after-error']) {
    const before = library.find((item) => item.id === repairedId);
    const after = result.library.find((item) => item.id === repairedId);
    for (const field of Object.keys(personal)) {
      assert.deepEqual(after[field], before[field], `${repairedId} changed personal field ${field}`);
    }
  }
});

check('Update Database reuses identical safe-resolution requests', async () => {
  let calls = 0;
  const result = await libraryLinkageRepair.repairLibraryKitsuLinkages({
    library: [
      { id: 'duplicate-a', title: 'Duplicate Lookup', status: 'Plan to Watch', year: 2024, type: 'TV' },
      { id: 'duplicate-b', title: 'Duplicate Lookup', status: 'Dropped', year: 2024, type: 'TV' }
    ],
    resolveIdentity: async () => {
      calls += 1;
      return {
        identityDecision: {
          safe: true,
          kitsuId: '9400',
          needsReview: false,
          unresolved: false,
          reason: 'High-confidence test identity.'
        }
      };
    },
    yieldControl: async () => {}
  });

  assert.equal(calls, 1);
  assert.equal(result.repaired, 1);
  assert.equal(result.needsReview, 1);
  assert.equal(result.library[0].kitsuId, '9400');
  assert.equal(result.library[1].kitsuId, undefined);
  assert.equal(result.library[1].identityNeedsReview, true);
  assert.match(result.library[1].metadataReviewReason, /already linked/i);
});

check('official Kitsu mappings safely repair missing MAL IDs without touching user data', async () => {
  const personal = {
    status: 'Watching',
    joeScore: 9.2,
    watchProgress: 8,
    notes: 'Keep this private data unchanged',
    favorite: true,
    userTags: ['owned']
  };
  const library = [
    { id: 'already', title: 'Already Linked', kitsuId: '1', malId: 10, ...personal },
    { id: 'safe', title: 'Safe Mapping', kitsuId: '2', ...personal },
    { id: 'none', title: 'No MAL Mapping', kitsuId: '3', ...personal },
    { id: 'no-kitsu', title: 'No Kitsu Identity', ...personal },
    { id: 'review', title: 'Needs Review', kitsuId: '4', identityNeedsReview: true, ...personal },
    { id: 'collision-owner', title: 'Owns MAL ID', kitsuId: '5', malId: 200, ...personal },
    { id: 'collision-target', title: 'Duplicate Mapping', kitsuId: '6', ...personal }
  ];

  const result = await libraryMalLinkageRepair.repairLibraryMalLinkages({
    library,
    fetchMappings: async () => new Map([
      ['2', '100'],
      ['3', ''],
      ['6', '200']
    ]),
    yieldControl: async () => {}
  });

  assert.equal(result.scanned, 7);
  assert.equal(result.eligible, 3);
  assert.equal(result.skippedLinked, 2);
  assert.equal(result.skippedNoKitsu, 1);
  assert.equal(result.skippedReview, 1);
  assert.equal(result.repaired, 1);
  assert.equal(result.unresolved, 2);
  assert.equal(result.collisions, 1);
  assert.equal(result.linkedBefore, 2);
  assert.equal(result.linkedAfter, 3);
  assert.equal(result.library.find((item) => item.id === 'safe').malId, 100);
  assert.equal(result.library.find((item) => item.id === 'none').malId, undefined);
  assert.equal(result.library.find((item) => item.id === 'collision-target').malId, undefined);
  assert.strictEqual(result.library.find((item) => item.id === 'already'), library[0]);

  const repaired = result.library.find((item) => item.id === 'safe');
  for (const field of Object.keys(personal)) {
    assert.deepEqual(repaired[field], library[1][field], `MAL repair changed personal field ${field}`);
  }
});

check('Kitsu mapping fetch accepts only official MyAnimeList anime relationships', async () => {
  let requestedUrl = '';
  const mappings = await libraryMalLinkageRepair.fetchMalMappingsForKitsuIds(
    ['2', '3'],
    async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        json: async () => ({
          data: [
            { id: '2', relationships: { mappings: { data: [{ id: 'map-mal' }, { id: 'map-other' }] } } },
            { id: '3', relationships: { mappings: { data: [{ id: 'map-manga' }] } } }
          ],
          included: [
            { id: 'map-mal', type: 'mappings', attributes: { externalSite: 'myanimelist/anime', externalId: '100' } },
            { id: 'map-other', type: 'mappings', attributes: { externalSite: 'anidb', externalId: '20' } },
            { id: 'map-manga', type: 'mappings', attributes: { externalSite: 'myanimelist/manga', externalId: '300' } }
          ]
        })
      };
    }
  );

  assert.match(requestedUrl, /include=mappings/);
  assert.equal(mappings.get('2'), '100');
  assert.equal(mappings.get('3'), '');
});

check('Update Database invokes full-library repair after its existing maintenance phases', async () => {
  const hookSource = await source('src/hooks/useAnimeLibrary.js');
  const genomeIndex = hookSource.indexOf('generateMissingGenomesForLibrary');
  const repairIndex = hookSource.indexOf('repairLibraryKitsuLinkages({', genomeIndex);
  assert.ok(genomeIndex >= 0);
  assert.ok(repairIndex > genomeIndex);
  assert.match(hookSource, /kitsuLinkage:\s*\{[\s\S]*?linkedBefore:[\s\S]*?linkedAfter:/);
  assert.ok(hookSource.indexOf('repairLibraryMalLinkages({', repairIndex) > repairIndex);
  assert.match(hookSource, /malLinkage:\s*\{[\s\S]*?linkedBefore:[\s\S]*?linkedAfter:/);
  const persistenceStart = hookSource.indexOf('// Persist identity-only patches', repairIndex);
  const repairPersistence = hookSource.slice(
    persistenceStart,
    hookSource.indexOf('setSyncProgress({', persistenceStart)
  );
  assert.match(repairPersistence, /animeRepository\.updateAnimeIdentityLinkage/);
  assert.doesNotMatch(repairPersistence, /updateData\s*\(/);
});

check('recommendation catalog refresh rotates past recently attempted titles', async () => {
  const catalog = [
    { id: 'recent', title: 'Recently Tried', kitsuId: '1', catalogMetadataAttemptedAt: '2026-08-29T12:00:00.000Z' },
    { id: 'never', title: 'Never Tried', kitsuId: '2' },
    { id: 'old', title: 'Old Attempt', kitsuId: '3', catalogMetadataAttemptedAt: '2026-08-20T12:00:00.000Z' }
  ];
  const metadataQueue = catalogService.buildCatalogQueue({ library: [], catalog, seed: [], limit: 2 });
  assert.deepEqual(metadataQueue.map(({ item }) => item.id), ['never', 'old']);

  const ratingCatalog = [
    { id: 'rating-recent', title: 'Recent Rating', kitsuId: '11', contentRatingAttemptedAt: '2026-08-29T12:00:00.000Z' },
    { id: 'rating-never', title: 'Never Rated', kitsuId: '12' },
    { id: 'rating-old', title: 'Old Rating', kitsuId: '13', contentRatingAttemptedAt: '2026-08-20T12:00:00.000Z' }
  ];
  const ratingQueue = catalogService.buildCatalogContentRatingQueue({
    library: [], catalog: ratingCatalog, seed: [], limit: 2
  });
  assert.deepEqual(ratingQueue.map(({ item }) => item.id), ['rating-never', 'rating-old']);
});

check('onboarding identity failures remain reachable from every Needs Review entry point', async () => {
  const [onboardingSource, librarySource, settingsSource] = await Promise.all([
    source('src/components/FirstTimeOnboarding.jsx'),
    source('src/pages/LibraryPage.jsx'),
    source('src/pages/PlaceholderPages.jsx')
  ]);
  assert.match(onboardingSource, /identityDecision\?\.needsReview\s*\|\|\s*result\.identityDecision\?\.unresolved/);
  assert.match(onboardingSource, /libraryNeedsReview:\s*Boolean/);
  assert.match(onboardingSource, /identityReviewCandidates:/);
  assert.match(onboardingSource, /const reviewRecordId = `mal-review-/);
  assert.match(onboardingSource, /identityResolutionStatus: 'review'/);
  assert.match(onboardingSource, /importedRecordId: reviewRecord\.id/);
  assert.match(onboardingSource, /joeanime:library-import-review-changed/);
  assert.match(librarySource, /item\.libraryNeedsReview\s*\|\|\s*item\.identityNeedsReview/);
  assert.match(settingsSource, /addEventListener\('joeanime:library-import-review-changed'/);
  assert.match(settingsSource, /libraryNeedsReview:\s*false/);
  assert.match(settingsSource, /persistedLibraryReviewItems/);
  assert.match(settingsSource, /item\.identityReviewCandidates \|\| \[\]/);
});

check('onboarding uses exact MAL mappings before title matching', async () => {
  let requestedUrl = '';
  const matches = await malKitsuMappingService.fetchKitsuAnimeByMalIds(['269', '21'], async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      json: async () => ({
        data: [{
          id: 'mapping-269',
          type: 'mappings',
          attributes: { externalSite: 'myanimelist/anime', externalId: '269' },
          relationships: { item: { data: { type: 'anime', id: '244' } } }
        }],
        included: [{
          id: '244',
          type: 'anime',
          attributes: {
            canonicalTitle: 'Bleach',
            titles: { en: 'Bleach' },
            synopsis: 'Soul Reapers defend the living world.',
            posterImage: { large: 'https://example.com/bleach.jpg' },
            subtype: 'TV',
            startDate: '2004-10-05',
            episodeCount: 366
          }
        }]
      })
    };
  });

  assert.match(requestedUrl, /mappings\?/);
  assert.match(requestedUrl, /include=item/);
  assert.equal(matches.get('269').kitsuId, '244');
  assert.equal(matches.get('269').malId, 269);
  assert.equal(matches.get('269').cover, 'https://example.com/bleach.jpg');
  assert.equal(matches.has('21'), false);

  const onboardingSource = await source('src/components/FirstTimeOnboarding.jsx');
  const exactLookup = onboardingSource.indexOf('fetchKitsuAnimeByMalIds(malIds)');
  const titleLookup = onboardingSource.indexOf('importAnimeByTitle({', exactLookup);
  assert.ok(exactLookup >= 0);
  assert.ok(titleLookup > exactLookup);
  assert.match(onboardingSource, /exactMalCandidate\s*\?/);
  assert.match(onboardingSource, /if \(row\.malId\) \{/);
  assert.match(onboardingSource, /duplicate: findExactMappedDuplicate\(exactMalCandidate, liveLibrary\)/);
  assert.match(onboardingSource, /const duplicateIsOnlyFuzzy = Boolean\(/);
  assert.match(onboardingSource, /result\.duplicate && !duplicateIsOnlyFuzzy/);
  assert.match(onboardingSource, /Official Kitsu MyAnimeList mapping/);
});

check('Dev mode does not reload midway through Update Database genome generation', async () => {
  const [viteConfig, hookSource] = await Promise.all([
    source('vite.config.js'),
    source('src/hooks/useAnimeLibrary.js')
  ]);
  assert.match(viteConfig, /watch:\s*\{[\s\S]*?ignored:/);
  assert.match(viteConfig, /generatedGenomeCards\.js/);
  assert.match(hookSource, /shouldGenerateGenomes\s*=\s*nativeGenomeGenerator\s*&&\s*!import\.meta\.env\.DEV/);
  assert.match(hookSource, /status:\s*nativeGenomeGenerator\s*&&\s*import\.meta\.env\.DEV\s*\?\s*'deferred-dev'/);
});

check('identity linkage persistence is exact-row and collision guarded on every platform', async () => {
  const [databaseSource, mainSource, preloadSource, repositorySource, mobileSource, appSource] = await Promise.all([
    source('electron/database.cjs'),
    source('electron/main.cjs'),
    source('electron/preload.cjs'),
    source('src/repositories/animeRepository.js'),
    source('src/platform/mobileDatabase.js'),
    source('src/App.jsx')
  ]);
  const exactUpdate = databaseSource.slice(
    databaseSource.indexOf('function updateAnimeIdentityLinkage'),
    databaseSource.indexOf('function upsertCatalogAnime')
  );
  assert.match(exactUpdate, /UPDATE anime/);
  assert.match(exactUpdate, /kitsu-collision/);
  assert.match(exactUpdate, /mal-collision/);
  assert.match(exactUpdate, /SET kitsuId = \?, malId = \?/);
  assert.match(exactUpdate, /afterCount !== beforeCount/);
  assert.doesNotMatch(exactUpdate, /DELETE FROM anime/);
  assert.match(mainSource, /db:updateAnimeIdentityLinkage/);
  assert.match(preloadSource, /updateAnimeIdentityLinkage/);
  assert.match(repositorySource, /async updateAnimeIdentityLinkage/);
  assert.match(repositorySource, /reason: 'mal-collision'/);
  assert.match(mobileSource, /async updateAnimeIdentityLinkage/);
  assert.match(mobileSource, /reason: 'mal-collision'/);
  assert.match(appSource, /joeanime-last-update-summary-v1/);
});

check('Library review mode exits cleanly after the final title is reviewed', async () => {
  const librarySource = await source('src/pages/LibraryPage.jsx');
  assert.match(
    librarySource,
    /if \(showNeedsReview && needsReviewCount === 0\) \{\s*setShowNeedsReview\(false\)/
  );
  assert.match(
    librarySource,
    /onClick=\{\(\) => setShowNeedsReview\(false\)\}>Show All Titles<\/button>/
  );
  assert.match(librarySource, /hasNoResults && query\.trim\(\) && onClearSearch/);
});

check('Library poster cards hide review badges without removing review workflow', async () => {
  const [librarySource, cardSource, libraryStyles] = await Promise.all([
    source('src/pages/LibraryPage.jsx'),
    source('src/components/AnimeCard.jsx'),
    source('src/styles/library-neon-archive-v4.css')
  ]);

  assert.match(librarySource, /<AnimeCard[\s\S]*?showReviewBadge=\{false\}/);
  assert.match(cardSource, /showReviewBadge\s*=\s*true/);
  assert.match(cardSource, /showReviewBadge && reviewLabel/);
  assert.match(librarySource, /Review Queue \(\$\{needsReviewCount\}\)/);
  assert.match(
    librarySource,
    /showNeedsReview[\s\S]*?anime\.filter\(\(item\) => item\.libraryNeedsReview \|\| item\.identityNeedsReview\)/
  );
  assert.match(libraryStyles, /@media \(max-width: 760px\)[\s\S]*?\.libraryArchiveLiveCopy \{[\s\S]*?padding-bottom: 84px/);
  assert.match(libraryStyles, /\.libraryArchiveLiveAdd \{[\s\S]*?left: 22px;[\s\S]*?right: 22px;[\s\S]*?bottom: 18px/);
});

check('legacy franchise titles cannot absorb distinct sequels or their Home actions', () => {
  const originalBleach = {
    id: 'legacy-jikan-bleach',
    malId: '269',
    title: 'Bleach',
    year: 2004,
    episodeCount: 366,
    status: 'Completed'
  };
  const tybw = {
    id: 'catalog-kitsu-44511',
    kitsuId: '44511',
    title: 'BLEACH: Thousand-Year Blood War',
    titleSynonyms: ['Bleach'],
    year: 2022,
    episodeCount: 13
  };
  const separation = {
    id: 'catalog-kitsu-46909',
    kitsuId: '46909',
    title: 'BLEACH: Thousand-Year Blood War Part 2 - The Separation',
    titleSynonyms: ['Bleach'],
    returningFromId: 'legacy-tybw',
    returningFromKitsuId: '44511'
  };
  const legacyTybw = { id: 'legacy-tybw', title: 'BLEACH: Thousand-Year Blood War', kitsuId: '44511' };

  assert.equal(titleIdentity.sameAnimeIdentity(originalBleach, tybw), false);
  assert.equal(titleIdentity.sameAnimeIdentity(legacyTybw, separation), false);
  assert.equal(titleIdentity.sameAnimeIdentity(
    legacyTybw,
    { ...separation, returningFromId: '', returningFromKitsuId: '', kitsuId: '' }
  ), false);
  assert.equal(titleIdentity.sameAnimeIdentity(tybw, { ...tybw, id: 'another-record' }), true);
});

check('shared Home selector is platform-neutral and returns all three decision groups', () => {
  const now = Date.parse('2026-08-23T12:00:00Z');
  const library = [
    { id: 'watch-1', title: 'Watching One', status: 'Watching', kitsuId: '101', watchedEpisodes: 4 },
    { id: 'watch-2', title: 'Watching Two', status: 'Watching', kitsu_id: '102', watchedEpisodes: 8 },
    { id: 'future-source', title: 'Future Source', status: 'Completed', kitsu_id: '201' },
    { id: 'anime-kitsu-301', title: 'Older Source', status: 'Completed' }
  ];
  const directContinuations = [
    {
      id: 'catalog-kitsu-202', kitsuId: '202', title: 'Upcoming Direct Sequel',
      continuationAiringStatus: 'upcoming', continuationStartDate: '2026-11-01',
      returningFromTitle: 'Future Source', returningFromStatus: 'completed'
    },
    {
      id: 'catalog-kitsu-302', kitsuId: '302', title: 'Older Missing Direct Sequel',
      continuationAiringStatus: 'finished', continuationStartDate: '2020-01-01',
      continuationEndDate: '2020-03-01', returningFromTitle: 'Older Source', returningFromStatus: 'completed'
    }
  ];
  const finalized = relationships.finalizeContinuationTitles(directContinuations, library, [], { now });
  const snapshots = ['electron', 'web', 'android', 'android-tv'].map((platform) =>
    homeSelector.selectHomeDecisionData({
      platform,
      library,
      continuations: finalized,
      directSequelCandidateCount: directContinuations.length
    })
  );

  assert.ok(snapshots[0].watchingTitles.length > 0);
  assert.ok(snapshots[0].returning.length > 0);
  assert.ok(snapshots[0].missedSequels.length > 0);
  snapshots.slice(1).forEach((snapshot) => assert.deepEqual(snapshot, snapshots[0]));
  assert.equal(snapshots[0].diagnostics.kitsuLinkedTitleCount, 4);
});

check('On Your Services builds a broad actionable pool without blocking Home', async () => {
  const library = [
    { id: 'watching', title: 'Watching Match', status: 'Watching', year: 2024, type: 'TV', kitsuId: '10', genres: ['Action'] },
    { id: 'planned', title: 'Planned Match', status: 'Plan to Watch', year: 2025, type: 'TV', malId: '20', genres: ['Fantasy'] },
    { id: 'completed', title: 'Completed Match', status: 'Completed', year: 2020, type: 'TV', kitsuId: '30' }
  ];
  const catalog = [
    { id: 'catalog-completed', title: 'Completed Match', year: 2020, type: 'TV', kitsuId: '30' },
    { id: 'catalog-strong', title: 'Strong Unseen Match', year: 2026, type: 'TV', kitsuId: '40', genres: ['Action'] },
    { id: 'catalog-weak', title: 'Weak Unseen Match', genres: ['Action'] }
  ];
  const dailyPick = { id: 'daily', title: 'Daily Pick', year: 2026, type: 'Movie', kitsuId: '50' };
  const candidates = homeDecisionData.buildHomeServiceCandidates(library, catalog, dailyPick);
  const titles = candidates.map((item) => item.title);

  assert.deepEqual(titles.slice(0, 2), ['Watching Match', 'Planned Match']);
  assert.ok(titles.includes('Daily Pick'));
  assert.ok(titles.includes('Strong Unseen Match'));
  assert.ok(titles.includes('Weak Unseen Match'));
  assert.equal(titles.includes('Completed Match'), false);
  assert.ok(candidates.length <= 48);

  const [homeHookSource, dashboardSource, storageSource] = await Promise.all([
    source('src/hooks/useHomeDecisionData.js'),
    source('src/pages/Dashboard.jsx'),
    source('src/services/storage.js')
  ]);
  assert.doesNotMatch(homeHookSource, /fetchWhereToWatch|runWatchmodeCatalogIndex/);
  assert.match(homeHookSource, /cachedServiceResults/);
  assert.match(homeHookSource, /requestCount:\s*0/);
  assert.match(homeHookSource, /cacheOnly:\s*true/);
  assert.match(homeHookSource, /reason:\s*'zero_dollar_mode'/);
  assert.match(dashboardSource, /function serviceActions\(item, preferredProvider\)/);
  assert.match(dashboardSource, /enableSecondaryRefresh:\s*quickPickPreparationComplete/);
  assert.match(storageSource, /joeanime:streaming-apps-changed/);
});

check('Discover On Your Services uses the saved provider cache without network lookup', async () => {
  const candidates = [
    { id: 'service-match', title: 'Service Match', year: 2024, type: 'TV', joeScore: 8.8 },
    { id: 'wrong-service', title: 'Wrong Service', year: 2024, type: 'TV', joeScore: 9.1 },
    { id: 'not-cached', title: 'Not Cached', year: 2024, type: 'TV', joeScore: 9.5 }
  ];
  const savedAt = Date.now() - 1000;
  const cache = {
    'US|service match|2024|tv': {
      savedAt,
      payload: {
        status: 'ready',
        providers: [{ name: 'Crunchyroll Premium', url: 'https://example.com/crunchyroll' }]
      }
    },
    'US|wrong service|2024|tv': {
      savedAt,
      payload: {
        status: 'ready',
        providers: [{ name: 'Netflix', url: 'https://example.com/netflix' }]
      }
    }
  };

  const result = discoverServicePool.buildCachedServiceDiscoverPool(
    candidates,
    ['crunchyroll'],
    'US',
    cache
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'Service Match');
  assert.equal(result[0].discoverPreferredProvider.name, 'Crunchyroll Premium');
  assert.equal(result[0].discoverPreferredProvider.url, 'https://example.com/crunchyroll');

  const [discoverSource, dashboardSource, watchmodeSource] = await Promise.all([
    source('src/pages/Discover.jsx'),
    source('src/pages/Dashboard.jsx'),
    source('src/services/watchmodeService.js')
  ]);
  assert.doesNotMatch(discoverSource, /fetchWhereToWatch/);
  assert.match(discoverSource, /title="On Your Services"/);
  assert.match(discoverSource, /items=\{cachedServicePool\}/);
  assert.match(dashboardSource, /action="View All"[\s\S]*?setView\?\.\('discover'\)/);
  assert.match(watchmodeSource, /joeanime:watchmode-cache-changed/);
  assert.match(watchmodeSource, /joeanime:watch-region-changed/);
});

check('Kitsu-first streaming cache is batched, persistent, and overridden by region-verified Watchmode data', async () => {
  localStorage.clear();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      json: async () => ({
        data: [
          {
            id: '101',
            type: 'anime',
            relationships: {
              streamingLinks: { data: [{ id: 'stream-1', type: 'streamingLinks' }] }
            }
          },
          {
            id: '102',
            type: 'anime',
            relationships: { streamingLinks: { data: [] } }
          }
        ],
        included: [
          {
            id: 'stream-1',
            type: 'streamingLinks',
            attributes: {
              url: 'https://www.crunchyroll.com/series/example',
              subs: ['en'],
              dubs: []
            }
          }
        ]
      })
    };
  };

  try {
    const items = [
      { title: 'Kitsu Match', kitsuId: '101', year: 2024, type: 'TV' },
      { title: 'Kitsu Empty', kitsuId: '102', year: 2024, type: 'TV' }
    ];
    const first = await kitsuStreamingService.primeKitsuStreamingLinks(items);
    assert.equal(first.requested, 2);
    assert.equal(first.ready, 1);
    assert.equal(first.empty, 1);
    assert.equal(fetchCalls, 1, 'two Kitsu IDs should share one batched request');

    const cachedReady = kitsuStreamingService.getCachedKitsuStreamingLinks(items[0]);
    const cachedEmpty = kitsuStreamingService.getCachedKitsuStreamingLinks(items[1]);
    assert.equal(cachedReady.status, 'ready');
    assert.equal(cachedReady.providers[0].name, 'Crunchyroll');
    assert.equal(cachedReady.source, 'kitsu');
    assert.equal(cachedReady.regional, false);
    assert.equal(cachedEmpty.status, 'not_found');

    const second = await kitsuStreamingService.primeKitsuStreamingLinks(items);
    assert.equal(second.requested, 0);
    assert.equal(fetchCalls, 1, 'fresh Kitsu streaming cache must prevent repeat requests');

    localStorage.setItem('joeanime-watchmode-provider-results-v1', JSON.stringify({
      'US|kitsu match|2024|tv': {
        savedAt: Date.now(),
        payload: {
          status: 'ready',
          providers: [{ name: 'Hulu', url: 'https://www.hulu.com/example' }]
        }
      }
    }));
    const preferred = streamingAvailabilityService.getCachedStreamingAvailability(items[0], {
      region: 'US'
    });
    assert.equal(preferred.source, 'watchmode');
    assert.equal(preferred.regional, true);
    assert.equal(preferred.providers[0].name, 'Hulu');

    const kitsuOnlyPool = discoverServicePool.buildCachedServiceDiscoverPool(
      items,
      ['crunchyroll'],
      'US',
      {},
      kitsuStreamingService.getKitsuStreamingCacheSnapshot()
    );
    assert.equal(kitsuOnlyPool.length, 1);
    assert.equal(kitsuOnlyPool[0].discoverServiceSource, 'kitsu');
  } finally {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  }

  const [homeSource, discoverSource, detailSource] = await Promise.all([
    source('src/hooks/useHomeDecisionData.js'),
    source('src/pages/Discover.jsx'),
    source('src/components/DetailModal.jsx')
  ]);
  assert.match(homeSource, /primeKitsuStreamingLinks/);
  assert.match(discoverSource, /KITSU_STREAMING_DISCOVER_LIMIT/);
  assert.match(discoverSource, /kitsuGaps/);
  assert.match(detailSource, /Check with Watchmode/);
  assert.match(detailSource, /Availability may vary by region/);
});

check('Discover samples the shared Watchmode cache safely and rotates through titles', async () => {
  localStorage.clear();
  const calls = [];
  const catalog = [
    { title: 'Cache Candidate One', kitsuId: '101', year: 2024, type: 'TV' },
    { title: 'Cache Candidate Two', kitsuId: '102', year: 2024, type: 'TV' },
    { title: 'Cache Candidate Three', kitsuId: '103', year: 2024, type: 'TV' }
  ];
  const fetcher = async (item, options) => {
    calls.push({ title: item.title, requestMode: options.requestMode });
    return item.title.endsWith('One')
      ? { status: 'ready', cacheBackend: 'KV', providers: [{ name: 'Netflix', url: 'https://example.com' }] }
      : { status: 'cache_miss', cacheBackend: 'KV' };
  };

  const first = await watchmodeSharedCacheDiscovery.runWatchmodeSharedCacheDiscovery({
    catalog,
    region: 'US',
    sessionLimit: 2,
    batchSize: 1,
    batchDelayMs: 0,
    minimumIntervalMs: 0,
    fetcher
  });
  assert.equal(first.attempted, 2);
  assert.equal(first.sharedHits, 1);
  assert.equal(first.cacheMisses, 1);
  assert.ok(calls.every((call) => call.requestMode === 'cache-only'));
  assert.equal(first.cursor, 2);
  const firstPassTitles = new Set(calls.map((call) => call.title));

  const callsAfterFirst = calls.length;
  const throttled = await watchmodeSharedCacheDiscovery.runWatchmodeSharedCacheDiscovery({
    catalog,
    region: 'US',
    minimumIntervalMs: 60_000,
    fetcher
  });
  assert.equal(throttled.status, 'recently-checked');
  assert.equal(calls.length, callsAfterFirst);

  const rotated = await watchmodeSharedCacheDiscovery.runWatchmodeSharedCacheDiscovery({
    catalog,
    region: 'US',
    sessionLimit: 1,
    batchDelayMs: 0,
    minimumIntervalMs: 0,
    fetcher
  });
  assert.equal(rotated.attempted, 1);
  assert.equal(firstPassTitles.has(calls.at(-1).title), false);

  const [discoverSource, samplerSource] = await Promise.all([
    source('src/pages/Discover.jsx'),
    source('src/services/watchmodeSharedCacheDiscovery.js')
  ]);
  assert.match(discoverSource, /runWatchmodeSharedCacheDiscovery/);
  assert.match(discoverSource, /browse\('services', 'On Your Services'\)/);
  assert.match(samplerSource, /requestMode:\s*'cache-only'/);
  assert.doesNotMatch(samplerSource, /requestMode:\s*'interactive'|requestMode:\s*'background'/);
  localStorage.clear();
});

check('Watchmode catalog index resumes safely and caches complete provider payloads', async () => {
  localStorage.clear();
  const library = [{ title: 'Already Owned', kitsuId: '1' }];
  const catalog = [
    { title: 'Already Owned', kitsuId: '1', year: 2024, type: 'TV' },
    { title: 'Cached Match', kitsuId: '2', year: 2024, type: 'TV', communityScore: 9.2 },
    { title: 'Ready Match', kitsuId: '3', year: 2024, type: 'TV', communityScore: 9.1 },
    { title: 'No Match', kitsuId: '4', year: 2024, type: 'TV', communityScore: 9.0 },
    { title: 'Later Match', kitsuId: '5', year: 2024, type: 'TV', communityScore: 8.9 }
  ];
  const fullProviderPayload = {
    status: 'ready',
    cacheBackend: 'KV',
    match: { id: 300 },
    providers: [
      { name: 'Netflix', url: 'https://example.com/netflix' },
      { name: 'Amazon Prime Video', url: 'https://example.com/prime' },
      { name: 'HIDIVE', url: 'https://example.com/hidive' }
    ]
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(fullProviderPayload), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });

  try {
    await watchmodeService.fetchWhereToWatch(catalog[1], { region: 'US' });
  } finally {
    globalThis.fetch = originalFetch;
  }

  const cachedPayload = watchmodeService.getCachedWhereToWatch(catalog[1], { region: 'US' });
  assert.equal(cachedPayload.providers.length, 3);
  assert.equal(
    watchmodeService.groupWatchProvidersByPreference(cachedPayload.providers, ['netflix']).preferred[0].name,
    'Netflix'
  );
  assert.equal(
    watchmodeService.groupWatchProvidersByPreference(cachedPayload.providers, ['prime']).preferred[0].name,
    'Amazon Prime Video'
  );

  const unseen = watchmodeCatalogIndexer.buildWatchmodeCatalogIndexCandidates(library, catalog);
  assert.equal(unseen.some((item) => item.title === 'Already Owned'), false);
  assert.equal(unseen.length, 4);

  const calls = [];
  const fetcher = async (item) => {
    calls.push(item.title);
    if (item.title === 'No Match') return { status: 'not_found', cacheBackend: 'KV' };
    return { status: 'ready', cacheBackend: 'KV', providers: fullProviderPayload.providers };
  };
  const first = await watchmodeCatalogIndexer.runWatchmodeCatalogIndex({
    library,
    catalog,
    enabled: true,
    region: 'US',
    sessionLimit: 2,
    batchSize: 1,
    batchDelayMs: 0,
    fetcher
  });
  assert.equal(first.attempted, 2);
  assert.equal(first.cachedSkipped, 1);
  assert.equal(first.cursor, 3);
  assert.equal(calls.includes('Cached Match'), false);

  const callsAfterFirstRun = calls.length;
  const second = await watchmodeCatalogIndexer.runWatchmodeCatalogIndex({
    library,
    catalog,
    enabled: true,
    region: 'US',
    sessionLimit: 2,
    batchSize: 1,
    batchDelayMs: 0,
    fetcher
  });
  assert.equal(second.recentAttemptSkipped, 2);
  assert.equal(calls.length, callsAfterFirstRun + 1);
  assert.ok(watchmodeCatalogIndexer.getWatchmodeCatalogIndexSnapshot().scopes.US.cursor >= 3);

  localStorage.clear();
  let rateLimitCalls = 0;
  const rateLimited = await watchmodeCatalogIndexer.runWatchmodeCatalogIndex({
    library: [],
    catalog: catalog.slice(1),
    enabled: true,
    region: 'US',
    sessionLimit: 4,
    batchSize: 1,
    batchDelayMs: 0,
    fetcher: async () => {
      rateLimitCalls += 1;
      const error = new Error('Rate limited');
      error.status = 429;
      error.retryAfterMs = 60_000;
      throw error;
    }
  });
  assert.equal(rateLimited.status, 'paused');
  assert.equal(rateLimited.pauseReason, 'rate_limited');
  assert.equal(rateLimitCalls, 1);

  await watchmodeCatalogIndexer.runWatchmodeCatalogIndex({
    library: [],
    catalog: catalog.slice(1),
    enabled: true,
    region: 'US',
    fetcher: async () => {
      rateLimitCalls += 1;
      return { status: 'ready', providers: [] };
    }
  });
  assert.equal(rateLimitCalls, 1);

  const [homeHookSource, indexerSource] = await Promise.all([
    source('src/hooks/useHomeDecisionData.js'),
    source('src/services/watchmodeCatalogIndexer.js')
  ]);
  assert.doesNotMatch(homeHookSource, /runWatchmodeCatalogIndex|watchmodeCatalogIndexer/);
  assert.match(indexerSource, /requestMode:\s*'background'/);
  localStorage.clear();
});

check('Cloudflare Watchmode zero-dollar policy is region-safe, shared, and stale-capable', async () => {
  const createKv = () => {
    const rows = new Map();
    const ttlWrites = [];
    const putKeys = [];
    return {
      rows,
      ttlWrites,
      putKeys,
      binding: {
        async get(key) {
          const saved = rows.get(key);
          return saved ? JSON.parse(saved) : null;
        },
        async put(key, value, options = {}) {
          rows.set(key, value);
          putKeys.push(key);
          ttlWrites.push(Number(options.expirationTtl || 0));
        }
      }
    };
  };

  const shared = createKv();
  const pendingWrites = [];
  const context = {
    env: {
      WATCHMODE_API_KEY: 'release-gate-placeholder',
      WATCHMODE_REGIONS: 'US,CA',
      WATCHMODE_CACHE: shared.binding
    },
    request: new Request('https://joeanimedb.com/api/watchmode?title=Quota%20Test&year=2024&type=TV&region=US'),
    waitUntil(promise) {
      pendingWrites.push(promise);
    }
  };
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async (url) => {
    upstreamCalls += 1;
    if (String(url).includes('/v1/search/')) {
      return new Response(JSON.stringify({
        title_results: [{ id: 123, name: 'Quota Test', year: 2024, type: 'tv_series' }]
      }), {
        status: 200,
        headers: {
          'X-Account-Quota': '2500',
          'X-Account-Quota-Used': String(99 + upstreamCalls)
        }
      });
    }
    return new Response(JSON.stringify([
      { type: 'sub', name: 'Netflix', web_url: 'https://example.com/netflix', format: 'HD' },
      { type: 'sub', name: 'Amazon Prime Video', web_url: 'https://example.com/prime', format: 'HD' }
    ]), {
      status: 200,
      headers: {
        'X-Account-Quota': '2500',
        'X-Account-Quota-Used': String(99 + upstreamCalls)
      }
    });
  };

  try {
    const firstResponse = await watchmodeProxy.onRequestGet(context);
    const first = await firstResponse.json();
    await Promise.all(pendingWrites.splice(0));
    assert.equal(first.cacheBackend, 'KV');
    assert.equal(first.cache.match, 'MISS');
    assert.equal(first.cache.providers, 'MISS');
    assert.equal(upstreamCalls, 2);
    assert.equal(shared.putKeys.length, 3, 'a fresh title should write one quota checkpoint plus its two cache rows');

    const secondResponse = await watchmodeProxy.onRequestGet(context);
    const second = await secondResponse.json();
    assert.equal(second.cacheBackend, 'KV');
    assert.equal(second.cache.match, 'KV');
    assert.equal(second.cache.providers, 'KV');
    assert.equal(upstreamCalls, 2);

    const callsBeforeCacheOnly = upstreamCalls;
    const writesBeforeCacheOnly = shared.putKeys.length;
    context.request = new Request('https://joeanimedb.com/api/watchmode?title=Quota%20Test&year=2024&type=TV&region=US&requestMode=cache-only');
    const cacheOnly = await (await watchmodeProxy.onRequestGet(context)).json();
    assert.equal(cacheOnly.status, 'ready');
    assert.equal(cacheOnly.requestMode, 'cache-only');
    assert.equal(cacheOnly.cache.match, 'KV');
    assert.equal(cacheOnly.cache.providers, 'KV');
    assert.equal(upstreamCalls, callsBeforeCacheOnly);
    assert.equal(shared.putKeys.length, writesBeforeCacheOnly, 'cache-only hits must never write KV');

    context.request = new Request('https://joeanimedb.com/api/watchmode?title=Never%20Cached&year=2024&type=TV&region=US&requestMode=cache-only');
    const cacheMiss = await (await watchmodeProxy.onRequestGet(context)).json();
    assert.equal(cacheMiss.status, 'cache_miss');
    assert.equal(cacheMiss.cache.match, 'MISS');
    assert.equal(upstreamCalls, callsBeforeCacheOnly, 'cache-only misses must never reach Watchmode');
    assert.equal(shared.putKeys.length, writesBeforeCacheOnly, 'cache-only misses must never write KV');

    context.request = new Request('https://joeanimedb.com/api/watchmode?title=Quota%20Test&year=2024&type=TV&region=CA');
    const canada = await (await watchmodeProxy.onRequestGet(context)).json();
    await Promise.all(pendingWrites.splice(0));
    assert.equal(canada.region, 'CA');
    assert.equal(canada.providers[0].region, 'CA');
    assert.equal(upstreamCalls, 4, 'region-specific identity/provider keys must not reuse US rows for CA');

    const storedProviderPayloads = [...shared.rows.values()]
      .map((value) => JSON.parse(value))
      .filter((value) => Array.isArray(value.providers));
    assert.ok(storedProviderPayloads.length >= 2);
    assert.ok(storedProviderPayloads.every((value) => value.providers.length === 2));
    assert.ok(storedProviderPayloads.every((value) => Number(value.freshUntil) > Date.now()));
    assert.ok(shared.ttlWrites.includes(60 * 60 * 24 * 30));

    const callsBeforeBackground = upstreamCalls;
    context.request = new Request('https://joeanimedb.com/api/watchmode?title=Background&year=2024&type=TV&region=US&requestMode=background');
    const backgroundResponse = await watchmodeProxy.onRequestGet(context);
    assert.equal(backgroundResponse.status, 403);
    assert.equal((await backgroundResponse.json()).zeroDollarMode, true);
    assert.equal(upstreamCalls, callsBeforeBackground);

    const empty = createKv();
    const emptyPending = [];
    const emptyContext = {
      env: {
        WATCHMODE_API_KEY: 'release-gate-placeholder',
        WATCHMODE_REGIONS: 'US',
        WATCHMODE_MONTHLY_CREDIT_LIMIT: '10',
        WATCHMODE_CACHE: empty.binding
      },
      request: new Request('https://joeanimedb.com/api/watchmode?title=Empty&watchmodeId=999&region=US'),
      waitUntil(promise) { emptyPending.push(promise); }
    };
    globalThis.fetch = async () => new Response(JSON.stringify([]), { status: 200 });
    const emptyPayload = await (await watchmodeProxy.onRequestGet(emptyContext)).json();
    await Promise.all(emptyPending.splice(0));
    assert.equal(emptyPayload.status, 'ready');
    assert.deepEqual(emptyPayload.providers, []);
    assert.ok(empty.ttlWrites.includes(60 * 60 * 24), 'empty provider results must expire after one day');

    const budgeted = createKv();
    const budgetPending = [];
    let budgetUpstreamCalls = 0;
    globalThis.fetch = async () => {
      budgetUpstreamCalls += 1;
      return new Response(JSON.stringify([
        { type: 'sub', name: 'Netflix', web_url: 'https://example.com/netflix', format: 'HD' },
        { type: 'sub', name: 'HIDIVE', web_url: 'https://example.com/hidive', format: 'HD' }
      ]), { status: 200 });
    };
    const budgetContext = {
      env: {
        WATCHMODE_API_KEY: 'release-gate-placeholder',
        WATCHMODE_REGIONS: 'US',
        WATCHMODE_MONTHLY_CREDIT_LIMIT: '1',
        WATCHMODE_CACHE: budgeted.binding
      },
      request: new Request('https://joeanimedb.com/api/watchmode?title=Stale&watchmodeId=777&region=US'),
      waitUntil(promise) { budgetPending.push(promise); }
    };
    const fresh = await (await watchmodeProxy.onRequestGet(budgetContext)).json();
    await Promise.all(budgetPending.splice(0));
    assert.equal(fresh.status, 'ready');
    assert.equal(budgetUpstreamCalls, 1);

    for (const [key, value] of budgeted.rows) {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed.providers)) continue;
      parsed.freshUntil = Date.now() - 1;
      budgeted.rows.set(key, JSON.stringify(parsed));
    }

    const stale = await (await watchmodeProxy.onRequestGet(budgetContext)).json();
    assert.equal(stale.status, 'ready');
    assert.equal(stale.stale, true);
    assert.equal(stale.cache.providers, 'KV_STALE');
    assert.equal(stale.providers.length, 2);
    assert.equal(budgetUpstreamCalls, 1);

    budgetContext.request = new Request('https://joeanimedb.com/api/watchmode?title=Blocked&watchmodeId=778&region=US');
    const blockedResponse = await watchmodeProxy.onRequestGet(budgetContext);
    assert.equal(blockedResponse.status, 429);
    assert.equal((await blockedResponse.json()).status, 'quota_exhausted');
    assert.equal(budgetUpstreamCalls, 1);

    const authoritative = createKv();
    let authoritativeCalls = 0;
    globalThis.fetch = async () => {
      authoritativeCalls += 1;
      return new Response(JSON.stringify([
        { type: 'sub', name: 'Netflix', web_url: 'https://example.com/netflix', format: 'HD' }
      ]), {
        status: 200,
        headers: {
          'X-Account-Quota': '2500',
          'X-Account-Quota-Used': authoritativeCalls === 1 ? '1999' : '2000'
        }
      });
    };
    const authoritativeContext = {
      env: {
        WATCHMODE_API_KEY: 'release-gate-placeholder',
        WATCHMODE_REGIONS: 'US',
        WATCHMODE_CACHE: authoritative.binding
      },
      request: new Request('https://joeanimedb.com/api/watchmode?title=Header%20One&watchmodeId=880&region=US')
    };
    assert.equal((await (await watchmodeProxy.onRequestGet(authoritativeContext)).json()).status, 'ready');
    authoritativeContext.request = new Request('https://joeanimedb.com/api/watchmode?title=Header%20Two&watchmodeId=881&region=US');
    assert.equal((await (await watchmodeProxy.onRequestGet(authoritativeContext)).json()).status, 'ready');

    const quotaRow = [...authoritative.rows.entries()]
      .map(([key, value]) => [key, JSON.parse(value)])
      .find(([key]) => key.startsWith('watchmode:quota:v1:'));
    assert.ok(quotaRow);
    assert.equal(quotaRow[1].used, 2000);
    assert.equal(quotaRow[1].authoritativeUsed, 2000);
    assert.equal(quotaRow[1].providerQuota, 2500);
    assert.equal(quotaRow[1].effectiveLimit, 2000);
    assert.equal(quotaRow[1].accounting, 'watchmode-account-header');

    authoritativeContext.request = new Request('https://joeanimedb.com/api/watchmode?title=Header%20Blocked&watchmodeId=882&region=US');
    const authoritativeBlocked = await watchmodeProxy.onRequestGet(authoritativeContext);
    assert.equal(authoritativeBlocked.status, 429);
    assert.equal((await authoritativeBlocked.json()).status, 'quota_exhausted');
    assert.equal(authoritativeCalls, 2, 'Watchmode account usage must stop the next upstream call at the 2,000-credit ceiling');

    let noKvUpstreamCalls = 0;
    globalThis.fetch = async () => {
      noKvUpstreamCalls += 1;
      return new Response(JSON.stringify([]), { status: 200 });
    };
    const noKvResponse = await watchmodeProxy.onRequestGet({
      env: { WATCHMODE_API_KEY: 'release-gate-placeholder', WATCHMODE_REGIONS: 'US' },
      request: new Request('https://joeanimedb.com/api/watchmode?title=No%20KV&watchmodeId=779&region=US')
    });
    assert.equal(noKvResponse.status, 503);
    assert.equal(noKvUpstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const [proxySource, clientSource, indexerSource] = await Promise.all([
    source('functions/api/watchmode.js'),
    source('src/services/watchmodeService.js'),
    source('src/services/watchmodeCatalogIndexer.js')
  ]);
  assert.match(proxySource, /PROVIDER_TTL_SECONDS\s*=\s*60 \* 60 \* 24 \* 28/);
  assert.match(proxySource, /DEFAULT_MONTHLY_CREDIT_LIMIT\s*=\s*2000/);
  assert.match(proxySource, /X-Account-Quota-Used/);
  assert.match(proxySource, /watchmode-account-header/);
  assert.match(proxySource, /QUOTA_CHECKPOINT_SIZE\s*=\s*25/);
  assert.match(proxySource, /QUOTA_PRECISE_WINDOW\s*=\s*100/);
  assert.match(proxySource, /PROVIDER_STALE_TTL_SECONDS\s*=\s*60 \* 60 \* 24 \* 30/);
  assert.match(proxySource, /requestMode !== 'interactive' && !cacheOnly/);
  assert.match(proxySource, /cacheBackend/);
  assert.match(clientSource, /PROVIDER_READY_CACHE_TTL_MS\s*=\s*28 \* 24/);
  assert.match(clientSource, /PROVIDER_TERMINAL_CACHE_TTL_MS\s*=\s*24 \* 60 \* 60/);
  assert.match(clientSource, /groupWatchProvidersByPreference/);
  assert.match(indexerSource, /requestMode:\s*'background'/);
  localStorage.clear();
});

check('JoeAI Quick Pick intents enforce useful recommendation constraints', () => {
  const library = [{ id: 'anchor', title: 'Action Anchor', status: 'Completed', joeScore: 9, genres: ['Action'], year: 2020, episodeCount: 24 }];
  const catalog = [
    { id: 'quick', title: 'Quick Show', genres: ['Action'], type: 'TV', episodeCount: 12, year: 2024, airingStatus: 'finished', synopsis: 'A heroic action adventure.', cover: 'quick.jpg' },
    { id: 'movie', title: 'Movie Pick', genres: ['Adventure'], type: 'Movie', episodeCount: 1, year: 2024, airingStatus: 'finished', synopsis: 'A cinematic adventure.', cover: 'movie.jpg' },
    { id: 'binge', title: 'Binge Pick', genres: ['Action'], type: 'TV', episodeCount: 24, year: 2024, airingStatus: 'finished', synopsis: 'A complete action story.', cover: 'binge.jpg' },
    { id: 'dark', title: 'Dark Pick', genres: ['Horror', 'Psychological'], type: 'TV', episodeCount: 12, year: 2024, airingStatus: 'finished', synopsis: 'A dark grim psychological survival tragedy.', cover: 'dark.jpg' },
    { id: 'comfort', title: 'Comfort Pick', genres: ['Slice of Life'], type: 'TV', episodeCount: 12, year: 2024, airingStatus: 'finished', synopsis: 'A wholesome cozy heartwarming friendship story.', cover: 'comfort.jpg' },
    { id: 'different', title: 'Different Pick', genres: ['Sports'], type: 'TV', episodeCount: 24, year: 2024, airingStatus: 'finished', synopsis: 'A sports team competes.', cover: 'different.jpg' },
    { id: 'gintama', title: 'Gintama: The Movie: The Final Chapter', genres: ['Comedy'], type: 'Movie', episodeCount: 1, year: 2013, airingStatus: 'finished', synopsis: 'A funny comedy parody.', cover: 'gintama.jpg' }
  ];
  const run = (prompt) => recommendations.recommendAnime(library, catalog, { prompt, limit: 8 });
  const quick = run('recommend a short anime under 14 episodes I can start right now');
  const movies = run('recommend an anime movie for tonight');
  const binge = run('recommend a bingeable finished anime');
  const dark = run('recommend something dark');
  const comfort = run('recommend a comforting wholesome anime');
  const different = run('recommend something outside my usual taste');

  assert.ok(quick.length && quick.every((item) => Number(item.episodeCount || item.episodes) <= 13));
  assert.ok(movies.length && movies.every((item) => /movie|film/i.test(item.type || item.format)));
  assert.ok(binge.length && binge.every((item) => !/movie|film/i.test(item.type || item.format) && Number(item.episodeCount || item.episodes) <= 52));
  assert.deepEqual(dark.map((item) => item.title), ['Dark Pick']);
  assert.equal(dark.some((item) => item.title.includes('Gintama')), false);
  assert.deepEqual(comfort.map((item) => item.title), ['Comfort Pick']);
  assert.ok(different.length && different.every((item) => !(item.genres || []).includes('Action')));

  const prompts = new Set(quickPicks.QUICK_PICK_INTENTS.map((intent) => intent.prompt));
  assert.equal(quickPicks.QUICK_PICK_INTENTS.length, 7);
  assert.equal(prompts.size, 7);
  const surpriseContext = { brain: { recommendations: () => catalog.slice(0, 4) } };
  const firstSurprise = quickPicks.selectQuickPickRecommendation(surpriseContext, 'surprise', { daySeed: 1, surpriseNonce: 0 });
  const nextSurprise = quickPicks.selectQuickPickRecommendation(surpriseContext, 'surprise', { daySeed: 1, surpriseNonce: 1 });
  assert.notEqual(firstSurprise.item.id, nextSurprise.item.id);

  const rerollPool = catalog.slice(0, 4);
  const rerollContext = { brain: { recommendations: () => rerollPool } };
  const rerollHistory = [];
  for (let selectionNonce = 1; selectionNonce <= rerollPool.length; selectionNonce += 1) {
    const pick = quickPicks.selectQuickPickRecommendation(rerollContext, 'binge', {
      daySeed: 20260823,
      selectionNonce,
      excludeKeys: rerollHistory,
      currentKey: rerollHistory.at(-1)
    });
    assert.ok(pick?.item);
    assert.equal(rerollHistory.includes(quickPicks.quickPickItemKey(pick.item)), false);
    rerollHistory.push(quickPicks.quickPickItemKey(pick.item));
  }
  const resetPick = quickPicks.selectQuickPickRecommendation(rerollContext, 'binge', {
    daySeed: 20260823,
    selectionNonce: rerollPool.length + 1,
    excludeKeys: rerollHistory,
    currentKey: rerollHistory.at(-1)
  });
  assert.equal(resetPick.resetCycle, true);
  assert.notEqual(quickPicks.quickPickItemKey(resetPick.item), rerollHistory.at(-1));

  const repeatedTop = { id: 'gintama-season-2', title: 'Gintama Season 2' };
  const diverseContext = {
    brain: {
      recommendations: (_limit, { prompt }) => [
        repeatedTop,
        prompt.includes('outside')
          ? { id: 'sports-alternative', title: 'Sports Alternative' }
          : { id: 'binge-alternative', title: 'Binge Alternative' }
      ]
    }
  };
  const bingePick = quickPicks.selectQuickPickRecommendation(diverseContext, 'binge');
  const differentPick = quickPicks.selectQuickPickRecommendation(diverseContext, 'different', {
    excludeKeys: [quickPicks.quickPickItemKey(bingePick.item)]
  });
  assert.equal(bingePick.item.id, 'gintama-season-2');
  assert.equal(differentPick.item.id, 'sports-alternative');
  const onlyCandidate = quickPicks.selectQuickPickRecommendation(
    { brain: { recommendations: () => [repeatedTop] } },
    'different',
    { excludeKeys: ['gintama-season-2'] }
  );
  assert.equal(onlyCandidate.item.id, 'gintama-season-2');

  const sharedPool = [
    repeatedTop,
    { id: 'binge-two', title: 'Binge Two' },
    { id: 'different-two', title: 'Different Two' },
    { id: 'surprise-two', title: 'Surprise Two' }
  ];
  const sharedContext = { brain: { recommendations: () => sharedPool } };
  const shownKeys = [];
  const diverseBinge = quickPicks.selectQuickPickRecommendation(sharedContext, 'binge', { excludeKeys: shownKeys });
  shownKeys.push(quickPicks.quickPickItemKey(diverseBinge.item));
  const diverseDifferent = quickPicks.selectQuickPickRecommendation(sharedContext, 'different', { excludeKeys: shownKeys });
  shownKeys.push(quickPicks.quickPickItemKey(diverseDifferent.item));
  const diverseSurprise = quickPicks.selectQuickPickRecommendation(sharedContext, 'surprise', {
    daySeed: 0,
    surpriseNonce: 0,
    excludeKeys: shownKeys
  });
  assert.equal(new Set([diverseBinge.item.id, diverseDifferent.item.id, diverseSurprise.item.id]).size, 3);
});

check('Quick Pick pools are cached and rerolls never rebuild recommendation scoring', async () => {
  let recommendationCalls = 0;
  const pool = [
    { id: 'cached-one', title: 'Cached One', match: 88 },
    { id: 'cached-two', title: 'Cached Two', match: 84 },
    { id: 'cached-three', title: 'Cached Three', match: 80 }
  ];
  const context = {
    brain: {
      recommendations: () => {
        recommendationCalls += 1;
        return pool;
      }
    }
  };

  const first = quickPicks.selectQuickPickRecommendation(context, 'dark', { selectionNonce: 1 });
  const second = quickPicks.selectQuickPickRecommendation(context, 'dark', {
    selectionNonce: 2,
    excludeKeys: [quickPicks.quickPickItemKey(first.item)]
  });
  assert.equal(recommendationCalls, 1);
  assert.notEqual(first.item.id, second.item.id);
  assert.ok(second.selectionMs < 50);

  const [dashboardSource, workerSource, quickPickSource] = await Promise.all([
    source('src/pages/Dashboard.jsx'),
    source('src/workers/quickPickPoolWorker.js'),
    source('src/services/homeQuickPick.js')
  ]);
  assert.match(dashboardSource, /new Worker\(new URL\('\.\.\/workers\/quickPickPoolWorker\.js'/);
  assert.match(dashboardSource, /deferUntilAfterFirstPaint\(preparePools/);
  assert.match(dashboardSource, /quickPickPoolsRef\.current\[activeIntent\]/);
  assert.match(workerSource, /buildQuickPickPool/);
  assert.match(workerSource, /type: 'pool-ready'/);
  assert.match(quickPickSource, /quickPickPoolCache = new WeakMap/);
});

check('Quick Pick persisted pools hydrate safely and invalidate on recommendation inputs', async () => {
  const previousLocalStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };

  try {
    const catalogItem = {
      id: 'persisted-dark', title: 'Persisted Dark', type: 'TV', episodeCount: 12,
      genres: ['Horror'], synopsis: 'A dark psychological survival story.'
    };
    const context = {
      safetyMode: 'unrestricted',
      library: [{ id: 'watched-one', title: 'Watched One', status: 'Completed', score: 9 }],
      catalog: [catalogItem]
    };
    const pools = { dark: [{ ...catalogItem, match: 91, reasons: ['matches the darker tone'] }] };
    assert.equal(quickPicks.persistQuickPickPools(context, pools, {}), true);

    const restored = quickPicks.readPersistedQuickPickPools(context, {});
    assert.equal(restored.pools.dark.length, 1);
    assert.equal(restored.pools.dark[0].title, 'Persisted Dark');
    assert.equal(restored.pools.dark[0].match, 91);

    const changedContext = {
      ...context,
      library: [{ ...context.library[0], status: 'Watching' }]
    };
    assert.deepEqual(quickPicks.readPersistedQuickPickPools(changedContext, {}).pools, {});

    globalThis.localStorage.setItem(quickPicks.QUICK_PICK_POOL_CACHE_KEY, '{bad json');
    assert.deepEqual(quickPicks.readPersistedQuickPickPools(context, {}).pools, {});
    assert.equal(globalThis.localStorage.getItem(quickPicks.QUICK_PICK_POOL_CACHE_KEY), null);
  } finally {
    globalThis.localStorage = previousLocalStorage;
  }

  const [dashboardSource, workerSource, decisionHookSource] = await Promise.all([
    source('src/pages/Dashboard.jsx'),
    source('src/workers/quickPickPoolWorker.js'),
    source('src/hooks/useHomeDecisionData.js')
  ]);
  assert.match(dashboardSource, /readPersistedQuickPickPools/);
  assert.match(dashboardSource, /persistQuickPickPools/);
  assert.match(dashboardSource, /Preparing picks\.\.\./);
  assert.match(dashboardSource, /type: 'prioritize'/);
  assert.match(workerSource, /message\.type === 'prioritize'/);
  assert.match(workerSource, /setTimeout\(processNextIntent, 0\)/);
  assert.match(decisionHookSource, /enableSecondaryRefresh/);
  assert.match(decisionHookSource, /if \(!enableSecondaryRefresh\)/);
});

check('Quick Pick intent controls preserve icon, selected, and TV focus hierarchy', async () => {
  const [dashboardSource, homeStyles, tvStyles] = await Promise.all([
    source('src/pages/Dashboard.jsx'),
    source('src/styles/joeai-home-v3.css'),
    source('src/styles/tv-focus.css')
  ]);

  for (const icon of ['Zap', 'Clapperboard', 'Layers3', 'Moon', 'Heart', 'Shuffle', 'Dices']) {
    assert.match(dashboardSource, new RegExp(`\\b${icon}\\b`));
  }
  for (const intent of ['quick', 'movie', 'binge', 'dark', 'comfort', 'different', 'surprise']) {
    assert.match(dashboardSource, new RegExp(`${intent}:\\s*[A-Z]`));
  }
  assert.match(dashboardSource, /className="homeDecisionIntentIcon" aria-hidden="true"/);
  assert.match(dashboardSource, /aria-pressed=\{activeIntent === intent\.id\}/);
  assert.match(dashboardSource, /quickPickHistoryRef\.current\[activeIntent\]/);
  assert.match(dashboardSource, /\[intent\.id\]: \(current\[intent\.id\] \|\| 0\) \+ 1/);
  assert.match(homeStyles, /\.homeDecisionIntentGrid button\[aria-pressed="true"\] \.homeDecisionIntentIcon/);
  assert.match(homeStyles, /\.homeDecisionIntentGrid button\[aria-pressed="true"\]:focus-visible/);
  assert.match(tvStyles, /button\[aria-pressed="true"\]:focus[\s\S]*?var\(--tv-focus-ring\)/);
});

check('Home artwork and production copy use shared poster fallbacks', async () => {
  const [dashboardSource, homeStyles, tvFocusStyles, posterSource, relationshipSource] = await Promise.all([
    source('src/pages/Dashboard.jsx'),
    source('src/styles/joeai-home-v3.css'),
    source('src/styles/tv-focus.css'),
    source('src/components/Poster.jsx'),
    source('src/services/kitsuRelationshipService.js')
  ]);
  assert.doesNotMatch(dashboardSource, /homeDecisionHeroArtwork/);
  assert.match(homeStyles, /var\(--home-hero-image\) center right \/ cover no-repeat/);
  assert.match(homeStyles, /\.homeV3Hero\.homeDecisionHero\s*\{[\s\S]*?background:\s*var\(--home-hero-image\)/);
  assert.match(homeStyles, /\.homeV3Hero\.homeDecisionHero::after,[\s\S]*?display:\s*none/);
  assert.doesNotMatch(tvFocusStyles, /Full-bleed artwork with a left readability veil/);
  assert.doesNotMatch(homeStyles, /\.homeV3Continue\s*\{[^}]*display:\s*none/);
  assert.match(dashboardSource, /watchingTitles/);
  assert.match(dashboardSource, /homeDecisionContinue[\s\S]*?<DecisionCard/);
  assert.match(dashboardSource, /homeDecisionReturning[\s\S]*?<DecisionCard/);
  assert.match(dashboardSource, /homeDecisionMissed[\s\S]*?<DecisionCard/);
  assert.match(dashboardSource, /homeDecisionQuickPick[\s\S]*?<DecisionCard/);
  assert.match(homeStyles, /\.homeDecisionPoster\s*>\s*\.posterThumb/);
  for (const field of ['cover', 'poster', 'posterUrl', 'image', 'imageUrl']) {
    assert.match(posterSource, new RegExp(`anime\\?\\.${field}`));
  }
  assert.doesNotMatch(dashboardSource, /Direct sequels only/i);
  assert.doesNotMatch(dashboardSource, /No typing required/i);
  assert.match(dashboardSource, /You Missed a Sequel/);
  assert.doesNotMatch(dashboardSource, /No returning seasons found/);
  assert.doesNotMatch(dashboardSource, /Nothing is in progress/);
  assert.match(dashboardSource, /watching\.length > 0 &&/);
  assert.match(dashboardSource, /returning\.length > 0 &&/);
  assert.match(dashboardSource, /missedSequels\.length > 0 &&/);
  assert.match(dashboardSource, /hasStreamingApps && onServices\.length > 0/);
  assert.match(dashboardSource, /WHAT ARE WE WATCHING\?/);
  assert.match(dashboardSource, /Pick a mood or let Joe decide\./);
  assert.match(dashboardSource, /reasonLabel="Why Joe picked it"/);
  assert.match(dashboardSource, /aria-pressed=\{activeIntent === intent\.id\}/);
  assert.match(homeStyles, /\.homeDecisionRail\.is-single/);
  assert.match(homeStyles, /\.homeDecisionHero \.homeV3HeroStats:has\(> \.homeV3StatPill:only-child\)/);
  assert.match(homeStyles, /\.homeDecisionHero \.homeV3HeroStats:not\(:has\(> \.homeV3StatPill\)\)/);
  assert.match(homeStyles, /grid-template-columns:\s*minmax\(260px, 38%\) minmax\(0, 62%\)/);
  assert.match(homeStyles, /button\[aria-pressed="true"\]/);
  assert.doesNotMatch(homeStyles, /@media \(max-width: 480px\)[\s\S]*?\.homeDecisionQuickPick \{ order:/);
  assert.match(homeStyles, /\.homeDecisionQuickLayout > \.homeDecisionCard \.homeDecisionCardActions \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(homeStyles, /\.homeDecisionQuickLayout > \.homeDecisionCard \.homeDecisionCardActions button\.primary \{[\s\S]*?min-width: 0/);
  for (const theme of ['neon', 'sakura', 'vapor', 'inferno', 'ramen', 'amoled']) {
    assert.match(homeStyles, new RegExp(`\\.theme-${theme} \\.homeV3 \\{[\\s\\S]*?--home-accent:[\\s\\S]*?--home-panel-tint:`));
  }
  assert.match(relationshipSource, /MAX_SOURCE_TITLES\s*=\s*60/);
  assert.match(relationshipSource, /MAX_CONCURRENT_REQUESTS\s*=\s*4/);
});

check('Home and catalog Details expose Add and Already Watched actions', async () => {
  const [dashboardSource, detailSource] = await Promise.all([
    source('src/pages/Dashboard.jsx'),
    source('src/components/DetailModal.jsx')
  ]);
  assert.match(dashboardSource, /label:\s*'Add'/);
  assert.match(dashboardSource, /label:\s*'Watched'/);
  assert.match(dashboardSource, /buildQuickAddEntry\(item/);
  assert.match(detailSource, /Add to Library/);
  assert.match(detailSource, /Already Watched/);
  assert.match(detailSource, /catalogLibraryAction:not\(\[disabled\]\)/);
  assert.match(detailSource, /function focusTvDetailHeader\(\)/);
  assert.match(detailSource, /direction === 'ArrowUp' && index === 0/);
  assert.match(detailSource, /\.detailNavigationButton:not\(\[disabled\]\), \.close:not\(\[disabled\]\)/);
  assert.match(detailSource, /root\.scrollTo\(\{ top: 0, left: 0, behavior: 'smooth' \}\)/);
});

check('Details metadata warning is compact and keeps repair attention state', async () => {
  const [detailSource, repairStyles] = await Promise.all([
    source('src/components/DetailModal.jsx'),
    source('src/styles/detail-metadata-repair.css')
  ]);
  assert.doesNotMatch(detailSource, /<section className=\{`detailMetadataReview/);
  assert.match(detailSource, /repairMetadataButton \$\{needsMetadataReview \? 'needsMetadataRepair' : ''\}/);
  assert.match(detailSource, /libraryNeedsReview[\s\S]*?Mark Reviewed/);
  assert.match(repairStyles, /\.repairMetadataButton\.needsMetadataRepair:not\(:disabled\)/);
  assert.match(repairStyles, /animation:\s*metadataRepairAttention/);
  assert.match(repairStyles, /needsMetadataRepair:not\(:disabled\):focus-visible[\s\S]*?outline:\s*3px/);
  assert.match(repairStyles, /prefers-reduced-motion:[\s\S]*?needsMetadataRepair/);
});

check('Home decision cards open from poster and copy clicks without hijacking actions', async () => {
  const dashboardSource = await source('src/pages/Dashboard.jsx');
  assert.doesNotMatch(dashboardSource, /event\.target\s*!==\s*event\.currentTarget/);
  assert.match(dashboardSource, /event\.target\?\.closest\?\.\('button, a, input, select, textarea, \[role="button"\]'\)/);
  assert.match(dashboardSource, /nestedControl\s*&&\s*nestedControl\s*!==\s*event\.currentTarget/);
  assert.match(dashboardSource, /homeDecisionContinue[\s\S]*?showOpenAction=\{false\}[\s\S]*?onOpen=\{\(\) => setSelected\?\.\(item\)\}/);
});

check('Details TV status navigation and desktop Continue Watching scrolling are explicit', async () => {
  const [detailSource, dashboardSource, tvFocusSource, homeStyles, tvStyles] = await Promise.all([
    source('src/components/DetailModal.jsx'),
    source('src/pages/Dashboard.jsx'),
    source('src/tv/tvFocusManager.js'),
    source('src/styles/joeai-home-v3.css'),
    source('src/styles/tv-focus.css')
  ]);
  assert.match(detailSource, /data-tv-detail-score="true"/);
  assert.match(detailSource, /data-tv-detail-status="true"/);
  assert.match(detailSource, /active === scoreSlider[\s\S]*?ArrowDown[\s\S]*?statusSelect/);
  assert.match(detailSource, /active === statusSelect[\s\S]*?ArrowDown[\s\S]*?rewatchDecrease/);
  assert.match(tvFocusSource, /active\.closest\('\[data-tv-detail-modal="true"\]'\)/);
  assert.match(dashboardSource, /continueWatchingRailRef/);
  assert.match(dashboardSource, /rail\.scrollBy\(\{ left: direction \* distance, behavior: 'smooth' \}\)/);
  assert.match(dashboardSource, /Scroll Continue Watching right/);
  assert.match(homeStyles, /\.homeDecisionPanelHeader \.homeDecisionScrollButton/);
  assert.match(homeStyles, /\.homeDecisionHome\s*\{[\s\S]*?overflow-x:\s*clip/);
  assert.match(homeStyles, /\.homeDecisionGrid\s*\{[\s\S]*?min-width:\s*0[\s\S]*?max-width:\s*100%/);
  assert.match(homeStyles, /\.homeDecisionRail\s*\{[\s\S]*?width:\s*100%[\s\S]*?min-width:\s*0[\s\S]*?overflow-x:\s*auto/);
  assert.match(tvStyles, /body\.tvLayoutMode \.homeDecisionScrollButton[\s\S]*?display:\s*none !important/);
  assert.match(tvStyles, /body\.tvLayoutMode \.homeDecisionContinue \.homeDecisionRail[\s\S]*?grid-auto-flow:\s*column !important[\s\S]*?grid-auto-columns:\s*calc\(\(100% - 40px\) \/ 6\) !important[\s\S]*?overflow-x:\s*auto !important/);
});

check('Details TV score editing cannot be overwritten by a stale save', async () => {
  const detailSource = await source('src/components/DetailModal.jsx');

  assert.match(detailSource, /scoreDraftRef\s*=\s*useRef/);
  assert.match(detailSource, /scoreSaveInFlightRef\s*=\s*useRef/);
  assert.match(detailSource, /scoreQueuedValueRef\s*=\s*useRef/);
  assert.match(detailSource, /if \(!scoreEditingRef\.current && !scoreSaveInFlightRef\.current\)/);
  assert.match(detailSource, /scoreQueuedValueRef\.current\s*=\s*nextScore/);
  assert.match(detailSource, /window\.setTimeout\([\s\S]*?commitScore\(\)[\s\S]*?,\s*350\)/);
  assert.match(detailSource, /onChange=\{changeScoreDraft\}/);
  assert.doesNotMatch(detailSource, /onKeyUp=\{commitScore\}/);
});

check('Discover mounts lazily, stays cached, and does no hidden-page work', async () => {
  const [appSource, discoverSource] = await Promise.all([
    source('src/App.jsx'),
    source('src/pages/Discover.jsx')
  ]);

  assert.match(appSource, /const \[discoverVisited, setDiscoverVisited\] = useState\(false\)/);
  assert.match(appSource, /if \(view === 'discover'\) setDiscoverVisited\(true\)/);
  assert.match(appSource, /\(view === 'discover' \|\| discoverVisited\)/);
  assert.match(appSource, /className="discoverKeepAlive"[\s\S]*?hidden=\{view !== 'discover'\}[\s\S]*?inert=\{view !== 'discover'/);
  assert.match(appSource, /<Discover[\s\S]*?active=\{view === 'discover'\}/);
  assert.match(discoverSource, /if \(!active \|\| renderStage >= DISCOVER_FINAL_STAGE\)/);
  assert.match(discoverSource, /if \(!active \|\| !catalogStageReady/);
  assert.match(discoverSource, /if \(!active\) return;[\s\S]*?if \(!refreshLiveDiscover\) return;/);
  assert.match(discoverSource, /if \(!previous\.active && !next\.active\) return true;/);
  assert.match(discoverSource, /previous\.active === next\.active/);
});

check('Android TV Home navigation covers every decision shelf', async () => {
  const [focusSource, tvStyles, mainSource, indexSource] = await Promise.all([
    source('src/tv/tvFocusManager.js'),
    source('src/styles/tv-focus.css'),
    source('src/main.jsx'),
    source('index.html')
  ]);
  for (const shelf of [
    'homeV3TvContinue',
    'homeDecisionReturning',
    'homeDecisionMissed',
    'homeDecisionServices',
    'homeDecisionQuickPick'
  ]) {
    assert.match(focusSource, new RegExp(`\\.${shelf} \\[data-tv-card="true"\\]`));
  }
  assert.match(tvStyles, /\.homeDecisionContinue\s*\{\s*order:\s*1/);
  assert.match(tvStyles, /\.homeDecisionQuickPick\s*\{\s*order:\s*5/);
  assert.match(tvStyles, /\.homeDecisionRail[\s\S]*?grid-template-columns:\s*repeat\(6,/);
  assert.match(focusSource, /moveInsideHomeDecisionCard/);
  assert.match(focusSource, /data-tv-home-action="true"/);
  assert.match(focusSource, /hero\.scrollIntoView\(\{ block: 'start', inline: 'nearest', behavior: 'smooth' \}\)/);
  assert.match(focusSource, /TV_PAGE_HERO_SELECTOR/);
  assert.match(focusSource, /revealFocusedPageHero\(active, event\.key\)/);
  for (const hero of [
    'homeV3Hero', 'libraryArchiveHeroLive', 'favoritesHero', 'discoverHero',
    'followingHero', 'joeAIHero', 'analyticsLabHero', 'upcomingHero',
    'settingsPageHeader', 'aboutHelpHero'
  ]) {
    assert.match(focusSource, new RegExp(`'\\.${hero}'`));
  }
  assert.match(focusSource, /discoverPage \.discoverHero[\s\S]*?block: 'start'/);
  assert.match(focusSource, /getBoundingClientRect\(\)/);
  assert.match(tvStyles, /\.homeDecisionCardActions[\s\S]*?display:\s*grid/);
  assert.match(tvStyles, /button\[aria-pressed="true"\][\s\S]*?box-shadow:/);
  assert.match(tvStyles, /button:focus-visible[\s\S]*?outline:/);
  assert.match(mainSource, /primeTvLayoutMode\(\)[\s\S]*?initializeTvFocusManager\(\)[\s\S]*?initializePlatformBridge\(\)[\s\S]*?createRoot/);
  assert.doesNotMatch(mainSource, /await initializePlatformBridge\(\)/);
  assert.match(indexSource, /joeanime-tv-layout-v1/);
  assert.match(indexSource, /livingRoomViewport/);
  assert.match(indexSource, /document\.body\.classList\.add\('tvLayoutMode', 'tvBootMode'\)/);
  assert.match(focusSource, /hasRememberedTvLayout\(\)/);
  assert.match(focusSource, /hasLivingRoomViewport\(\)/);
  assert.match(focusSource, /rememberTvLayout\(\)/);
  assert.match(tvStyles, /body\.tvLayoutMode \.bootScreen/);
});

check('Android TV layout is selected before the first React paint', async () => {
  const indexSource = await source('index.html');
  const bootstrapScript = indexSource.match(/<body>\s*<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(bootstrapScript, 'The pre-React TV bootstrap script is missing.');

  function bootClasses({ width, height, maxTouchPoints = 5, remembered = false }) {
    const bodyClasses = new Set();
    const htmlClasses = new Set();
    const storage = new MemoryStorage();
    if (remembered) storage.setItem('joeanime-tv-layout-v1', 'true');
    vm.runInNewContext(bootstrapScript, {
      navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 16; generic emulator)', maxTouchPoints },
      window: { innerWidth: width, innerHeight: height, screen: { width, height } },
      localStorage: storage,
      document: {
        body: { classList: { add: (...names) => names.forEach((name) => bodyClasses.add(name)) } },
        documentElement: { classList: { add: (...names) => names.forEach((name) => htmlClasses.add(name)) } }
      }
    });
    return { bodyClasses, htmlClasses };
  }

  const tv = bootClasses({ width: 1480, height: 830 });
  assert.ok(tv.bodyClasses.has('tvLayoutMode'));
  assert.ok(tv.bodyClasses.has('tvBootMode'));
  assert.ok(tv.htmlClasses.has('tvLayoutMode'));
  assert.equal(bootClasses({ width: 1280, height: 800 }).bodyClasses.has('tvLayoutMode'), false);
  assert.equal(bootClasses({ width: 915, height: 412 }).bodyClasses.has('tvLayoutMode'), false);
  assert.ok(bootClasses({ width: 1280, height: 800, remembered: true }).bodyClasses.has('tvLayoutMode'));
});

check('branded pre-React splash prevents a white Android startup frame', async () => {
  const [indexSource, androidStyles] = await Promise.all([
    source('index.html'),
    source('android/app/src/main/res/values/styles.xml')
  ]);
  assert.match(indexSource, /html, body \{[^}]*background: #050910/);
  assert.match(indexSource, /id="startup-splash" class="preReactSplash"/);
  assert.match(indexSource, /JOE<span>ANIME<\/span>DB/);
  assert.match(indexSource, /Remember every anime\./);
  assert.match(indexSource, /html\.tvLayoutMode \.preReactSplashCard/);
  assert.match(indexSource, /__JOEANIME_SPLASH_STARTED_AT__/);
  assert.match(androidStyles, /android:windowBackground">#050910/);
  assert.match(androidStyles, /postSplashScreenTheme">@style\/AppTheme\.NoActionBar/);
});

check('Home startup stays interactive while local and network enrichment completes', async () => {
  const [appSource, mainSource, dashboardSource, homeHookSource, libraryHookSource, focusSource, platformSource, posterSource, homeStyles, tvStyles] = await Promise.all([
    source('src/App.jsx'),
    source('src/main.jsx'),
    source('src/pages/Dashboard.jsx'),
    source('src/hooks/useHomeDecisionData.js'),
    source('src/hooks/useAnimeLibrary.js'),
    source('src/tv/tvFocusManager.js'),
    source('src/platform/initializePlatformBridge.js'),
    source('src/components/Poster.jsx'),
    source('src/styles/joeai-home-v3.css'),
    source('src/styles/tv-focus.css')
  ]);

  assert.doesNotMatch(appSource, /if\s*\(loading\)\s*return\s*\(/);
  assert.match(appSource, /className=\{`shell theme-\$\{theme\}\$\{loading \? ' appStarting' : ''\}`\}/);
  assert.match(appSource, /aria-busy=\{loading \? 'true' : undefined\}/);
  assert.match(appSource, /updateAnime=\{loading \? undefined : handleUpdateAnime\}/);
  assert.match(libraryHookSource, /readHomeBootstrapSnapshot\(\)/);
  assert.match(libraryHookSource, /setData\(loaded\);[\s\S]*?setLoading\(false\);[\s\S]*?deferUntilAfterFirstPaint/);
  assert.match(dashboardSource, /useState\(null\)[\s\S]*?deferUntilAfterFirstPaint[\s\S]*?getRecommendationContext/);
  assert.match(homeHookSource, /useState\(\[\]\)[\s\S]*?sequelCacheRead/);
  assert.match(homeHookSource, /deferUntilAfterFirstPaint[\s\S]*?kitsuRelationshipRefresh/);
  assert.match(homeHookSource, /getWatchmodeProviderCacheSnapshot\(\)/);
  assert.match(focusSource, /new MutationObserver/);
  assert.match(focusSource, /lastContentFocus\.isConnected/);
  assert.match(focusSource, /restoreHomeFocusAfterShelfRemoval/);
  assert.match(focusSource, /active\.closest\('\.homeDecisionHome'\) && candidate\.closest\('\.homeDecisionHome'\)/);
  assert.doesNotMatch(focusSource, /firstWatchingCard\.scrollIntoView/);
  assert.match(focusSource, /pendingInitialHomeFocus/);
  assert.match(focusSource, /if \(focusFirstContentControl\(\)\) pendingInitialHomeFocus = false/);
  assert.doesNotMatch(platformSource, /await CapacitorApp\.getInfo\(\)/);
  assert.match(platformSource, /void CapacitorApp\.getInfo\(\)[\s\S]*?\.then/);
  assert.match(mainSource, /STARTUP_SPLASH_MIN_MS\s*=\s*2500/);
  assert.match(mainSource, /STARTUP_SPLASH_MAX_MS\s*=\s*4500/);
  assert.match(mainSource, /homeReady \|\| elapsed\(\) >= STARTUP_SPLASH_MAX_MS/);
  assert.match(mainSource, /startupTasksAreSettled\(\)/);
  assert.match(homeHookSource, /deferUntilAfterFirstPaint/);
  assert.match(posterSource, /decoding="async"/);
  assert.match(homeStyles, /\.homeDecisionHero h1\s*\{[\s\S]*?-webkit-line-clamp:\s*3/);
  assert.match(tvStyles, /body\.tvLayoutMode \.homeDecisionHero h1\s*\{[\s\S]*?-webkit-line-clamp:\s*2/);
  assert.match(tvStyles, /body\.tvLayoutMode \.homeDecisionHome[\s\S]*?scroll-behavior:\s*auto/);
  assert.match(tvStyles, /body\.tvLayoutMode\.tvInputMode \.homeDecisionHome[\s\S]*?transform:\s*none/);
});

check('secondary Home work is deferred beyond the first paint and remains cancellable', () => {
  const originalFrame = globalThis.requestAnimationFrame;
  const originalCancelFrame = globalThis.cancelAnimationFrame;
  const originalIdle = globalThis.requestIdleCallback;
  const originalCancelIdle = globalThis.cancelIdleCallback;
  let frameCallback;
  let idleCallback;
  let runs = 0;

  globalThis.requestAnimationFrame = (callback) => {
    frameCallback = callback;
    return 11;
  };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.requestIdleCallback = (callback) => {
    idleCallback = callback;
    return 12;
  };
  globalThis.cancelIdleCallback = () => {};

  try {
    startupPerformance.deferUntilAfterFirstPaint(() => { runs += 1; });
    assert.equal(runs, 0);
    frameCallback();
    assert.equal(runs, 0);
    idleCallback();
    assert.equal(runs, 1);

    const cancel = startupPerformance.deferUntilAfterFirstPaint(() => { runs += 1; });
    cancel();
    frameCallback();
    assert.equal(runs, 1);
  } finally {
    globalThis.requestAnimationFrame = originalFrame;
    globalThis.cancelAnimationFrame = originalCancelFrame;
    globalThis.requestIdleCallback = originalIdle;
    globalThis.cancelIdleCallback = originalCancelIdle;
  }
});

check('cold Home bootstrap snapshot is small, immediate, and safe to replace', () => {
  localStorage.clear();
  const snapshot = libraryHook.writeHomeBootstrapSnapshot({
    anime: [{ id: 'watching', kitsuId: '101', title: 'Watching Now', status: 'Watching', watchedEpisodes: 4, privateNote: 'do not cache' }],
    catalog: [
      { id: 'followed', kitsuId: '201', title: 'Followed', followed: true },
      { id: 'not-followed', kitsuId: '202', title: 'Not Followed', followed: false }
    ],
    profile: { name: 'Joe' }
  });
  const restored = libraryHook.readHomeBootstrapSnapshot();

  assert.equal(snapshot.anime.length, 1);
  assert.equal(snapshot.catalog.length, 1);
  assert.equal(snapshot.anime[0].privateNote, undefined);
  assert.equal(restored.anime[0].status, 'Watching');
  assert.equal(restored.catalog[0].title, 'Followed');
});

check('offline Kitsu refresh retains stale direct-sequel results', async () => {
  localStorage.clear();
  const sourceId = '321';
  localStorage.setItem('joeanime-kitsu-continuations-v2', JSON.stringify({
    [sourceId]: {
      savedAt: Date.now() - (8 * 24 * 60 * 60 * 1000),
      items: [{
        id: 'kitsu-654', kitsuId: '654', title: 'Cached Direct Sequel',
        continuationAiringStatus: 'upcoming', continuationStartDate: '2026-12-01'
      }]
    }
  }));
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  globalThis.fetch = async () => { throw new Error('offline'); };
  console.warn = () => {};

  try {
    const results = await relationships.fetchContinuationTitles([
      { id: 'source', kitsuId: sourceId, title: 'Source', status: 'Completed' }
    ]);
    assert.deepEqual(results.map((item) => item.title), ['Cached Direct Sequel']);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

check('Android QR scanner declares camera permission', async () => {
  const manifestSource = await source('android/app/src/main/AndroidManifest.xml');
  assert.match(manifestSource, /android\.permission\.CAMERA/);
});

check('rolling backup replacement is wired for web and desktop', async () => {
  const [exportsSource, electronSource] = await Promise.all([
    source('src/platform/fileExports.js'),
    source('electron/main.cjs')
  ]);

  assert.match(exportsSource, /readStoredFileHandle\(ROLLING_BACKUP_HANDLE\)/);
  assert.match(exportsSource, /storeFileHandle\(ROLLING_BACKUP_HANDLE, handle\)/);
  assert.match(exportsSource, /await writeFileHandle\(handle, text\)/);
  assert.match(electronSource, /let filePath = readRollingBackupPath\(\)/);
  assert.match(electronSource, /rememberRollingBackupPath\(filePath\)/);
  assert.match(electronSource, /return writeBackupFile\(filePath, rawText\)/);
});

check('backup restore is wired on desktop, web, and Android', async () => {
  const [electronSource, repositorySource, mobileSource] = await Promise.all([
    source('electron/main.cjs'),
    source('src/repositories/animeRepository.js'),
    source('src/platform/mobileDatabase.js')
  ]);

  assert.match(electronSource, /ipcMain\.handle\('db:restoreBackup'/);
  assert.match(repositorySource, /async restoreBackup\(database = \{\}\)/);
  assert.match(mobileSource, /async restoreBackup\(snapshot = \{\}\)/);
});

check('Beta 22 version identity is consistent across platforms', async () => {
  const [androidSource, preloadSource, mainSource, viteSource, settingsSource, aboutSource] = await Promise.all([
    source('android/app/build.gradle'),
    source('electron/preload.cjs'),
    source('electron/main.cjs'),
    source('vite.config.js'),
    source('src/pages/PlaceholderPages.jsx'),
    source('src/pages/AboutHelpPage.jsx')
  ]);

  assert.equal(packageMetadata.version, '5.0.0-beta.22');
  assert.match(androidSource, /versionCode\s+5000022/);
  assert.match(androidSource, /versionName\s+"5\.0\.0-beta\.22"/);
  assert.doesNotMatch(preloadSource, /require\(['"]\.\.\/package\.json['"]\)/);
  assert.match(mainSource, /version:\s*app\.getVersion\(\)/);
  assert.match(viteSource, /__APP_VERSION__:\s*JSON\.stringify\(packageMetadata\.version\)/);
  assert.doesNotMatch(settingsSource, /data\?\.version\s*\|\|\s*'5\.0'/);
  assert.doesNotMatch(aboutSource, /data\?\.version\s*\|\|/);
});

check('desktop SQLite cannot be hidden by stale New User Mode', async () => {
  const libraryHookSource = await source('src/hooks/useAnimeLibrary.js');

  assert.match(
    libraryHookSource,
    /requestedNewUserMode\s*&&\s*!window\.JoeAnimeDB\?\.desktop/
  );
  assert.match(
    libraryHookSource,
    /requestedNewUserMode\s*&&\s*window\.JoeAnimeDB\?\.desktop/
  );
  assert.match(
    libraryHookSource,
    /localStorage\.removeItem\('joeanime-new-user-mode'\)/
  );
});

check('Electron preload boots in the sandbox and exposes SQLite', async () => {
  const preloadSource = await source('electron/preload.cjs');
  let exposed = null;
  const ipcRenderer = {
    invoke() {},
    on() {},
    removeListener() {}
  };

  vm.runInNewContext(preloadSource, {
    require(specifier) {
      assert.equal(specifier, 'electron', `Sandbox preload imported blocked module: ${specifier}`);
      return {
        contextBridge: {
          exposeInMainWorld(name, value) {
            exposed = { name, value };
          }
        },
        ipcRenderer
      };
    }
  });

  assert.equal(exposed?.name, 'JoeAnimeDB');
  assert.equal(exposed?.value?.desktop, true);
  assert.equal(typeof exposed?.value?.database?.init, 'function');
  assert.equal(typeof exposed?.value?.database?.getDatabase, 'function');
});

function lineNumber(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

function buttonTags(text) {
  const tags = [];
  let index = 0;

  while ((index = text.indexOf('<button', index)) >= 0) {
    const start = index;
    let quote = '';
    let braceDepth = 0;
    index += '<button'.length;

    for (; index < text.length; index += 1) {
      const character = text[index];
      const previous = text[index - 1];

      if (quote) {
        if (character === quote && previous !== '\\') quote = '';
        continue;
      }
      if (character === '"' || character === "'" || character === '`') {
        quote = character;
        continue;
      }
      if (character === '{') braceDepth += 1;
      else if (character === '}') braceDepth = Math.max(0, braceDepth - 1);
      else if (character === '>' && braceDepth === 0) {
        tags.push({ start, text: text.slice(start, index + 1) });
        index += 1;
        break;
      }
    }
  }

  return tags;
}

async function jsxFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await jsxFiles(target));
    else if (entry.isFile() && entry.name.endsWith('.jsx')) files.push(target);
  }
  return files;
}

check('visible HTML buttons have an explicit effect', async () => {
  const files = await jsxFiles(path.join(root, 'src'));
  const missing = [];
  let total = 0;

  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const tag of buttonTags(text)) {
      total += 1;
      const disabled = /\bdisabled(?:\s|=|>)/.test(tag.text);
      const effect = /\bon(?:Click|PointerDown|MouseDown|TouchStart|KeyDown)\s*=/.test(tag.text)
        || /\btype\s*=\s*["']submit["']/.test(tag.text);
      if (!disabled && !effect) {
        missing.push(`${path.relative(root, file)}:${lineNumber(text, tag.start)}`);
      }
    }
  }

  assert.ok(total > 0, 'No HTML buttons were found.');
  assert.deepEqual(missing, [], `Buttons without an explicit effect: ${missing.join(', ')}`);
  console.log(`[info] Audited ${total} HTML buttons across ${files.length} JSX files.`);
});

if (process.argv.includes('--live')) {
  check('live Where to Watch proxy returns usable providers', async () => {
    const url = new URL('https://joeanimedb.com/api/watchmode');
    url.searchParams.set('title', 'Bleach');
    url.searchParams.set('year', '2004');
    url.searchParams.set('type', 'TV');
    url.searchParams.set('region', 'US');

    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const payload = await response.json();
    assert.equal(response.ok, true, payload.error || `HTTP ${response.status}`);
    assert.equal(payload.status, 'ready');
    assert.ok(Array.isArray(payload.providers) && payload.providers.length > 0);
    payload.providers.forEach((provider) => assert.match(String(provider.url || ''), /^https:\/\//));
  });
}

let failures = 0;
for (const { name, operation } of checks) {
  try {
    await operation();
    console.log(`[ok] ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`[fail] ${name}`);
    console.error(error?.stack || error);
  }
}

await viteTestServer.close();

if (failures) {
  console.error(`\nBeta 22 release gate failed: ${failures} check(s).`);
  process.exitCode = 1;
} else {
  console.log(`\nBeta 22 automated release gate passed: ${checks.length} checks.`);
}
