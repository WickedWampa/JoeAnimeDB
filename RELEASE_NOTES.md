# JoeAnimeDB 5.0 Beta 19

Beta 19 focuses on the two things JoeAnimeDB is built to do every day: keep your library safe and help you find the next anime worth watching.

## JoeAI discovery polish

- Recommendation results now carry much better metadata, including real posters and useful title details when available.
- Recommendation posters and titles now open the full Anime Details view.
- From a JoeAI recommendation you can jump straight into synopsis, trailer, and Where to Watch links.
- JoeAI now filters titles already in your library out of new-discovery results.
- Unreleased / Coming Soon titles are filtered out of watch-now recommendations.
- Improved recommendation ranking when you ask for a specific direction such as darker, lighter, shorter, more action-focused, or similar constraints.
- Expanded routing and reliability coverage for shorthand titles, typos, natural recommendation phrasing, Japanese titles, episode limits, ownership filtering, and future-release filtering.

## Safer encrypted sync

- Added a clear Local titles -> Cloud titles preview before syncing.
- Fresh or empty linked devices now steer users toward Restore instead of accidentally replacing a populated cloud library.
- Upload is blocked when the device is behind the current cloud revision until the user restores first.
- Dangerous empty-library and large-deletion uploads require explicit typed confirmation.
- Restore warnings now call out local-only titles that would be removed.
- JoeAnimeDB saves safety copies before cloud upload and before restore.
- Added Restore Last Safety Copy for recovery from a bad manual sync decision.
- Sync safety checks also account for ratings, notes, favorites, rewatches, and other library state.

## Cross-platform workflow

- Web, Windows, Linux, and Android continue to share the same encrypted sync format.
- Android Beta 17+ uses the persistent release signing identity so Beta 19 can update in place from Beta 17 or Beta 18.
- MyAnimeList and AniList import/export remain supported.
- Where to Watch provider links continue to open from production builds.

## Testing

- Expanded JoeAI reliability coverage around routing, recommendation quality, owned-title exclusion, future-release exclusion, and preference-sensitive ranking.
- Expanded cloud-sync safety tests.
- Release-gate checks run before tagged desktop and Android builds are published.

This is a public beta. Keep a separate backup and keep your Recovery Kit private. Please report incorrect recommendations, missing metadata, sync/restore problems, provider links that do not open, or anything that gets in the way of updating your library and finding your next show.
