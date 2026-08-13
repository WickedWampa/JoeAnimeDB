# JoeAnimeDB 5.0 Beta 13

Beta 13 focuses on JoeAI recommendation quality, discovery reliability, and a cleaner desktop experience. It also keeps the same shared application code working across web, Windows, Linux, and the Android beta.

## Smarter JoeAI recommendations

- Added catalog-backed recommendation routing so JoeAI can search beyond titles already stored in the user's library.
- Strengthened library exclusion rules to reduce recommendations for titles the user already tracks.
- Added metadata hydration for catalog discoveries, including artwork, episode counts, years, studios, ratings, and content-rating data when providers supply it.
- Backfilled filtered recommendation sets so JoeAI continues searching instead of returning only one or two usable titles.
- Improved natural completion requests such as "I just finished Slime" so JoeAI responds with relevant follow-up recommendations instead of dumping the completed library.
- Preserved JoeAI conversation history when users leave the page and return during the same app session.

## Discovery reliability

- Improved recommendation deduplication across title variants, alternate names, and existing library entries.
- Added safer catalog and metadata fallbacks when a provider returns incomplete data.
- Expanded routing and release-gate coverage for common recommendation, completion, and library-status prompts.

## Desktop interface improvements

- Redesigned the desktop sidebar as a more polished command rail with clearer grouping, stronger active states, and improved spacing.
- Refined the Settings background treatment so theme artwork fits the page instead of appearing heavily zoomed.
- Kept the responsive bottom navigation and mobile layouts isolated from the desktop sidebar changes.

## Platform consistency

- Updated version identity to 5.0.0-beta.13 across web, Windows, Linux, and Android.
- Verified that the production web build and Android synchronization use the shared JoeAI and discovery changes.
- Retained MyAnimeList and AniList import and export support across supported platforms.

This is a public beta. Please report incorrect or repeated recommendations, missing discovery artwork or metadata, persistence problems, import mismatches, broken provider links, or controls that do not respond.
