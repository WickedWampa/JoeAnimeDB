const MEMORY_STORAGE_KEY = 'joeai.memory.profile.v1';
const JOURNAL_STORAGE_KEY = 'joeai.memory.journal.v1';
const EVENT_STORAGE_KEY = 'joeai.memory.events.v1';

function canUseLocalStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn('JoeAI memory failed to parse storage:', error);
    return fallback;
  }
}

function readArray(key) {
  if (!canUseLocalStorage()) return [];
  return safeParse(window.localStorage.getItem(key), []);
}

function eventDayKey(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return String(value || '').slice(0, 10) || 'unknown-day';
  return date.toISOString().slice(0, 10);
}

function writeArray(key, value, limit = 250) {
  if (!canUseLocalStorage()) return [];
  const next = Array.isArray(value) ? value.slice(0, limit) : [];
  window.localStorage.setItem(key, JSON.stringify(next));
  return next;
}

export function saveMemoryProfile(profile) {
  if (!canUseLocalStorage()) return false;
  window.localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(profile));
  return true;
}

export function loadMemoryProfile() {
  if (!canUseLocalStorage()) return null;
  return safeParse(window.localStorage.getItem(MEMORY_STORAGE_KEY), null);
}

export function appendMemoryJournal(entry) {
  if (!canUseLocalStorage()) return [];
  const journal = loadMemoryJournal();
  const entryKey = entry?.semanticKey || `${entry?.type || 'entry'}-${eventDayKey(entry?.createdAt)}`;
  const next = [entry, ...journal]
    .filter(Boolean)
    .filter((item, index, list) => {
      const key = item?.semanticKey || `${item?.type || 'entry'}-${eventDayKey(item?.createdAt)}`;
      return list.findIndex((other) => (other?.semanticKey || `${other?.type || 'entry'}-${eventDayKey(other?.createdAt)}`) === key) === index;
    })
    .slice(0, 100);
  window.localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(next));

  if (Array.isArray(entry?.events) && entry.events.length) {
    appendMemoryEvents(entry.events);
  }

  return next;
}

export function loadMemoryJournal() {
  return readArray(JOURNAL_STORAGE_KEY);
}

export function appendMemoryEvents(events = []) {
  if (!canUseLocalStorage()) return [];
  const current = loadMemoryEvents();
  const list = Array.isArray(events) ? events : [events];
  const seen = new Set();
  const next = [...list, ...current]
    .filter(Boolean)
    .filter((event) => {
      const key = event.semanticKey
        ? `${event.semanticKey}-${eventDayKey(event.createdAt)}`
        : (event.id || `${event.type}-${event.title}-${eventDayKey(event.createdAt)}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 300);

  return writeArray(EVENT_STORAGE_KEY, next, 300);
}

export function loadMemoryEvents() {
  return readArray(EVENT_STORAGE_KEY);
}

export function clearJoeAIMemoryStorage() {
  if (!canUseLocalStorage()) return false;
  window.localStorage.removeItem(MEMORY_STORAGE_KEY);
  window.localStorage.removeItem(JOURNAL_STORAGE_KEY);
  window.localStorage.removeItem(EVENT_STORAGE_KEY);
  return true;
}


export function loadPredictionHistory() {
  return readArray('joeai.memory.predictions.v1');
}

export function appendPredictionHistory(entry) {
  if (!canUseLocalStorage()) return [];
  const current = loadPredictionHistory();
  const next = [entry, ...current].filter(Boolean).slice(0, 200);
  return writeArray('joeai.memory.predictions.v1', next, 200);
}
