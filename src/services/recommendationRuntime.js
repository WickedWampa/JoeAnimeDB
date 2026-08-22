import { createAnimeBrain } from '../engine/animeBrain';
import {
  filterContentBySafety,
  normalizeContentSafetyMode
} from './contentSafety';

const MAX_CONTEXTS = 3;
const MAX_DAILY_PICKS = 6;
const EMPTY_LIST = Object.freeze([]);
const EMPTY_JOEAI_STATE = Object.freeze({});

const contextCache = [];
const dailyPickCache = [];

function moveToFront(items, index) {
  if (index <= 0) return items[0];
  const [item] = items.splice(index, 1);
  items.unshift(item);
  return item;
}

export function getRecommendationContext(
  library = EMPTY_LIST,
  catalog = EMPTY_LIST,
  contentSafetyMode = 'unrestricted',
  joeAIState = EMPTY_JOEAI_STATE
) {
  const sourceLibrary = Array.isArray(library) ? library : EMPTY_LIST;
  const sourceCatalog = Array.isArray(catalog) ? catalog : EMPTY_LIST;
  const safetyMode = normalizeContentSafetyMode(contentSafetyMode);
  const cachedIndex = contextCache.findIndex((entry) => (
    entry.sourceLibrary === sourceLibrary
    && entry.sourceCatalog === sourceCatalog
    && entry.safetyMode === safetyMode
    && entry.joeAIState === joeAIState
  ));

  if (cachedIndex >= 0) return moveToFront(contextCache, cachedIndex);

  const recommendationLibrary = filterContentBySafety(sourceLibrary, safetyMode);
  const recommendationCatalog = filterContentBySafety(sourceCatalog, safetyMode);
  const context = {
    sourceLibrary,
    sourceCatalog,
    safetyMode,
    joeAIState,
    library: recommendationLibrary,
    catalog: recommendationCatalog,
    brain: createAnimeBrain(recommendationLibrary, recommendationCatalog, { joeAIState })
  };

  contextCache.unshift(context);
  contextCache.splice(MAX_CONTEXTS);
  return context;
}

export function peekDailyRecommendation(context, daySeed, joeAIState = EMPTY_JOEAI_STATE) {
  if (!context) return null;

  const normalizedSeed = Number(daySeed || 0);
  const cachedIndex = dailyPickCache.findIndex((entry) => (
    entry.context === context
    && entry.daySeed === normalizedSeed
    && entry.joeAIState === joeAIState
  ));

  return cachedIndex >= 0 ? moveToFront(dailyPickCache, cachedIndex) : null;
}

export function getDailyRecommendation(context, daySeed, joeAIState = EMPTY_JOEAI_STATE) {
  const cached = peekDailyRecommendation(context, daySeed, joeAIState);
  if (cached) return cached.value;
  if (!context?.brain) return null;

  const dailyPool = context.brain.recommendations(12, {
    prompt: 'JoeAI Pick of the Day',
    joeAIState
  });
  const item = dailyPool.length
    ? dailyPool[Math.abs(Number(daySeed || 0)) % dailyPool.length]
    : null;
  const value = item
    ? {
        item,
        confidence: item.match,
        reasons: Array.isArray(item.reasons) ? item.reasons : [],
        confidenceReceipt: item.confidenceReceipt
      }
    : null;

  dailyPickCache.unshift({
    context,
    daySeed: Number(daySeed || 0),
    joeAIState,
    value
  });
  dailyPickCache.splice(MAX_DAILY_PICKS);
  return value;
}
