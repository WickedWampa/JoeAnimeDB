#!/usr/bin/env node
/* JoeAnimeDB legacy score importer
   Copies legacy backup `rating` values into current SQLite `anime.joeScore`.

   Usage:
     node scripts\import-legacy-scores.cjs joeanime-backup-v1.1.json --force
     node scripts\import-legacy-scores.cjs joeanime-backup-v1.1.json --db "%APPDATA%\joeanime-db-4\JoeAnime.db" --force

   Notes:
   - Makes a timestamped backup of the SQLite DB before changing it.
   - Matches by exact id first, then normalized title.
   - By default, it only fills blank/0 joeScore values.
   - Use --force to overwrite existing joeScore values.
*/

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function usageAndExit(message) {
  if (message) console.error(`\nERROR: ${message}\n`);
  console.log(`Usage:
  node scripts\\import-legacy-scores.cjs <backup-json> [--force] [--db <path>]

Examples:
  node scripts\\import-legacy-scores.cjs joeanime-backup-v1.1.json --force
  node scripts\\import-legacy-scores.cjs joeanime-backup-v1.1.json --db "%APPDATA%\\joeanime-db-4\\JoeAnime.db" --force
`);
  process.exit(message ? 1 : 0);
}

function parseArgs(argv) {
  const args = [...argv];
  const result = {
    backupPath: null,
    dbPath: null,
    force: false
  };

  while (args.length) {
    const arg = args.shift();

    if (arg === '--help' || arg === '-h') usageAndExit();
    if (arg === '--force') {
      result.force = true;
      continue;
    }
    if (arg === '--db') {
      result.dbPath = args.shift();
      if (!result.dbPath) usageAndExit('--db requires a path');
      continue;
    }
    if (!result.backupPath) {
      result.backupPath = arg;
      continue;
    }

    usageAndExit(`Unknown argument: ${arg}`);
  }

  if (!result.backupPath) usageAndExit('Missing backup JSON path');
  return result;
}

function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[:：'’"“”.,!?()[\]{}]/g, ' ')
    .replace(/\bseason\b/g, 's')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveDbPath(inputPath) {
  if (inputPath) return path.resolve(inputPath);

  if (!process.env.APPDATA) {
    usageAndExit('APPDATA is not set. Pass --db <path-to-JoeAnime.db>.');
  }

  return path.join(process.env.APPDATA, 'joeanime-db-4', 'JoeAnime.db');
}

function readBackup(backupPath) {
  const resolved = path.resolve(backupPath);
  if (!fs.existsSync(resolved)) usageAndExit(`Backup JSON not found: ${resolved}`);

  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const anime = Array.isArray(parsed.anime) ? parsed.anime : [];

  if (!anime.length) usageAndExit('Backup JSON does not contain an anime array.');

  return { resolved, anime };
}

function assertDatabase(db) {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='anime'").get();
  if (!table) usageAndExit('SQLite database does not contain an anime table.');

  const columns = db.prepare('PRAGMA table_info(anime)').all().map((row) => row.name);
  for (const required of ['id', 'title', 'joeScore']) {
    if (!columns.includes(required)) usageAndExit(`anime table is missing required column: ${required}`);
  }
}

function makeBackupCopy(dbPath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${dbPath}.before-score-import-${stamp}.bak`;
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const { resolved: backupPath, anime: legacyAnime } = readBackup(options.backupPath);
  const dbPath = resolveDbPath(options.dbPath);

  if (!fs.existsSync(dbPath)) usageAndExit(`SQLite database not found: ${dbPath}`);

  const dbBackup = makeBackupCopy(dbPath);
  const db = new Database(dbPath);

  try {
    assertDatabase(db);

    const legacyById = new Map();
    const legacyByTitle = new Map();

    for (const item of legacyAnime) {
      const score = Number(item.rating ?? item.joeScore ?? item.predictedScore);
      if (!Number.isFinite(score) || score <= 0) continue;

      const record = {
        id: String(item.id ?? ''),
        title: item.title,
        score,
        finalRank: item.finalRank ?? null,
        rewatches: Number.isFinite(Number(item.rewatches)) ? Number(item.rewatches) : null,
        favorite: item.favoriteRank != null ? 1 : null,
        notes: typeof item.notes === 'string' ? item.notes : null,
        status: typeof item.status === 'string' ? item.status : null
      };

      if (record.id) legacyById.set(record.id, record);
      legacyByTitle.set(normalizeTitle(record.title), record);
    }

    const rows = db.prepare('SELECT id, title, joeScore FROM anime ORDER BY CAST(finalRank AS INTEGER), title').all();

    const updateScore = db.prepare(`
      UPDATE anime
      SET joeScore = @score,
          updatedAt = @updatedAt
      WHERE id = @id
    `);

    const updateWithExtras = db.prepare(`
      UPDATE anime
      SET joeScore = @score,
          rewatches = CASE WHEN @rewatches IS NULL THEN rewatches ELSE @rewatches END,
          favorite = CASE WHEN @favorite IS NULL THEN favorite ELSE @favorite END,
          notes = CASE
            WHEN @notes IS NULL OR @notes = '' THEN notes
            WHEN notes IS NULL OR notes = '' THEN @notes
            ELSE notes
          END,
          status = CASE
            WHEN @status IS NULL OR @status = '' THEN status
            ELSE @status
          END,
          updatedAt = @updatedAt
      WHERE id = @id
    `);

    const transaction = db.transaction(() => {
      let matched = 0;
      let updated = 0;
      let skippedExisting = 0;
      let missing = 0;
      const misses = [];
      const changedPreview = [];

      for (const row of rows) {
        const legacy = legacyById.get(String(row.id)) || legacyByTitle.get(normalizeTitle(row.title));

        if (!legacy) {
          missing++;
          misses.push(row.title);
          continue;
        }

        matched++;

        const currentScore = Number(row.joeScore || 0);
        if (!options.force && currentScore > 0) {
          skippedExisting++;
          continue;
        }

        const payload = {
          id: String(row.id),
          score: legacy.score,
          rewatches: legacy.rewatches,
          favorite: legacy.favorite,
          notes: legacy.notes,
          status: legacy.status,
          updatedAt: new Date().toISOString()
        };

        updateWithExtras.run(payload);
        updated++;

        if (changedPreview.length < 12) {
          changedPreview.push(`${row.title}: ${currentScore || 0} -> ${legacy.score}`);
        }
      }

      return { matched, updated, skippedExisting, missing, misses, changedPreview };
    });

    const result = transaction();

    const sample = db.prepare(`
      SELECT title, joeScore, rewatches, favorite, status
      FROM anime
      ORDER BY CAST(finalRank AS INTEGER), title
      LIMIT 12
    `).all();

    console.log('\nJoeAnimeDB legacy score import complete.');
    console.log(`Backup JSON: ${backupPath}`);
    console.log(`SQLite DB:   ${dbPath}`);
    console.log(`DB backup:   ${dbBackup}`);
    console.log('');
    console.log(`Matched:          ${result.matched}`);
    console.log(`Updated:          ${result.updated}`);
    console.log(`Skipped existing: ${result.skippedExisting}`);
    console.log(`No match:         ${result.missing}`);

    if (result.changedPreview.length) {
      console.log('\nChanged preview:');
      for (const line of result.changedPreview) console.log(`  - ${line}`);
    }

    if (result.misses.length) {
      console.log('\nFirst unmatched titles:');
      for (const title of result.misses.slice(0, 20)) console.log(`  - ${title}`);
    }

    console.log('\nTop rows now:');
    for (const row of sample) {
      console.log(`  - ${row.title}: joeScore=${row.joeScore}, rewatches=${row.rewatches}, favorite=${row.favorite}, status=${row.status}`);
    }

    console.log('\nRestart the app with npm run dev and check the dashboard.');
  } finally {
    db.close();
  }
}

main();
