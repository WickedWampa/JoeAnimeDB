import { useEffect, useState } from 'react';
import {
  getDailyRecommendation,
  peekDailyRecommendation
} from '../services/recommendationRuntime';
import { deferUntilAfterFirstPaint } from '../services/startupPerformance';

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
    if (!context) {
      setResult(null);
      return undefined;
    }

    const cached = cachedResult(context, daySeed, joeAIState);
    if (cached) {
      setResult(cached);
      return undefined;
    }

    let cancelled = false;
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

    const cancelSchedule = deferUntilAfterFirstPaint(calculate, { timeout: 600 });

    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, [context, daySeed, joeAIState]);

  const matchesCurrentInputs = result
    && result.context === context
    && result.daySeed === daySeed
    && result.joeAIState === joeAIState;

  return {
    recommendation: matchesCurrentInputs ? result.value : null,
    isPending: !context || !matchesCurrentInputs
  };
}
