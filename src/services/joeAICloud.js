const DEFAULT_LOCAL_JOEAI_URL = 'http://127.0.0.1:8787/api/joeai';

function envValue(name) {
  try {
    return import.meta.env?.[name];
  } catch {
    return undefined;
  }
}

function cloudEndpoint() {
  const configured = String(envValue('VITE_JOEAI_CLOUD_URL') || '').trim();
  if (configured) return configured;

  // Local dev gets the Wrangler endpoint automatically. Release builds stay
  // fully offline unless a production Worker URL is explicitly configured.
  return import.meta.env?.DEV ? DEFAULT_LOCAL_JOEAI_URL : '';
}

export function isJoeAICloudEnabled() {
  const explicit = String(envValue('VITE_JOEAI_CLOUD_ENABLED') || '').trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(explicit)) return false;
  return Boolean(cloudEndpoint());
}

function requestTimeoutMs() {
  const configured = Number(envValue('VITE_JOEAI_CLOUD_TIMEOUT_MS') || 0);
  if (Number.isFinite(configured) && configured >= 1000) return configured;
  return 30000;
}

export async function askJoeAICloud({ prompt, context = {}, mode = 'conversation' } = {}) {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) throw new Error('Cloud JoeAI needs a prompt.');

  const endpoint = cloudEndpoint();
  if (!endpoint) throw new Error('Cloud JoeAI is not configured for this build.');

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), requestTimeoutMs());

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: cleanPrompt,
        context,
        mode: String(mode || 'conversation')
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Cloud JoeAI timed out.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || `Cloud JoeAI request failed (${response.status}).`);
  }

  const text = String(payload?.text || '').trim();
  if (!text) throw new Error('Cloud JoeAI returned an empty response.');

  return {
    text,
    model: payload?.model || '',
    usage: payload?.usage || null,
    data: payload?.data ?? null,
    mode: payload?.mode || String(mode || 'conversation')
  };
}
