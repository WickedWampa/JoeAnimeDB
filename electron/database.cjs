const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

let SQL = null;
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
    id: item.id,
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

function save() {
  if (!db || !dbPath) return;
  const bytes = db.export();
  fs.writeFileSync(dbPath, Buffer.from(bytes));
}

function exec(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

async function initDatabase(userDataPath, seedDatabase) {
  if (db) return getDatabase();

  SQL = await initSqlJs({
    locateFile: (file) => require.resolve(`sql.js/dist/${file}`)
  });

  dbPath = path.join(userDataPath, 'joeanime.sqlite');

  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  db.run(`
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

  const count = exec('SELECT COUNT(*) AS count FROM anime')[0]?.count || 0;
  if (count === 0 && seedDatabase?.anime?.length) {
    replaceAll(seedDatabase.anime, false);
  }

  save();
  return getDatabase();
}

function getAll() {
  return exec('SELECT * FROM anime ORDER BY CAST(finalRank AS INTEGER), title').map(rowToAnime);
}

function getDatabase() {
  return {
    version: '4.3.1-sqlite',
    engine: 'SQLite/sql.js',
    path: dbPath,
    anime: getAll()
  };
}

function upsertAnime(item, shouldSave = true) {
  const row = animeToRow(item);
  db.run(`
    INSERT INTO anime (
      id, title, type, year, episodes, studio, genres, cover, synopsis,
      malScore, joeScore, finalRank, rewatches, status, favorite, notes, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      updatedAt=excluded.updatedAt;
  `, [
    row.id, row.title, row.type, row.year, row.episodes, row.studio, row.genres, row.cover, row.synopsis,
    row.malScore, row.joeScore, row.finalRank, row.rewatches, row.status, row.favorite, row.notes, row.updatedAt
  ]);
  if (shouldSave) save();
  return rowToAnime(row);
}

function replaceAll(anime, shouldSave = true) {
  db.run('BEGIN TRANSACTION;');
  try {
    db.run('DELETE FROM anime;');
    for (const item of anime || []) upsertAnime(item, false);
    db.run('COMMIT;');
  } catch (error) {
    db.run('ROLLBACK;');
    throw error;
  }
  if (shouldSave) save();
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
