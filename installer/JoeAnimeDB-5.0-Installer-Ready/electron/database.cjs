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

function titleKey(title = '') {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function animeToRow(item) {
  return {
    id: String(item.id),
    malId: item.malId ?? item.mal_id ?? null,
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
    updatedAt: new Date().toISOString()
  };
}

function rowToAnime(row) {
  return {
    id: row.id,
    malId: row.malId,
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
    malScore: item.malScore ?? item.communityScore ?? null,
    popularity: item.popularity ?? null,
    members: item.members ?? item.memberCount ?? item.popularityMembers ?? null,
    followed: item.followed ? 1 : 0,
    ignored: item.ignored ? 1 : 0,
    followedAt: item.followedAt || null,
    listUpdatedAt: item.listUpdatedAt || null,
    updatedAt: new Date().toISOString()
  };
}

function rowToCatalogAnime(row) {
  return {
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

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS anime (
      id TEXT PRIMARY KEY,
      malId INTEGER,
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
      malScore REAL,
      popularity INTEGER,
      members INTEGER,
      followed INTEGER DEFAULT 0,
      ignored INTEGER DEFAULT 0,
      followedAt TEXT,
      listUpdatedAt TEXT,
      updatedAt TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_anime_catalog_title ON anime_catalog(title);
    CREATE INDEX IF NOT EXISTS idx_anime_catalog_title_key ON anime_catalog(titleKey);
    CREATE INDEX IF NOT EXISTS idx_anime_catalog_studio ON anime_catalog(studio);
    CREATE INDEX IF NOT EXISTS idx_anime_catalog_year ON anime_catalog(year);
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
  addAnimeColumn('officialTitle', 'TEXT');
  addAnimeColumn('titleSynonyms', 'TEXT');
  addAnimeColumn('canonicalTitleVersion', 'INTEGER DEFAULT 0');

  db.exec('CREATE INDEX IF NOT EXISTS idx_anime_mal_id ON anime(malId)');

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
  addColumn('followed', 'INTEGER DEFAULT 0');
  addColumn('ignored', 'INTEGER DEFAULT 0');
  addColumn('followedAt', 'TEXT');
  addColumn('listUpdatedAt', 'TEXT');
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

function getDatabase() {
  return {
    version: '4.5-anime-catalog',
    engine: 'SQLite/better-sqlite3',
    path: dbPath,
    anime: getAll(),
    catalog: getCatalog()
  };
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
  let duplicateRows = [];

  if (incomingMalId !== null && incomingMalId !== undefined && incomingMalId !== '') {
    duplicateRows = db
      .prepare('SELECT * FROM anime WHERE malId = ? OR id = ?')
      .all(incomingMalId, String(item.id));
  } else {
    duplicateRows = db
      .prepare('SELECT * FROM anime WHERE id = ?')
      .all(String(item.id));
  }

  const mergedItem = mergeDuplicateAnime(duplicateRows, item);
  const row = animeToRow(mergedItem);

  const transaction = db.transaction(() => {
    // Once MAL identity is known, collapse every duplicate row into one record.
    if (row.malId !== null && row.malId !== undefined) {
      db.prepare('DELETE FROM anime WHERE malId = ? AND id != ?').run(row.malId, row.id);
    }

    db.prepare(`
      INSERT INTO anime (
        id, malId, title, officialTitle, titleSynonyms, canonicalTitleVersion,
        type, year, episodes, studio, genres, cover, synopsis,
        malScore, joeScore, finalRank, rewatches, status, favorite, notes, updatedAt
      ) VALUES (
        @id, @malId, @title, @officialTitle, @titleSynonyms, @canonicalTitleVersion,
        @type, @year, @episodes, @studio, @genres, @cover, @synopsis,
        @malScore, @joeScore, @finalRank, @rewatches, @status, @favorite, @notes, @updatedAt
      )
      ON CONFLICT(id) DO UPDATE SET
        malId=excluded.malId,
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
        updatedAt=excluded.updatedAt
    `).run(row);
  });

  transaction();
  return rowToAnime(db.prepare('SELECT * FROM anime WHERE id = ?').get(row.id));
}

function upsertCatalogAnime(item) {
  const row = catalogToRow(item);

  if (!row.title || !row.titleKey) return null;

  db.prepare(`
    INSERT INTO anime_catalog (
      id, title, titleKey, type, year, episodes, studio, genres, themes,
      source, cover, synopsis, malId, malScore, popularity, members,
      followed, ignored, followedAt, listUpdatedAt, updatedAt
    ) VALUES (
      @id, @title, @titleKey, @type, @year, @episodes, @studio, @genres, @themes,
      @source, @cover, @synopsis, @malId, @malScore, @popularity, @members,
      @followed, @ignored, @followedAt, @listUpdatedAt, @updatedAt
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
      updatedAt=excluded.updatedAt
  `).run(row);

  return rowToCatalogAnime(
    db.prepare('SELECT * FROM anime_catalog WHERE titleKey = ?').get(row.titleKey)
  );
}

function importCatalog(catalog) {
  const libraryTitleKeys = new Set(getAll().map((item) => titleKey(item.title)));

  const transaction = db.transaction((items) => {
    for (const item of items || []) {
      const key = titleKey(item.title);
      if (!key || libraryTitleKeys.has(key)) continue;
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

function reset(seedDatabase) {
  replaceAll(seedDatabase?.anime || []);

  if (seedDatabase?.catalog?.length) {
    db.prepare('DELETE FROM anime_catalog').run();
    importCatalog(seedDatabase.catalog);
  }

  return getDatabase();
}

module.exports = {
  initDatabase,
  getDatabase,
  getAll,
  getCatalog,
  upsertAnime,
  upsertCatalogAnime,
  importCatalog,
  replaceAll,
  reset
};
