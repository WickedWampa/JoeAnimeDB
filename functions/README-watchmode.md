# Watchmode proxy setup

JoeAnimeDB calls the Cloudflare Pages Function at `/api/watchmode`. The function keeps the Watchmode API key out of the web, Electron, and Android bundles.

In the Cloudflare Pages project, open **Settings > Variables and Secrets** and add:

- `WATCHMODE_API_KEY` as an encrypted secret
- `WATCHMODE_REGIONS` as a plain variable containing three comma-separated country codes, such as `US,CA,GB`
- `WATCHMODE_MONTHLY_CREDIT_LIMIT` as an optional plain integer. It defaults to `2000` and is hard-capped at `2400`, leaving at least 100 of the free plan's 2,500 requests unused.

Create a Workers KV namespace named `JOEANIMEDB_WATCHMODE_CACHE`. In the Pages project bindings, add that namespace with the binding name `WATCHMODE_CACHE`. Use the same binding name for preview deployments if the preview site needs Where to Watch testing.

Deploy the project again after adding the values and binding.

Workers KV is the persistent cross-user cache. The Cloudflare Cache API can serve an existing edge hit, but a fresh Watchmode request is refused unless the `WATCHMODE_CACHE` KV binding is healthy. This prevents separate installations from independently spending quota for the same title.

JoeAnimeDB runs Watchmode in zero-dollar mode:

- There is no automatic catalog crawler. Home and Discover read saved provider results only.
- Only an organic user action that opens Where to Watch / Quick Watch may request fresh data.
- The Worker owns the only copy of `WATCHMODE_API_KEY`; the web, Electron, and Android clients never receive it.
- Cache identity includes the title identity and region. US, CA, and GB results cannot contaminate one another.
- The complete subscription-provider list is cached. The user's selected streaming apps filter that list locally without another Watchmode request.
- Confirmed title matches are cached for 30 days. Non-empty provider results are fresh for 28 days and retained for at most 30 days solely as a quota/rate-limit fallback. Empty provider results, ambiguous matches, and not-found matches use a one-day negative-cache window.
- The Worker reserves one credit for every actual upstream Watchmode call, then reconciles the shared counter from Watchmode's authoritative `X-Account-Quota-Used` and `X-Account-Quota` response headers. This captures account usage outside JoeAnimeDB and any endpoint whose real credit cost is higher than the local estimate. It refuses the next fresh call once authoritative usage reaches the configured 2,000-credit ceiling, leaving 500 requests of headroom for KV propagation/concurrency and interactive use. Cached responses consume no Watchmode credit.
- If the local budget or Watchmode rate limit is reached, fresh upstream calls pause. A still-legal stale provider result is served when available; otherwise the feature reports temporary unavailability without affecting the rest of JoeAnimeDB.

Successful and review responses include `cacheBackend` plus a `cache` object for testing. `cacheBackend: "KV"` confirms that the persistent cross-user namespace is bound. A cache value of `KV` or `EDGE` is a cache hit, a value ending in `_STALE` is the legal stale fallback, `MISS` means Watchmode was called and the result was stored, `BYPASS` means forced review skipped the match cache, and `CONFIRMED` means the app supplied a previously confirmed Watchmode ID.

Example test request:

```text
/api/watchmode?title=Bleach&year=2004&type=TV&region=US
```

Run the same request twice. The first response should report `MISS`; after the KV write completes, the second should report `KV` for the cached portions.

For local development or a nonstandard Pages domain, set these Vite variables before building:

- `VITE_WATCHMODE_PROXY_URL`
- `VITE_WATCHMODE_REGIONS`

Do not add `WATCHMODE_API_KEY` to a Vite variable or any file committed to Git.
