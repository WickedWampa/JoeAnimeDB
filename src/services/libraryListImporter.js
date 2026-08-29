const TITLE_ALIASES = new Map([
  ['re zero starting life in another world', 'Re:ZERO -Starting Life in Another World-'],
  ['tsukimichi moonlit fantasy', 'TSUKIMICHI -Moonlit Fantasy-'],
  ['solo leveling season 2 arise from the shadow', 'Solo Leveling Season 2: Arise from the Shadow'],
  ['that time i got reincarnated as a slime the movie scarlet bond', 'That Time I Got Reincarnated as a Slime: The Movie - Scarlet Bond'],
  ['demon slayer kimetsu no yaiba', 'Demon Slayer: Kimetsu no Yaiba']
]);

export function importTitleKey(value = '') {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function normalizeLibraryImportTitle(value = '') {
  const clean = String(value || '')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  return TITLE_ALIASES.get(importTitleKey(clean)) || clean;
}

export function normalizeImportedStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase();

  if (normalized === 'repeating') return 'Watching';
  if (normalized.includes('complete') || normalized.includes('watched') || normalized.includes('finished')) {
    return 'Completed';
  }
  if (normalized.includes('watching') || normalized.includes('current')) return 'Watching';
  if (normalized.includes('pause') || normalized.includes('hold')) return 'On Hold';
  if (normalized.includes('drop')) return 'Dropped';
  if (normalized.includes('plan')) return 'Plan to Watch';

  return 'Completed';
}

function cleanImportedTitle(value = '') {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/^\s*\d+\s*[.)-]\s*/, '')
    .replace(/^\s*[-*•]\s*/, '')
    .replace(/\s*\|\s*Score:.*$/i, '')
    .trim();
}

function finiteNumber(value) {
  if (value === '' || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function positiveInteger(value) {
  const parsed = finiteNumber(value);
  return parsed === undefined ? undefined : Math.max(0, Math.trunc(parsed));
}

function cleanDate(value) {
  if (!value) return undefined;

  if (typeof value === 'object') {
    const year = positiveInteger(value.year);
    const month = positiveInteger(value.month);
    const day = positiveInteger(value.day);
    if (!year) return undefined;
    return `${year}-${String(month || 1).padStart(2, '0')}-${String(day || 1).padStart(2, '0')}`;
  }

  const date = String(value).trim();
  if (!date || date === '0000-00-00' || /^0+$/.test(date)) return undefined;
  return date;
}

function normalizeScore(value, format = '') {
  const score = finiteNumber(value);
  if (score === undefined || score <= 0) return undefined;

  const normalizedFormat = String(format || '').toUpperCase();
  let result = score;

  if (normalizedFormat.includes('100')) result = score / 10;
  else if (normalizedFormat.includes('5')) result = score * 2;
  else if (normalizedFormat.includes('3')) result = (score / 3) * 10;
  else if (score > 10) result = score / 10;

  return Math.max(0, Math.min(10, Math.round(result * 10) / 10));
}

function parseCsvRecords(text = '') {
  const records = [];
  let record = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      record.push(value.trim());
      value = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      record.push(value.trim());
      value = '';
      if (record.some((entry) => entry !== '')) records.push(record);
      record = [];
    } else {
      value += character;
    }
  }

  record.push(value.trim());
  if (record.some((entry) => entry !== '')) records.push(record);
  return records;
}

function headerKey(value = '') {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function columnIndex(headers, aliases) {
  return headers.findIndex((header) => aliases.includes(header));
}

function parseCsv(text = '') {
  const records = parseCsvRecords(text);
  if (!records.length) return [];

  const headers = records[0].map(headerKey);
  const titleIndex = columnIndex(headers, [
    'title', 'anime title', 'name', 'media title', 'english title', 'romaji title'
  ]);
  if (titleIndex < 0) return [];

  const statusIndex = columnIndex(headers, ['status', 'list status', 'watch status']);
  const scoreIndex = columnIndex(headers, ['score', 'user score', 'rating', 'score raw']);
  const scoreFormatIndex = columnIndex(headers, ['score format', 'scoreformat']);
  const progressIndex = columnIndex(headers, [
    'progress', 'watch progress', 'episodes watched', 'watched episodes'
  ]);
  const rewatchesIndex = columnIndex(headers, [
    'repeat', 'rewatches', 'rewatch count', 'times rewatched'
  ]);
  const notesIndex = columnIndex(headers, ['notes', 'comments', 'comment']);
  const tagsIndex = columnIndex(headers, ['tags', 'user tags', 'personal tags']);
  const priorityIndex = columnIndex(headers, ['priority']);
  const startIndex = columnIndex(headers, ['started at', 'start date', 'started date']);
  const completedIndex = columnIndex(headers, ['completed at', 'finish date', 'completed date']);
  const malIdIndex = columnIndex(headers, ['mal id', 'malid', 'id mal', 'myanimelist id']);
  const kitsuIdIndex = columnIndex(headers, ['kitsu id', 'kitsuid', 'id kitsu']);
  const anilistIdIndex = columnIndex(headers, ['anilist id', 'media id', 'mediaid']);
  const sourceName = headers.some((header) => header.includes('anilist') || header === 'media id')
    ? 'AniList CSV'
    : 'CSV';

  return records.slice(1).map((columns) => {
    const requestedTitle = cleanImportedTitle(columns[titleIndex]);
    const rawScore = scoreIndex >= 0 ? columns[scoreIndex] : undefined;
    const inferredFormat = headers[scoreIndex] === 'score raw' ? 'POINT_100' : '';

    return {
      title: normalizeLibraryImportTitle(requestedTitle),
      requestedTitle,
      status: normalizeImportedStatus(statusIndex >= 0 ? columns[statusIndex] : 'Completed'),
      score: normalizeScore(
        rawScore,
        scoreFormatIndex >= 0 ? columns[scoreFormatIndex] : inferredFormat
      ),
      episodesWatched: progressIndex >= 0 ? positiveInteger(columns[progressIndex]) : undefined,
      watchProgress: progressIndex >= 0 ? positiveInteger(columns[progressIndex]) : undefined,
      rewatches: rewatchesIndex >= 0 ? positiveInteger(columns[rewatchesIndex]) : undefined,
      notes: notesIndex >= 0 ? String(columns[notesIndex] || '').trim() || undefined : undefined,
      userTags: tagsIndex >= 0
        ? String(columns[tagsIndex] || '').split(',').map((tag) => tag.trim()).filter(Boolean)
        : undefined,
      priority: priorityIndex >= 0 ? positiveInteger(columns[priorityIndex]) : undefined,
      startedAt: startIndex >= 0 ? cleanDate(columns[startIndex]) : undefined,
      completedAt: completedIndex >= 0 ? cleanDate(columns[completedIndex]) : undefined,
      malId: malIdIndex >= 0 ? positiveInteger(columns[malIdIndex]) : undefined,
      kitsuId: kitsuIdIndex >= 0 ? positiveInteger(columns[kitsuIdIndex]) : undefined,
      anilistId: anilistIdIndex >= 0 ? positiveInteger(columns[anilistIdIndex]) : undefined,
      sourceName
    };
  }).filter((row) => row.requestedTitle);
}

function decodeXml(value = '') {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function xmlValue(block, tag) {
  const match = String(block || '').match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]).trim() : '';
}

function parseMalXml(text = '') {
  const entries = String(text || '').match(/<anime(?:\s[^>]*)?>[\s\S]*?<\/anime>/gi) || [];

  return entries.map((entry) => {
    const requestedTitle = cleanImportedTitle(xmlValue(entry, 'series_title'));
    const timesWatched = positiveInteger(xmlValue(entry, 'my_times_watched'));
    const comments = xmlValue(entry, 'my_comments');
    const tags = xmlValue(entry, 'my_tags');
    const notes = [comments, tags ? `MAL tags: ${tags}` : ''].filter(Boolean).join('\n\n');

    return {
      title: normalizeLibraryImportTitle(requestedTitle),
      requestedTitle,
      status: normalizeImportedStatus(xmlValue(entry, 'my_status')),
      score: normalizeScore(xmlValue(entry, 'my_score')),
      episodesWatched: positiveInteger(xmlValue(entry, 'my_watched_episodes')),
      watchProgress: positiveInteger(xmlValue(entry, 'my_watched_episodes')),
      rewatches: timesWatched,
      notes: notes || undefined,
      userTags: tags ? tags.split(',').map((tag) => tag.trim()).filter(Boolean) : undefined,
      priority: positiveInteger(xmlValue(entry, 'my_priority')),
      startedAt: cleanDate(xmlValue(entry, 'my_start_date')),
      completedAt: cleanDate(xmlValue(entry, 'my_finish_date')),
      malId: positiveInteger(xmlValue(entry, 'series_animedb_id')),
      sourceName: 'MyAnimeList XML'
    };
  }).filter((row) => row.requestedTitle);
}

function collectAniListEntries(value, entries = [], seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return entries;
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item) => collectAniListEntries(item, entries, seen));
    return entries;
  }

  const looksLikeEntry = Boolean(
    value.media &&
    (value.media.title || value.media.id || value.mediaId) &&
    ('status' in value || 'score' in value || 'progress' in value || 'repeat' in value)
  );

  if (looksLikeEntry) {
    entries.push(value);
    return entries;
  }

  Object.values(value).forEach((item) => collectAniListEntries(item, entries, seen));
  return entries;
}

function titleFromAniList(entry = {}) {
  const mediaTitle = entry.media?.title || entry.title || {};
  if (typeof mediaTitle === 'string') return mediaTitle;
  return mediaTitle.english || mediaTitle.romaji || mediaTitle.native || entry.name || '';
}

function parseAniListJson(text = '') {
  const parsed = JSON.parse(text);
  let entries = collectAniListEntries(parsed);

  if (!entries.length && Array.isArray(parsed)) {
    entries = parsed.filter((entry) => entry && (entry.title || entry.name));
  }

  const scoreFormat = parsed?.scoreFormat || parsed?.data?.Viewer?.mediaListOptions?.scoreFormat || '';

  return entries.map((entry) => {
    const requestedTitle = cleanImportedTitle(titleFromAniList(entry));
    const rawScore = entry.scoreRaw ?? entry.score;
    const rawScoreFormat = entry.scoreRaw !== undefined ? 'POINT_100' : (entry.scoreFormat || scoreFormat);
    const media = entry.media || {};

    return {
      title: normalizeLibraryImportTitle(requestedTitle),
      requestedTitle,
      status: normalizeImportedStatus(entry.status),
      score: normalizeScore(rawScore, rawScoreFormat),
      episodesWatched: positiveInteger(entry.progress ?? entry.episodesWatched),
      watchProgress: positiveInteger(entry.progress ?? entry.episodesWatched),
      rewatches: positiveInteger(entry.repeat ?? entry.rewatches),
      notes: String(entry.notes ?? entry.comments ?? '').trim() || undefined,
      priority: positiveInteger(entry.priority),
      startedAt: cleanDate(entry.startedAt ?? entry.startDate),
      completedAt: cleanDate(entry.completedAt ?? entry.finishDate),
      malId: positiveInteger(media.idMal ?? entry.idMal ?? entry.malId),
      anilistId: positiveInteger(media.id ?? entry.mediaId ?? entry.anilistId),
      sourceName: 'AniList JSON'
    };
  }).filter((row) => row.requestedTitle);
}

function parsePlainText(text = '') {
  const rows = [];

  String(text || '').replace(/\r/g, '').split('\n').forEach((line) => {
    const trimmed = line.trim();

    if (
      !trimmed ||
      /^JoeAnimeDB /i.test(trimmed) ||
      /^Exported:/i.test(trimmed) ||
      /^Total titles:/i.test(trimmed)
    ) return;

    const statusMatch = trimmed.match(/\|\s*Status:\s*([^|]+)\s*$/i);
    const scoreMatch = trimmed.match(/\|\s*Score:\s*([^|]+)(?:\||$)/i);
    const malIdMatch = trimmed.match(/\|\s*MAL ID:\s*(\d+)/i);
    const kitsuIdMatch = trimmed.match(/\|\s*Kitsu ID:\s*(\d+)/i);
    const requestedTitle = cleanImportedTitle(trimmed.split(/\s*\|\s*/)[0]);

    if (!requestedTitle) return;
    rows.push({
      title: normalizeLibraryImportTitle(requestedTitle),
      requestedTitle,
      status: normalizeImportedStatus(statusMatch?.[1] || 'Completed'),
      score: normalizeScore(scoreMatch?.[1]),
      malId: positiveInteger(malIdMatch?.[1]),
      kitsuId: positiveInteger(kitsuIdMatch?.[1]),
      sourceName: 'JoeAnimeDB text list'
    });
  });

  return rows;
}

export function parseLibraryImport(text = '', filename = '') {
  const raw = String(text || '').replace(/^\uFEFF/, '');
  const lowerFilename = String(filename || '').toLowerCase();
  const trimmed = raw.trim();
  let rows;

  if (lowerFilename.endsWith('.xml') || /<myanimelist[\s>]/i.test(trimmed)) {
    rows = parseMalXml(trimmed);
  } else if (lowerFilename.endsWith('.json') || /^[{[]/.test(trimmed)) {
    rows = parseAniListJson(trimmed);
  } else if (lowerFilename.endsWith('.csv') || /^[^\n]*(title|name)[^\n]*,/i.test(trimmed)) {
    rows = parseCsv(trimmed);
  } else {
    rows = parsePlainText(trimmed);
  }

  const seen = new Set();
  return rows.filter((row) => {
    const key = row.malId
      ? `mal:${row.malId}`
      : row.kitsuId
        ? `kitsu:${row.kitsuId}`
        : `title:${importTitleKey(row.title)}`;
    if (!row.title || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function readLibraryImportFile(file) {
  const lowerName = String(file?.name || '').toLowerCase();
  if (!lowerName.endsWith('.gz')) return file.text();

  if (typeof DecompressionStream !== 'function') {
    throw new Error('This system cannot open compressed MAL exports. Extract the .xml file first and import that file.');
  }

  const decompressed = file.stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(decompressed).text();
}

export function importedPersonalData(row = {}) {
  const patch = {
    status: row.status || 'Completed',
    lastImportedFrom: row.sourceName || 'Library import'
  };

  if (row.score !== undefined) {
    patch.joeScore = row.score;
    patch.rating = row.score;
  }
  if (row.rewatches !== undefined) patch.rewatches = row.rewatches;
  if (row.notes !== undefined) patch.notes = row.notes;
  if (row.userTags?.length) patch.userTags = row.userTags;
  if (row.priority !== undefined) patch.priority = row.priority;
  if (row.watchProgress !== undefined) patch.watchProgress = row.watchProgress;
  if (row.episodesWatched !== undefined) patch.episodesWatched = row.episodesWatched;
  if (row.startedAt !== undefined) patch.startedAt = row.startedAt;
  if (row.completedAt !== undefined) patch.completedAt = row.completedAt;
  if (row.malId !== undefined) patch.malId = row.malId;
  if (row.anilistId !== undefined) patch.anilistId = row.anilistId;

  return patch;
}
