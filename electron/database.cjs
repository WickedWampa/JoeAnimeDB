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

function animeToRow(item) {
  return {
    id: String(item.id),
    title: item.title || '',
    type: item.type || '',
    year: item.year ?? null,
    episodes: item.episodes ?? null,
    studio: item.studio || '',
    genres: encodeList(item.genres),
    cover: item.cover || '',
    synopsis: item.synopsis || '',
    malScore: item.malScore ?? null,
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
    studio: row.studio,
    genres: decodeList(row.genres),
    cover: row.cover,
    synopsis: row.synopsis,
    malScore: row.malScore,
    joeScore: row.joeScore,
    finalRank: row.finalRank,
    rewatches: row.rewatches || 0,
    status: row.status || '',
    favorite: Boolean(row.favorite),
    notes: row.notes || '',
    updatedAt: row.updatedAt
  };
}

async function initDatabase(userDataPath, seedDatabase) {
  if (db) return getDatabase();

  dbPath = path.join(userDataPath, 'JoeAnime.db');
  db = new Database(dbPath);

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
  `);

  const count = db.prepare('SELECT COUNT(*) AS count FROM anime').get().count;

  if (count === 0 && seedDatabase?.anime?.length) {
    replaceAll(seedDatabase.anime);
  }

  return getDatabase();
}

function getAll() {
  return db
    .prepare('SELECT * FROM anime ORDER BY finalRank IS NULL, finalRank, title')
    .all()
    .map(rowToAnime);
}

function getDatabase() {
  return {
    version: '4.4-better-sqlite3',
    engine: 'SQLite/better-sqlite3',
    path: dbPath,
    anime: getAll()
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

function replaceAll(anime) {
  const transaction = db.transaction((items) => {
    db.prepare('DELETE FROM anime').run();
    for (const item of items || []) upsertAnime(item);
  });

  transaction(anime);
  return getDatabase();
}

function reset(seedDatabase) {
  return replaceAll(seedDatabase?.anime || []);
}

module.exports = {
  initDatabase,
  getDatabase,
  getAll,
  upsertAnime,
  replaceAll,
  reset
};