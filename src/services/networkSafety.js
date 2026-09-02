const DEFAULT_TIMEOUT_MS = 12_000;

export function friendlyNetworkError(error, label = 'Request') {
  if (error?.code === 'REQUEST_TIMEOUT') return error.message;
  if (error?.name === 'AbortError') return `${label} was cancelled.`;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return `${label} needs an internet connection. Saved data is still available.`;
  }
  return error?.message || `${label} is temporarily unavailable.`;
}

export async function fetchWithDeadline(url, options = {}, {
  timeoutMs = DEFAULT_TIMEOUT_MS,
  label = 'Request',
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error(`${label} cannot start in this environment.`);

  const controller = new AbortController();
  const externalSignal = options.signal;
  let timedOut = false;
  const abortFromCaller = () => controller.abort();

  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener?.('abort', abortFromCaller, { once: true });

  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));

  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (timedOut && error?.name === 'AbortError') {
      const timeoutError = new Error(`${label} timed out. Saved data is still available.`);
      timeoutError.code = 'REQUEST_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
    externalSignal?.removeEventListener?.('abort', abortFromCaller);
  }
}

export { DEFAULT_TIMEOUT_MS };
