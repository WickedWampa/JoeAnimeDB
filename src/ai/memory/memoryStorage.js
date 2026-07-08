const MEMORY_STORAGE_KEY = 'joeai.memory.profile.v1';
const JOURNAL_STORAGE_KEY = 'joeai.memory.journal.v1';

function canUseLocalStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

export function saveMemoryProfile(profile) {
  if (!canUseLocalStorage()) return false;
  window.localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(profile));
  return true;
}

export function loadMemoryProfile() {
  if (!canUseLocalStorage()) return null;
  try {
    const raw = window.localStorage.getItem(MEMORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('JoeAI memory profile failed to load:', error);
    return null;
  }
}

export function appendMemoryJournal(entry) {
  if (!canUseLocalStorage()) return [];
  const journal = loadMemoryJournal();
  const next = [entry, ...journal].slice(0, 100);
  window.localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function loadMemoryJournal() {
  if (!canUseLocalStorage()) return [];
  try {
    const raw = window.localStorage.getItem(JOURNAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.warn('JoeAI memory journal failed to load:', error);
    return [];
  }
}
