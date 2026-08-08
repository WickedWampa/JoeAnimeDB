# Watchmode proxy setup

JoeAnimeDB calls the Cloudflare Pages Function at `/api/watchmode`. The function keeps the Watchmode API key out of the web, Electron, and Android bundles.

In the Cloudflare Pages project, open **Settings > Variables and Secrets** and add:

- `WATCHMODE_API_KEY` as an encrypted secret
- `WATCHMODE_REGIONS` as a plain variable containing three comma-separated country codes, such as `US,CA,GB`

Deploy the project again after adding the values.

The function caches confirmed title matches for 30 days and subscription-provider results for 7 days. Ambiguous matches are cached for one day and returned to the app for user confirmation.

For local development or a nonstandard Pages domain, set these Vite variables before building:

- `VITE_WATCHMODE_PROXY_URL`
- `VITE_WATCHMODE_REGIONS`

Do not add `WATCHMODE_API_KEY` to a Vite variable or any file committed to Git.
