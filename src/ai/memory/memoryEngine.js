import { MEMORY_PROFILE_VERSION } from './memoryTypes';
import { buildTasteProfile } from './tasteProfile';
import { buildMemoryJournal } from './journalEngine';
import {
  saveMemoryProfile,
  loadMemoryProfile,
  appendMemoryJournal,
  loadMemoryJournal,
  loadMemoryEvents,
  clearJoeAIMemoryStorage
} from './memoryStorage';

export function buildJoeAIMemory(library = [], options = {}) {
  const previousProfile = options.previousProfile || loadMemoryProfile();
  const taste = buildTasteProfile(library);

  const profile = {
    profileVersion: MEMORY_PROFILE_VERSION,
    createdAt: previousProfile?.createdAt || new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    confidence: taste.confidence,
    viewerClass: taste.viewerClass,
    stats: taste.stats,
    dimensions: taste.dimensions,
    strongest: taste.strongest,
    weakest: taste.weakest
  };

  const journalEntry = buildMemoryJournal(library, previousProfile, profile);

  if (options.persist) {
    if (library.length === 0) {
      // A clean install or Reset Local Data should never inherit another
      // user's JoeAI profile, journal, events, or prediction history.
      clearJoeAIMemoryStorage();
    } else {
      saveMemoryProfile(profile);
      appendMemoryJournal(journalEntry);
    }
  }

  return {
    profile,
    journalEntry,
    reflections: (journalEntry.events || []).filter((event) => ['daily_thought', 'self_reflection', 'uncertainty', 'prediction_ready'].includes(event.type)),
    events: journalEntry.events || [],
    journal: options.persist
      ? (library.length ? loadMemoryJournal() : [])
      : [journalEntry],
    eventFeed: options.persist
      ? (library.length ? loadMemoryEvents() : [])
      : (journalEntry.events || [])
  };
}

export function getStoredJoeAIMemory() {
  return {
    profile: loadMemoryProfile(),
    journal: loadMemoryJournal(),
    events: loadMemoryEvents()
  };
}

export function summarizeJoeAIMemory(profile) {
  if (!profile) return 'JoeAI has not built a taste profile yet.';

  const lines = [
    '🧠 JoeAI Memory',
    '',
    `Viewer Class: ${profile.viewerClass || 'Anime Explorer'}`,
    `Confidence: ${profile.confidence || 0}%`,
    `Based on ${profile.stats?.total || 0} library entries, ${profile.stats?.completed || 0} completed anime, and ${profile.stats?.rewatches || 0} rewatches.`,
    '',
    'Strongest taste signals:',
    ...(profile.strongest || []).slice(0, 8).map((item) => `• ${item.label}: ${item.score}% (${item.confidence}% confidence)`)
  ];

  return lines.join('\n');
}
