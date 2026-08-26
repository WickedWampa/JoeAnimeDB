import { createAnimeBrain } from '../engine/animeBrain';
import {
  buildQuickPickPool,
  QUICK_PICK_INTENTS
} from '../services/homeQuickPick';

let activeJob = null;

function processNextIntent() {
  const job = activeJob;
  if (!job || job.processing) return;
  const intentId = job.queue.shift();
  if (!intentId) {
    self.postMessage({ requestId: job.requestId, type: 'complete', timings: job.timings });
    activeJob = null;
    return;
  }

  job.processing = true;
  try {
    const intent = QUICK_PICK_INTENTS.find((candidate) => candidate.id === intentId);
    if (intent) {
      let intentTiming = null;
      const pool = buildQuickPickPool(job.context, intent.id, {
        joeAIState: job.joeAIState,
        onTiming: (timing) => {
          intentTiming = timing;
          job.timings.push(timing);
        }
      });
      self.postMessage({
        requestId: job.requestId,
        type: 'pool-ready',
        intentId: intent.id,
        pool,
        timing: intentTiming
      });
    }
  } catch (error) {
    self.postMessage({
      requestId: job.requestId,
      error: error?.message || String(error),
      timings: job.timings
    });
    activeJob = null;
    return;
  }
  job.processing = false;
  setTimeout(processNextIntent, 0);
}

self.onmessage = (event) => {
  const message = event.data || {};
  if (message.type === 'prioritize') {
    if (!activeJob || message.requestId !== activeJob.requestId) return;
    const index = activeJob.queue.indexOf(message.intentId);
    if (index > 0) {
      activeJob.queue.splice(index, 1);
      activeJob.queue.unshift(message.intentId);
    }
    return;
  }

  const { requestId, library = [], catalog = [], joeAIState = {}, intentIds } = message;
  const allowed = new Set(QUICK_PICK_INTENTS.map((intent) => intent.id));
  activeJob = {
    requestId,
    joeAIState,
    timings: [],
    processing: false,
    queue: (Array.isArray(intentIds) ? intentIds : QUICK_PICK_INTENTS.map((intent) => intent.id))
      .filter((intentId, index, values) => allowed.has(intentId) && values.indexOf(intentId) === index),
    context: { brain: createAnimeBrain(library, catalog, { joeAIState }) }
  };
  setTimeout(processNextIntent, 0);
};
