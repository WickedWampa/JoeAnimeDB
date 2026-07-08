// PATCH_0060_JOEAI_MEMORY_FOUNDATION
// Shared constants and helpers for JoeAI Memory.

export const MEMORY_PROFILE_VERSION = 1;

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

export function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0))));
}

export function normalizeText(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
