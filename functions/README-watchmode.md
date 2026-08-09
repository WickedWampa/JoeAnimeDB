# Watchmode proxy setup

JoeAnimeDB calls the Cloudflare Pages Function at `/api/watchmode`. The function keeps the Watchmode API key out of the web, Electron, and Android bundles.

In the Cloudflare Pages project, open **Settings > Variables and Secrets** and add:

- `WATCHMODE_API_KEY` as an encrypted secret
- `WATCHMODE_REGIONS` as a plain variable containing three comma-separated country codes, such as `US,CA,GB`

Create a Workers KV namespace named `JOEANIMEDB_WATCHMODE_CACHE`. In the Pages project bindings, add that namespace with the binding name `WATCHMODE_CACHE`. Use the same binding name for preview deployments if the preview site needs Where to Watch testing.

Deploy the project again after adding the values and binding.

Workers KV is the persistent cache. The Cloudflare Cache API remains as a fallback if KV is temporarily unavailable or the binding is missing. The function caches confirmed title matches for 30 days, subscription-provider results for 7 days, and ambiguous matches for one day. Ambiguous matches are returned to the app for user confirmation.

Successful and review responses include a `cache` object for testing. A value of `KV` or `EDGE` is a cache hit, `MISS` means Watchmode was called and the result was stored, `BYPASS` means forced review skipped the match cache, and `CONFIRMED` means the app supplied a previously confirmed Watchmode ID.

Example test request:

```text
/api/watchmode?title=Bleach&year=2004&type=TV&region=US
```

Run the same request twice. The first response should report `MISS`; after the KV write completes, the second should report `KV` for the cached portions.

For local development or a nonstandard Pages domain, set these Vite variables before building:

- `VITE_WATCHMODE_PROXY_URL`
- `VITE_WATCHMODE_REGIONS`

Do not add `WATCHMODE_API_KEY` to a Vite variable or any file committed to Git.
