import { MEMORY_PROFILE_VERSION } from './memoryTypes';
import { buildTasteProfile } from './tasteProfile';
import { buildMemoryJournal } from './journalEngine';
import { saveMemoryProfile, loadMemoryProfile, appendMemoryJournal, loadMemoryJournal } from './memoryStorage';

export function buildJoeAIMemory(library = [], options = {}) {
  const previousProfile = options.previousProfile || loadMemoryProfile();
  const taste = buildTasteProfile(library);

  const profile = {
    profileVersion: MEMORY_PROFILE_VERSION,
    createdAt: previousProfile?.createdAt || new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    confidence: taste.confidence,
    stats: taste.stats,
    dimensions: taste.dimensions,
    strongest: taste.strongest,
    weakest: taste.weakest
  };

  const journalEntry = buildMemoryJournal(library, previousProfile, profile);

  if (options.persist) {
    saveMemoryProfile(profile);
    appendMemoryJournal(journalEntry);
  }

  return {
    profile,
    journalEntry,
    journal: options.persist ? loadMemoryJournal() : [journalEntry]
  };
}

export function getStoredJoeAIMemory() {
  return {
    profile: loadMemoryProfile(),
    journal: loadMemoryJournal()
  };
}

export function summarizeJoeAIMemory(profile) {
  if (!profile) return 'JoeAI has not built a taste profile yet.';

  const lines = [
    '🧠 JoeAI Memory',
    '',
    `Confidence: ${profile.confidence || 0}%`,
    `Based on ${profile.stats?.total || 0} library entries, ${profile.stats?.completed || 0} completed anime, and ${profile.stats?.rewatches || 0} rewatches.`,
    '',
    'Strongest taste signals:',
    ...(profile.strongest || []).slice(0, 8).map((item) => `• ${item.label}: ${item.score}% (${item.confidence}% confidence)`)
  ];

  return lines.join('\n');
}
