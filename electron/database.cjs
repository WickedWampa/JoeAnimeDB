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
    title: item.title || '',
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
    title: row.title,
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
    updatedAt: row.updatedAt
  };
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS anime (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
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
      updatedAt TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_anime_catalog_title ON anime_catalog(title);
    CREATE INDEX IF NOT EXISTS idx_anime_catalog_title_key ON anime_catalog(titleKey);
    CREATE INDEX IF NOT EXISTS idx_anime_catalog_studio ON anime_catalog(studio);
    CREATE INDEX IF NOT EXISTS idx_anime_catalog_year ON anime_catalog(year);
  `);
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

function upsertAnime(item) {
  const row = animeToRow(item);

  db.prepare(`
    INSERT INTO anime (
      id, title, type, year, episodes, studio, genres, cover, synopsis,
      malScore, joeScore, finalRank, rewatches, status, favorite, notes, updatedAt
    ) VALUES (
      @id, @title, @type, @year, @episodes, @studio, @genres, @cover, @synopsis,
      @malScore, @joeScore, @finalRank, @rewatches, @status, @favorite, @notes, @updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title,
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

  return rowToAnime(row);
}

function upsertCatalogAnime(item) {
  const row = catalogToRow(item);

  if (!row.title || !row.titleKey) return null;

  db.prepare(`
    INSERT INTO anime_catalog (
      id, title, titleKey, type, year, episodes, studio, genres, themes,
      source, cover, synopsis, malId, malScore, popularity, updatedAt
    ) VALUES (
      @id, @title, @titleKey, @type, @year, @episodes, @studio, @genres, @themes,
      @source, @cover, @synopsis, @malId, @malScore, @popularity, @updatedAt
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
