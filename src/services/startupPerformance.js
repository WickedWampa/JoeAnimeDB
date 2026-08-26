function clockNow() {
  return typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
}

const deferredStartupQueue = [];
let deferredPumpFrameId = null;
let deferredPumpIdleId = null;
let deferredPumpTimerId = null;
let deferredActivityAt = clockNow();

function nextDeferredEntry() {
  while (deferredStartupQueue.length) {
    const entry = deferredStartupQueue.shift();
    if (!entry.cancelled) return entry;
  }
  return null;
}

function scheduleDeferredPump() {
  if (deferredPumpFrameId != null || deferredPumpIdleId != null || deferredPumpTimerId != null) return;
  if (!deferredStartupQueue.some((entry) => !entry.cancelled)) {
    deferredStartupQueue.length = 0;
    return;
  }

  const afterFrame = () => {
    deferredPumpFrameId = null;
    const entry = nextDeferredEntry();
    if (!entry) return;

    const run = () => {
      deferredPumpIdleId = null;
      deferredPumpTimerId = null;
      try {
        if (!entry.cancelled) entry.callback();
      } finally {
        deferredActivityAt = clockNow();
        scheduleDeferredPump();
      }
    };

    if (typeof globalThis.requestIdleCallback === 'function') {
      deferredPumpIdleId = globalThis.requestIdleCallback(run, { timeout: entry.timeout });
    } else {
      deferredPumpTimerId = globalThis.setTimeout(run, 0);
    }
  };

  if (typeof globalThis.requestAnimationFrame === 'function') {
    deferredPumpFrameId = globalThis.requestAnimationFrame(afterFrame);
  } else {
    deferredPumpTimerId = globalThis.setTimeout(afterFrame, 0);
  }
}

export function recordStartupTiming(name, durationMs, detail = {}) {
  const value = Number(durationMs);
  if (!name || !Number.isFinite(value)) return;

  const current = globalThis.__JOEANIME_STARTUP_TIMINGS__ || {};
  globalThis.__JOEANIME_STARTUP_TIMINGS__ = {
    ...current,
    [name]: {
      durationMs: Math.round(value * 100) / 100,
      measuredAt: new Date().toISOString(),
      ...detail
    }
  };
}

export function measureStartupTask(name, task, detail = {}) {
  const startedAt = clockNow();
  const value = task();
  recordStartupTiming(name, clockNow() - startedAt, detail);
  return value;
}

export async function measureAsyncStartupTask(name, task, detail = {}) {
  const startedAt = clockNow();
  try {
    return await task();
  } finally {
    recordStartupTiming(name, clockNow() - startedAt, detail);
  }
}

export function deferUntilAfterFirstPaint(callback, { timeout = 1200 } = {}) {
  const entry = { callback, timeout, cancelled: false };
  deferredStartupQueue.push(entry);
  deferredActivityAt = clockNow();
  scheduleDeferredPump();

  return () => {
    entry.cancelled = true;
  };
}

export function startupTasksAreSettled({ quietFor = 160 } = {}) {
  return deferredStartupQueue.every((entry) => entry.cancelled)
    && deferredPumpFrameId == null
    && deferredPumpIdleId == null
    && deferredPumpTimerId == null
    && clockNow() - deferredActivityAt >= quietFor;
}
