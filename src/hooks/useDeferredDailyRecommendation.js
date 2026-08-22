import { useEffect, useState } from 'react';
import {
  getDailyRecommendation,
  peekDailyRecommendation
} from '../services/recommendationRuntime';

const EMPTY_JOEAI_STATE = Object.freeze({});

function cachedResult(context, daySeed, joeAIState) {
  const cached = peekDailyRecommendation(context, daySeed, joeAIState);
  return cached
    ? { context, daySeed, joeAIState, value: cached.value }
    : null;
}

export function useDeferredDailyRecommendation(
  context,
  daySeed,
  joeAIState = EMPTY_JOEAI_STATE
) {
  const [result, setResult] = useState(() => cachedResult(context, daySeed, joeAIState));

  useEffect(() => {
    const cached = cachedResult(context, daySeed, joeAIState);
    if (cached) {
      setResult(cached);
      return undefined;
    }

    let cancelled = false;
    let idleId = null;
    let timeoutId = null;

    setResult(null);

    const calculate = () => {
      if (cancelled) return;

      try {
        const value = getDailyRecommendation(context, daySeed, joeAIState);
        if (!cancelled) setResult({ context, daySeed, joeAIState, value });
      } catch (error) {
        console.warn('Could not prepare the daily JoeAI recommendation:', error);
        if (!cancelled) setResult({ context, daySeed, joeAIState, value: null });
      }
    };

    if (typeof globalThis.requestIdleCallback === 'function') {
      idleId = globalThis.requestIdleCallback(calculate, { timeout: 600 });
    } else {
      timeoutId = globalThis.setTimeout(calculate, 0);
    }

    return () => {
      cancelled = true;
      if (idleId != null && typeof globalThis.cancelIdleCallback === 'function') {
        globalThis.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) globalThis.clearTimeout(timeoutId);
    };
  }, [context, daySeed, joeAIState]);

  const matchesCurrentInputs = result
    && result.context === context
    && result.daySeed === daySeed
    && result.joeAIState === joeAIState;

  return {
    recommendation: matchesCurrentInputs ? result.value : null,
    isPending: !matchesCurrentInputs
  };
}
