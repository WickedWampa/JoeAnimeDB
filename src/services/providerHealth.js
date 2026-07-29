const PROVIDER_TIMEOUT_MS = 8000;

async function timedProviderCheck({ id, label, role, url, headers = {} }) {
  const controller = new AbortController();
  const startedAt = performance.now();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const targetUrl = new URL(url);
    targetUrl.searchParams.set('_joeanimeHealth', String(Date.now()));

    const response = await fetch(targetUrl.toString(), {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...headers
      },
      credentials: 'omit'
    });

    if (!response.ok) {
      throw new Error(`${label} returned ${response.status}`);
    }

    await response.json();

    return {
      id,
      label,
      role,
      online: true,
      latencyMs: Math.max(1, Math.round(performance.now() - startedAt)),
      checkedAt: new Date().toISOString(),
      message: 'Online'
    };
  } catch (error) {
    return {
      id,
      label,
      role,
      online: false,
      latencyMs: Math.max(1, Math.round(performance.now() - startedAt)),
      checkedAt: new Date().toISOString(),
      message: error?.name === 'AbortError'
        ? `Timed out after ${PROVIDER_TIMEOUT_MS / 1000}s`
        : error?.message || 'Unavailable'
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkMetadataProviders() {
  const checks = await Promise.all([
    timedProviderCheck({
      id: 'kitsu',
      label: 'Kitsu',
      role: 'Primary anime metadata',
      url: 'https://kitsu.io/api/edge/anime?page[limit]=1',
      headers: { Accept: 'application/vnd.api+json' }
    }),
    timedProviderCheck({
      id: 'wikidata',
      label: 'Wikidata',
      role: 'Missing-field repair',
      url: 'https://www.wikidata.org/w/api.php?action=wbsearchentities&search=anime&language=en&format=json&limit=1&origin=*'
    })
  ]);

  return {
    checkedAt: new Date().toISOString(),
    online: checks.filter((provider) => provider.online).length,
    total: checks.length,
    providers: checks
  };
}
