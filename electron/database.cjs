const path = require('path');
const Database = require('better-sqlite3');

let db = null;
let dbPath = null;

function encodeList(value) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

function decodeList(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function decodeJson(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function titleKey(title = '') {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}


function debugAnimeRow(item = {}) {
  return {
    id: item.id ?? null,
    title: item.title || '',
    malId: item.malId ?? item.mal_id ?? null,
    kitsuId: item.kitsuId ?? item.kitsu_id ?? null
  };
}

function getDuplicateMalIdGroups() {
  return db.prepare(`
    SELECT malId, COUNT(*) AS count, GROUP_CONCAT(id, ' | ') AS ids, GROUP_CONCAT(title, ' | ') AS titles
    FROM anime
    WHERE malId IS NOT NULL AND malId != ''
    GROUP BY malId
    HAVING COUNT(*) > 1
    ORDER BY count DESC, malId
  `).all();
}

function animeToRow(item) {
  return {
    id: String(item.id),
    malId: item.malId ?? item.mal_id ?? null,
    kitsuId: item.kitsuId ?? item.kitsu_id ?? null,
    title: item.title || '',
    officialTitle: item.officialTitle || item.title || '',
    titleSynonyms: encodeList(item.titleSynonyms || item.synonyms),
    canonicalTitleVersion: item.canonicalTitleVersion ?? 0,
    type: item.type || '',
    year: item.year ?? null,
    episodes: item.episodes ?? item.episodeCount ?? null,
    studio: item.studio || '',
    genres: encodeList(item.genres),
    cover: item.cover || '',
    synopsis: item.synopsis || '',
    malScore: item.malScore ?? item.communityScore ?? null,
    joeScore: item.joeScore ?? null,
    finalRank: item.finalRank ?? null,
    rewatches: item.rewatches ?? 0,
    status: item.status || '',
    favorite: item.favorite ? 1 : 0,
    notes: item.notes || '',
    payload: JSON.stringify(item || {}),
    updatedAt: new Date().toISOString()
  };
}

function rowToAnime(row) {
  const payload = decodeJson(row.payload, {});
  return {
    ...payload,
    id: row.id,
    malId: row.malId,
    kitsuId: row.kitsuId || payload?.kitsuId || payload?.kitsu_id || '',
    title: row.title,
    officialTitle: row.officialTitle || row.title,
    titleSynonyms: decodeList(row.titleSynonyms),
    canonicalTitleVersion: row.canonicalTitleVersion || 0,
    type: row.type,
    year: row.year,
    episodes: row.episodes,
    episodeCount: row.episodes,
    studio: row.studio,
    genres: decodeList(row.genres),
    cover: row.cover,
    synopsis: row.synopsis,
    malScore: row.malScore,
    communityScore: row.malScore,
    joeScore: row.joeScore,
    finalRank: row.finalRank,
    rewatches: row.rewatches || 0,
    status: row.status || '',
    favorite: Boolean(row.favorite),
    notes: row.notes || '',
    updatedAt: row.updatedAt
  };
}

function catalogToRow(item) {
  return {
    id: String(item.id || `catalog-${titleKey(item.title)}`),
    title: item.title || '',
    titleKey: titleKey(item.title),
    type: item.type || '',
    year: item.year ?? null,
    episodes: item.episodes ?? item.episodeCount ?? null,
    studio: item.studio || '',
    genres: encodeList(item.genres),
    themes: encodeList(item.themes),
    source: item.source || '',
    cover: item.cover || '',
    synopsis: item.synopsis || '',
    malId: item.malId ?? null,
    kitsuId: item.kitsuId ?? item.kitsu_id ?? null,
    malScore: item.malScore ?? item.communityScore ?? null,
    popularity: item.popularity ?? null,
    members: item.members ?? item.memberCount ?? item.popularityMembers ?? null,
    followed: item.followed ? 1 : 0,
    ignored: item.ignored ? 1 : 0,
    followedAt: item.followedAt || null,
    listUpdatedAt: item.listUpdatedAt || null,
    payload: JSON.stringify(item || {}),
    updatedAt: new Date().toISOString()
  };
}

function rowToCatalogAnime(row) {
  const payload = decodeJson(row.payload, {});
  return {
    ...payload,
    id: row.id,
    title: row.title,
    titleKey: row.titleKey,
    type: row.type,
    year: row.year,
    episodes: row.episodes,
    episodeCount: row.episodes,
    studio: row.studio,
    genres: decodeList(row.genres),
    themes: decodeList(row.themes),
    source: row.source || '',
    cover: row.cover,
    synopsis: row.synopsis,
    malId: row.malId,
    kitsuId: row.kitsuId || payload?.kitsuId || payload?.kitsu_id || '',
    malScore: row.malScore,
    communityScore: row.malScore,
    popularity: row.popularity,
    followed: Boolean(row.followed),
    ignored: Boolean(row.ignored),
    followedAt: row.followedAt || '',
    listUpdatedAt: row.listUpdatedAt || '',
    updatedAt: row.updatedAt
  };
}

function feedbackToRow(entry = {}) {
  const createdAt = entry.createdAt || new Date().toISOString();
  return {
    id: String(entry.id || `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
    animeKey: String(entry.animeKey || titleKey(entry.title)),
    title: entry.title || '',
    action: entry.action || 'maybe_later',
    reason: entry.reason || '',
    traits: encodeList(entry.traits),
    sourcePrompt: entry.sourcePrompt || '',
    algorithmVersion: entry.algorithmVersion || 'joeai-intelligence-v1',
    predictedMatch: entry.predictedMatch ?? null,
    createdAt
  };
}

function rowToFeedback(row = {}) {
  return {
    id: row.id,
    animeKey: row.animeKey,
    title: row.title,
    action: row.action,
    reason: row.reason || '',
    traits: decodeList(row.traits),
    sourcePrompt: row.sourcePrompt || '',
    algorithmVersion: row.algorithmVersion || '',
    predictedMatch: row.predictedMatch,
    createdAt: row.createdAt
  };
}

function rowToPreference(row = {}) {
  return {
    key: row.key,
    value: decodeJson(row.value, row.value),
    weight: Number(row.weight ?? 1),
    source: row.source || '',
    updatedAt: row.updatedAt
  };
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS anime (
      id TEXT PRIMARY KEY,
      malId INTEGER,
      kitsuId TEXT,
      title TEXT NOT NULL,
      officialTitle TEXT,
      titleSynonyms TEXT,
      canonicalTitleVersion INTEGER DEFAULT 0,
      type TEXT,
      year INTEGER,
      episodes INTEGER,
      studio TEXT,
      genres TEXT,
      cover TEXT,
      synopsis TEXT,
      malScore REAL,
      joeScore REAL,
      finalRank INTEGER,
      rewatches INTEGER DEFAULT 0,
      status TEXT DEFAULT '',
      favorite INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      payload TEXT DEFAULT '{}',
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS anime_catalog (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      titleKey TEXT UNIQUE,
      type TEXT,
      year INTEGER,
      episodes INTEGER,
      studio TEXT,
      genres TEXT,
      themes TEXT,
      source TEXT,
      cover TEXT,
      synopsis TEXT,
      malId INTEGER,
      kitsuId TEXT,
      malScore REAL,
      popularity INTEGER,
      members INTEGER,
      followed INTEGER DEFAULT 0,
      ignored INTEGER DEFAULT 0,
      followedAt TEXT,
      listUpdatedAt TEXT,
      payload TEXT DEFAULT '{}',
      updatedAt TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_anime_catalog_title ON anime_catalog(title);
    CREATE INDEX IF NOT EXISTS idx_anime_catalog_title_key ON anime_catalog(titleKey);
    CREATE INDEX IF NOT EXISTS idx_anime_catalog_studio ON anime_catalog(studio);
    CREATE INDEX IF NOT EXISTS idx_anime_catalog_year ON anime_catalog(year);

    CREATE TABLE IF NOT EXISTS joeai_feedback (
      id TEXT PRIMARY KEY,
      animeKey TEXT NOT NULL,
      title TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT DEFAULT '',
      traits TEXT DEFAULT '[]',
      sourcePrompt TEXT DEFAULT '',
      algorithmVersion TEXT DEFAULT 'joeai-intelligence-v1',
      predictedMatch REAL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS joeai_preferences (
      key TEXT PRIMARY KEY,
      value TEXT,
      weight REAL DEFAULT 1,
      source TEXT DEFAULT '',
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS joeai_conversation_state (
      id TEXT PRIMARY KEY,
      payload TEXT DEFAULT '{}',
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_joeai_feedback_anime_key ON joeai_feedback(animeKey);
    CREATE INDEX IF NOT EXISTS idx_joeai_feedback_created_at ON joeai_feedback(createdAt);
  `);

  const animeColumns = new Set(
    db.prepare(`PRAGMA table_info(anime)`).all().map((column) => column.name)
  );

  const addAnimeColumn = (name, definition) => {
    if (!animeColumns.has(name)) {
      db.exec(`ALTER TABLE anime ADD COLUMN ${name} ${definition}`);
      animeColumns.add(name);
    }
  };

  addAnimeColumn('malId', 'INTEGER');
  addAnimeColumn('kitsuId', 'TEXT');
  addAnimeColumn('officialTitle', 'TEXT');
  addAnimeColumn('titleSynonyms', 'TEXT');
  addAnimeColumn('canonicalTitleVersion', 'INTEGER DEFAULT 0');
  addAnimeColumn('payload', `TEXT DEFAULT '{}'`);

  db.exec('CREATE INDEX IF NOT EXISTS idx_anime_mal_id ON anime(malId)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_anime_kitsu_id ON anime(kitsuId)');

  const columns = new Set(
    db.prepare(`PRAGMA table_info(anime_catalog)`).all().map((column) => column.name)
  );

  const addColumn = (name, definition) => {
    if (!columns.has(name)) {
      db.exec(`ALTER TABLE anime_catalog ADD COLUMN ${name} ${definition}`);
      columns.add(name);
    }
  };

  addColumn('members', 'INTEGER');
  addColumn('kitsuId', 'TEXT');
  addColumn('followed', 'INTEGER DEFAULT 0');
  addColumn('ignored', 'INTEGER DEFAULT 0');
  addColumn('followedAt', 'TEXT');
  addColumn('listUpdatedAt', 'TEXT');
  addColumn('payload', `TEXT DEFAULT '{}'`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_anime_catalog_kitsu_id ON anime_catalog(kitsuId)');
}

async function initDatabase(userDataPath, seedDatabase) {
  if (db) return getDatabase();

  dbPath = path.join(userDataPath, 'JoeAnime.db');
  db = new Database(dbPath);

  createTables();

  const count = db.prepare('SELECT COUNT(*) AS count FROM anime').get().count;

  if (count === 0 && seedDatabase?.anime?.length) {
    replaceAll(seedDatabase.anime);
  }

  if (seedDatabase?.catalog?.length) {
    importCatalog(seedDatabase.catalog);
  }

  return getDatabase();
}

function getAll() {
  return db
    .prepare('SELECT * FROM anime ORDER BY finalRank IS NULL, finalRank, title')
    .all()
    .map(rowToAnime);
}

function getCatalog() {
  return db
    .prepare('SELECT * FROM anime_catalog ORDER BY title')
    .all()
    .map(rowToCatalogAnime);
}

function getJoeAIFeedback() {
  return db
    .prepare('SELECT * FROM joeai_feedback ORDER BY createdAt DESC')
    .all()
    .map(rowToFeedback);
}

function getJoeAIPreferences() {
  return db
    .prepare('SELECT * FROM joeai_preferences ORDER BY key')
    .all()
    .map(rowToPreference);
}

function emptyJoeAIConversation() {
  return {
    lastRecommendations: [],
    lastReferencedTitle: '',
    lastPrompt: ''
  };
}

function getJoeAIConversationContext() {
  const row = db
    .prepare(`SELECT payload, updatedAt FROM joeai_conversation_state WHERE id = 'active'`)
    .get();
  const payload = decodeJson(row?.payload, emptyJoeAIConversation());

  return {
    ...emptyJoeAIConversation(),
    ...(payload && typeof payload === 'object' ? payload : {}),
    updatedAt: row?.updatedAt || ''
  };
}

function getJoeAIState() {
  return {
    feedback: getJoeAIFeedback(),
    preferences: getJoeAIPreferences(),
    conversation: getJoeAIConversationContext()
  };
}

function getDatabase() {
  return {
    version: '5.0-joeai-intelligence',
    engine: 'SQLite/better-sqlite3',
    path: dbPath,
    anime: getAll(),
    catalog: getCatalog(),
    joeAI: getJoeAIState()
  };
}

function recordJoeAIFeedback(entry = {}) {
  const row = feedbackToRow(entry);
  if (!row.animeKey || !row.title || !row.action) return getJoeAIState();

  db.prepare(`
    INSERT INTO joeai_feedback (
      id, animeKey, title, action, reason, traits, sourcePrompt,
      algorithmVersion, predictedMatch, createdAt
    ) VALUES (
      @id, @animeKey, @title, @action, @reason, @traits, @sourcePrompt,
      @algorithmVersion, @predictedMatch, @createdAt
    )
    ON CONFLICT(id) DO UPDATE SET
      animeKey=excluded.animeKey,
      title=excluded.title,
      action=excluded.action,
      reason=excluded.reason,
      traits=excluded.traits,
      sourcePrompt=excluded.sourcePrompt,
      algorithmVersion=excluded.algorithmVersion,
      predictedMatch=excluded.predictedMatch,
      createdAt=excluded.createdAt
  `).run(row);

  return getJoeAIState();
}

function setJoeAIPreference(preference = {}) {
  const key = String(preference.key || '').trim();
  if (!key) return getJoeAIState();

  db.prepare(`
    INSERT INTO joeai_preferences (key, value, weight, source, updatedAt)
    VALUES (@key, @value, @weight, @source, @updatedAt)
    ON CONFLICT(key) DO UPDATE SET
      value=excluded.value,
      weight=excluded.weight,
      source=excluded.source,
      updatedAt=excluded.updatedAt
  `).run({
    key,
    value: JSON.stringify(preference.value ?? true),
    weight: Number(preference.weight ?? 1),
    source: preference.source || 'JoeAI teaching',
    updatedAt: preference.updatedAt || new Date().toISOString()
  });

  return getJoeAIState();
}

function deleteJoeAIFeedback(id = '') {
  const cleanId = String(id || '').trim();
  if (cleanId) {
    db.prepare('DELETE FROM joeai_feedback WHERE id = ?').run(cleanId);
  }
  return getJoeAIState();
}

function deleteJoeAIPreference(key = '') {
  const cleanKey = String(key || '').trim();
  if (cleanKey) {
    db.prepare('DELETE FROM joeai_preferences WHERE key = ?').run(cleanKey);
  }
  return getJoeAIState();
}

function resetJoeAILearning() {
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM joeai_feedback').run();
    db.prepare('DELETE FROM joeai_preferences').run();
  });
  transaction();
  return getJoeAIState();
}

function setJoeAIConversationContext(context = {}) {
  const updatedAt = new Date().toISOString();
  const payload = {
    lastRecommendations: Array.isArray(context.lastRecommendations)
      ? context.lastRecommendations.slice(0, 10)
      : [],
    lastReferencedTitle: String(context.lastReferencedTitle || ''),
    lastPrompt: String(context.lastPrompt || '')
  };

  db.prepare(`
    INSERT INTO joeai_conversation_state (id, payload, updatedAt)
    VALUES ('active', @payload, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      payload=excluded.payload,
      updatedAt=excluded.updatedAt
  `).run({
    payload: JSON.stringify(payload),
    updatedAt
  });

  return getJoeAIState();
}

function clearJoeAIConversationContext() {
  db.prepare(`DELETE FROM joeai_conversation_state WHERE id = 'active'`).run();
  return getJoeAIState();
}

function chooseUserValue(primary, secondary, fallback) {
  if (primary !== undefined && primary !== null && primary !== '') return primary;
  if (secondary !== undefined && secondary !== null && secondary !== '') return secondary;
  return fallback;
}

function mergeDuplicateAnime(existingRows = [], incoming = {}) {
  const existingAnime = existingRows.map(rowToAnime);

  const bestExisting = existingAnime
    .sort((a, b) => {
      const aSignals =
        Number(a.joeScore > 0) * 8 +
        Number(Boolean(a.favorite)) * 5 +
        Number(Boolean(a.status)) * 4 +
        Number(Boolean(a.notes)) * 3 +
        Number(a.rewatches || 0) * 2;
      const bSignals =
        Number(b.joeScore > 0) * 8 +
        Number(Boolean(b.favorite)) * 5 +
        Number(Boolean(b.status)) * 4 +
        Number(Boolean(b.notes)) * 3 +
        Number(b.rewatches || 0) * 2;
      return bSignals - aSignals;
    })[0] || {};

  return {
    ...bestExisting,
    ...incoming,

    // Identity and canonical display data come from current metadata.
    id: bestExisting.id || incoming.id,
    malId: incoming.malId ?? bestExisting.malId ?? null,
    kitsuId: incoming.kitsuId ?? incoming.kitsu_id ?? bestExisting.kitsuId ?? null,
    title: incoming.title || incoming.officialTitle || bestExisting.title || '',
    officialTitle:
      incoming.officialTitle ||
      incoming.title ||
      bestExisting.officialTitle ||
      bestExisting.title ||
      '',
    titleSynonyms: [
      ...new Set([
        ...(bestExisting.titleSynonyms || []),
        ...(incoming.titleSynonyms || []),
        bestExisting.title
      ].filter(Boolean))
    ],

    // User-authored/personal fields must never be lost during migration.
    joeScore: chooseUserValue(incoming.joeScore, bestExisting.joeScore, null),
    finalRank: chooseUserValue(incoming.finalRank, bestExisting.finalRank, null),
    rewatches: Math.max(
      Number(incoming.rewatches || 0),
      Number(bestExisting.rewatches || 0)
    ),
    status: chooseUserValue(incoming.status, bestExisting.status, ''),
    favorite: Boolean(incoming.favorite || bestExisting.favorite),
    notes: chooseUserValue(incoming.notes, bestExisting.notes, '')
  };
}

function upsertAnime(item) {
  const incomingMalId = item.malId ?? item.mal_id ?? null;
  const incomingKitsuId = item.kitsuId ?? item.kitsu_id ?? null;
  const countBefore = db.prepare('SELECT COUNT(*) AS count FROM anime').get().count;
  let duplicateRows = [];

  if (incomingKitsuId !== null && incomingKitsuId !== undefined && incomingKitsuId !== '') {
    duplicateRows = db
      .prepare('SELECT * FROM anime WHERE kitsuId = ? OR id = ?')
      .all(String(incomingKitsuId), String(item.id));
  } else if (incomingMalId !== null && incomingMalId !== undefined && incomingMalId !== '') {
    duplicateRows = db
      .prepare('SELECT * FROM anime WHERE malId = ? OR id = ?')
      .all(incomingMalId, String(item.id));
  } else {
    duplicateRows = db
      .prepare('SELECT * FROM anime WHERE id = ?')
      .all(String(item.id));
  }

  console.group(`[Mr Bug][SQLite upsert] ${item.title || item.id}`);
  console.log('DATABASE BEFORE UPSERT', {
    count: countBefore,
    incoming: debugAnimeRow(item),
    matchedRows: duplicateRows.length,
    duplicateMalIdGroups: getDuplicateMalIdGroups()
  });
  console.table(duplicateRows.map(debugAnimeRow));

  if (duplicateRows.length > 1) {
    console.error('[Mr Bug] MULTIPLE DATABASE ROWS MATCHED ONE REPAIR', {
      incoming: debugAnimeRow(item),
      matches: duplicateRows.map(debugAnimeRow)
    });
  }

  const mergedItem = mergeDuplicateAnime(duplicateRows, item);
  const row = animeToRow(mergedItem);
  console.log('MERGED ROW', debugAnimeRow(row));

  const transaction = db.transaction(() => {
    if (row.kitsuId !== null && row.kitsuId !== undefined && row.kitsuId !== '') {
      db.prepare('DELETE FROM anime WHERE kitsuId = ? AND id != ?')
        .run(String(row.kitsuId), row.id);
    }

    // Once MAL identity is known, collapse every duplicate row into one record.
    if (row.malId !== null && row.malId !== undefined && row.malId !== '') {
      const rowsAboutToDelete = db
        .prepare('SELECT * FROM anime WHERE malId = ? AND id != ?')
        .all(row.malId, row.id);

      console.log('DELETE CHECK', {
        malId: row.malId,
        keepId: row.id,
        rowsAboutToDelete: rowsAboutToDelete.map(debugAnimeRow)
      });

      if (rowsAboutToDelete.length) {
        console.error('[Mr Bug] DELETE IS ABOUT TO REMOVE EXISTING LIBRARY ROWS', {
          keeping: debugAnimeRow(row),
          deleting: rowsAboutToDelete.map(debugAnimeRow)
        });
      }

      const deleteResult = db
        .prepare('DELETE FROM anime WHERE malId = ? AND id != ?')
        .run(row.malId, row.id);

      console.log('DELETE RESULT', {
        changes: deleteResult.changes,
        malId: row.malId,
        keepId: row.id
      });
    }

    db.prepare(`
      INSERT INTO anime (
        id, malId, kitsuId, title, officialTitle, titleSynonyms, canonicalTitleVersion,
        type, year, episodes, studio, genres, cover, synopsis,
        malScore, joeScore, finalRank, rewatches, status, favorite, notes, payload, updatedAt
      ) VALUES (
        @id, @malId, @kitsuId, @title, @officialTitle, @titleSynonyms, @canonicalTitleVersion,
        @type, @year, @episodes, @studio, @genres, @cover, @synopsis,
        @malScore, @joeScore, @finalRank, @rewatches, @status, @favorite, @notes, @payload, @updatedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        malId=excluded.malId,
        kitsuId=excluded.kitsuId,
        title=excluded.title,
        officialTitle=excluded.officialTitle,
        titleSynonyms=excluded.titleSynonyms,
        canonicalTitleVersion=excluded.canonicalTitleVersion,
        type=excluded.type,
        year=excluded.year,
        episodes=excluded.episodes,
        studio=excluded.studio,
        genres=excluded.genres,
        cover=excluded.cover,
        synopsis=excluded.synopsis,
        malScore=excluded.malScore,
        joeScore=excluded.joeScore,
        finalRank=excluded.finalRank,
        rewatches=excluded.rewatches,
        status=excluded.status,
        favorite=excluded.favorite,
        notes=excluded.notes,
        payload=excluded.payload,
        updatedAt=excluded.updatedAt
    `).run(row);
  });

  transaction();

  const countAfter = db.prepare('SELECT COUNT(*) AS count FROM anime').get().count;
  const savedRow = db.prepare('SELECT * FROM anime WHERE id = ?').get(row.id);
  console.log('DATABASE AFTER UPSERT', {
    count: countAfter,
    delta: countAfter - countBefore,
    saved: savedRow ? debugAnimeRow(savedRow) : null,
    duplicateMalIdGroups: getDuplicateMalIdGroups()
  });

  if (countAfter < countBefore) {
    console.error('[Mr Bug] LIBRARY COUNT SHRANK DURING SQLITE UPSERT', {
      before: countBefore,
      after: countAfter,
      delta: countAfter - countBefore,
      incoming: debugAnimeRow(item),
      saved: savedRow ? debugAnimeRow(savedRow) : null
    });
  }

  console.groupEnd();
  return rowToAnime(savedRow);
}

function upsertCatalogAnime(item) {
  const incoming = catalogToRow(item);
  let existingRow = null;

  if (incoming.kitsuId) {
    existingRow = db.prepare('SELECT * FROM anime_catalog WHERE kitsuId = ?').get(incoming.kitsuId);
  }
  if (!existingRow && incoming.malId) {
    existingRow = db.prepare('SELECT * FROM anime_catalog WHERE malId = ?').get(incoming.malId);
  }
  if (!existingRow) {
    existingRow = db.prepare('SELECT * FROM anime_catalog WHERE id = ? OR titleKey = ?')
      .get(incoming.id, incoming.titleKey);
  }

  const existing = existingRow ? rowToCatalogAnime(existingRow) : {};
  const incomingHasListUpdate = Boolean(item.listUpdatedAt);
  const merged = {
    ...existing,
    ...item,
    id: existingRow?.id || item.id,
    kitsuId: item.kitsuId || item.kitsu_id || existing.kitsuId || null,
    followed: incomingHasListUpdate
      ? Boolean(item.followed)
      : Boolean(existing.followed || item.followed),
    ignored: incomingHasListUpdate
      ? Boolean(item.ignored)
      : Boolean(existing.ignored || item.ignored),
    followedAt: incomingHasListUpdate
      ? (item.followedAt || '')
      : (existing.followedAt || item.followedAt || ''),
    listUpdatedAt: incomingHasListUpdate
      ? item.listUpdatedAt
      : (existing.listUpdatedAt || null),
    followingSnapshot: item.followingSnapshot || existing.followingSnapshot,
    followingEvents: item.followingEvents || existing.followingEvents || [],
    followingLastCheckedAt:
      item.followingLastCheckedAt || existing.followingLastCheckedAt || '',
    followingCheckError:
      item.followingCheckError ?? existing.followingCheckError ?? ''
  };
  const row = catalogToRow(merged);

  // Kitsu may adjust a display title. Retaining the established database key
  // keeps follows, cached releases, and update history on the same row.
  if (existingRow) row.titleKey = existingRow.titleKey;

  if (!row.title || !row.titleKey) return null;

  db.prepare(`
    INSERT INTO anime_catalog (
      id, title, titleKey, type, year, episodes, studio, genres, themes,
      source, cover, synopsis, malId, kitsuId, malScore, popularity, members,
      followed, ignored, followedAt, listUpdatedAt, payload, updatedAt
    ) VALUES (
      @id, @title, @titleKey, @type, @year, @episodes, @studio, @genres, @themes,
      @source, @cover, @synopsis, @malId, @kitsuId, @malScore, @popularity, @members,
      @followed, @ignored, @followedAt, @listUpdatedAt, @payload, @updatedAt
    )
    ON CONFLICT(titleKey) DO UPDATE SET
      title=COALESCE(NULLIF(excluded.title, ''), anime_catalog.title),
      type=COALESCE(NULLIF(excluded.type, ''), anime_catalog.type),
      year=COALESCE(excluded.year, anime_catalog.year),
      episodes=COALESCE(excluded.episodes, anime_catalog.episodes),
      studio=COALESCE(NULLIF(excluded.studio, ''), anime_catalog.studio),
      genres=CASE WHEN excluded.genres != '[]' THEN excluded.genres ELSE anime_catalog.genres END,
      themes=CASE WHEN excluded.themes != '[]' THEN excluded.themes ELSE anime_catalog.themes END,
      source=COALESCE(NULLIF(excluded.source, ''), anime_catalog.source),
      cover=COALESCE(NULLIF(excluded.cover, ''), anime_catalog.cover),
      synopsis=COALESCE(NULLIF(excluded.synopsis, ''), anime_catalog.synopsis),
      malId=COALESCE(excluded.malId, anime_catalog.malId),
      kitsuId=COALESCE(excluded.kitsuId, anime_catalog.kitsuId),
      malScore=COALESCE(excluded.malScore, anime_catalog.malScore),
      popularity=COALESCE(excluded.popularity, anime_catalog.popularity),
      members=COALESCE(excluded.members, anime_catalog.members),
      followed=CASE
        WHEN excluded.listUpdatedAt IS NOT NULL THEN excluded.followed
        ELSE anime_catalog.followed
      END,
      ignored=CASE
        WHEN excluded.listUpdatedAt IS NOT NULL THEN excluded.ignored
        ELSE anime_catalog.ignored
      END,
      followedAt=CASE
        WHEN excluded.listUpdatedAt IS NOT NULL THEN excluded.followedAt
        ELSE anime_catalog.followedAt
      END,
      listUpdatedAt=COALESCE(excluded.listUpdatedAt, anime_catalog.listUpdatedAt),
      payload=excluded.payload,
      updatedAt=excluded.updatedAt
  `).run(row);

  return rowToCatalogAnime(
    db.prepare('SELECT * FROM anime_catalog WHERE titleKey = ?').get(row.titleKey)
  );
}

function importCatalog(catalog) {
  const library = getAll();
  const libraryTitleKeys = new Set(library.map((item) => titleKey(item.title)));
  const libraryKitsuIds = new Set(
    library.map((item) => String(item.kitsuId || '')).filter(Boolean)
  );
  const libraryMalIds = new Set(
    library.map((item) => String(item.malId || '')).filter(Boolean)
  );

  const transaction = db.transaction((items) => {
    for (const item of items || []) {
      const key = titleKey(item.title);
      const kitsuId = String(item.kitsuId || item.kitsu_id || '');
      const malId = String(item.malId || item.mal_id || '');
      if (
        !key ||
        libraryTitleKeys.has(key) ||
        (kitsuId && libraryKitsuIds.has(kitsuId)) ||
        (malId && libraryMalIds.has(malId))
      ) continue;
      upsertCatalogAnime(item);
    }
  });

  transaction(catalog);
  return getDatabase();
}

function replaceAll(anime) {
  const transaction = db.transaction((items) => {
    db.prepare('DELETE FROM anime').run();
    for (const item of items || []) upsertAnime(item);
  });

  transaction(anime);
  return getDatabase();
}

function restoreDatabase(snapshot = {}) {
  const anime = Array.isArray(snapshot.anime) ? snapshot.anime : [];
  const catalog = Array.isArray(snapshot.catalog) ? snapshot.catalog : [];
  const joeAI = snapshot.joeAI && typeof snapshot.joeAI === 'object'
    ? snapshot.joeAI
    : {};

  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM anime').run();
    db.prepare('DELETE FROM anime_catalog').run();
    db.prepare('DELETE FROM joeai_feedback').run();
    db.prepare('DELETE FROM joeai_preferences').run();
    db.prepare('DELETE FROM joeai_conversation_state').run();

    anime.forEach((item) => upsertAnime(item));
    catalog.forEach((item) => upsertCatalogAnime(item));
    (Array.isArray(joeAI.feedback) ? joeAI.feedback : []).forEach((entry) =>
      recordJoeAIFeedback(entry)
    );
    (Array.isArray(joeAI.preferences) ? joeAI.preferences : []).forEach((entry) =>
      setJoeAIPreference(entry)
    );

    if (joeAI.conversation && typeof joeAI.conversation === 'object') {
      setJoeAIConversationContext(joeAI.conversation);
    }
  });

  transaction();
  return getDatabase();
}

async function backupDatabase(destination) {
  if (!db || !destination) throw new Error('Database backup destination is unavailable.');
  await db.backup(destination);
  return destination;
}

function reset(seedDatabase) {
  replaceAll(seedDatabase?.anime || []);
  db.prepare('DELETE FROM joeai_feedback').run();
  db.prepare('DELETE FROM joeai_preferences').run();
  db.prepare('DELETE FROM joeai_conversation_state').run();
  db.prepare('DELETE FROM anime_catalog').run();

  if (seedDatabase?.catalog?.length) {
    importCatalog(seedDatabase.catalog);
  }

  return getDatabase();
}

module.exports = {
  initDatabase,
  getDatabase,
  getAll,
  getCatalog,
  getJoeAIState,
  recordJoeAIFeedback,
  setJoeAIPreference,
  deleteJoeAIFeedback,
  deleteJoeAIPreference,
  resetJoeAILearning,
  setJoeAIConversationContext,
  clearJoeAIConversationContext,
  upsertAnime,
  upsertCatalogAnime,
  importCatalog,
  replaceAll,
  restoreDatabase,
  backupDatabase,
  reset
};
