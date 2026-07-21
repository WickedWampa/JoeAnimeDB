// PATCH_0065_LIVING_MEMORY
// Shared constants and helpers for JoeAI Memory.

export const MEMORY_PROFILE_VERSION = 2;

export const MEMORY_DIMENSIONS = [
  'worldbuilding',
  'foundFamily',
  'kingdomBuilding',
  'optimisticHeroes',
  'longRunning',
  'strategicBattles',
  'politics',
  'supernaturalCombat',
  'powerFantasy',
  'comedy',
  'psychological',
  'horror',
  'sports',
  'romance',
  'sliceOfLife',
  'mecha'
];

export const DIMENSION_LABELS = {
  worldbuilding: 'Worldbuilding',
  foundFamily: 'Found Family',
  kingdomBuilding: 'Kingdom Building',
  optimisticHeroes: 'Optimistic Heroes',
  longRunning: 'Long-form Stories',
  strategicBattles: 'Strategic Battles',
  politics: 'Politics / Strategy',
  supernaturalCombat: 'Supernatural Combat',
  powerFantasy: 'Power Fantasy',
  comedy: 'Comedy',
  psychological: 'Psychological',
  horror: 'Horror',
  sports: 'Sports',
  romance: 'Romance',
  sliceOfLife: 'Slice of Life',
  mecha: 'Mecha'
};

export const MEMORY_EVENT_TYPES = {
  SNAPSHOT: 'profile_snapshot',
  MILESTONE: 'milestone',
  TASTE_SHIFT: 'taste_shift',
  OBSERVATION: 'observation',
  COMFORT: 'comfort_anchor',
  COMPLETION: 'completion_summary',
  WATCHING: 'watching_summary',
  REWATCH: 'rewatch_summary',
  FAVORITE: 'favorite_summary',
  DAILY_THOUGHT: 'daily_thought',
  SELF_REFLECTION: 'self_reflection',
  UNCERTAINTY: 'uncertainty',
  PREDICTION_READY: 'prediction_ready'
};

export const MEMORY_EVENT_ICONS = {
  profile_snapshot: '🧠',
  milestone: '🏆',
  taste_shift: '📈',
  observation: '💭',
  comfort_anchor: '❤️',
  completion_summary: '📺',
  watching_summary: '▶️',
  rewatch_summary: '🔁',
  favorite_summary: '⭐',
  daily_thought: '🌅',
  self_reflection: '🪞',
  uncertainty: '❔',
  prediction_ready: '🎯'
};

export function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0))));
}

export function normalizeText(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function titleOf(item = {}) {
  return item.officialTitle || item.title || item.name || 'Unknown title';
}

export function profileTopDimensions(profile = {}, limit = 5) {
  return (profile.strongest || [])
    .filter((item) => Number(item.score || 0) > 0)
    .slice(0, limit);
}


export function memoryDayKey(value = new Date().toISOString()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '').slice(0, 10) || 'unknown-day';
  return date.toISOString().slice(0, 10);
}

export function memorySemanticKey(type = '', title = '', details = {}) {
  const raw = details.semanticKey || `${type}:${title}`;
  return normalizeText(raw).replace(/\s+/g, '-');
}
