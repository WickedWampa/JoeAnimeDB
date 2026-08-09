# JoeAnimeDB 5.0 Beta 12

## Reliability and data safety

- Strengthened first-run behavior for empty, small, and imperfect libraries.
- Hardened browser persistence, full backup restore, and rolling backup replacement.
- Prevented stale New User Mode state from hiding an existing desktop SQLite library after an update.
- Fixed an Electron preload startup failure that could make desktop show an empty browser-backed library instead of the existing SQLite database.
- Added a release gate covering import and export, backups, filtering, JoeAI routing, version identity, and visible button wiring.

## Discovery and JoeAI

- Expanded the Gold Genome registry to 100 active cards.
- Improved recommendation uniqueness, artwork recovery, and routing for common library and recommendation requests.
- Improved the JoeAI composer on phones and tablets with a full-width writing area and stacked action button.

## Platform consistency

- Standardized the displayed version across web, Windows, Linux, and Android builds.
- Added automated release checks to the web, Windows, Linux, and Android workflows.
- Retained MyAnimeList and AniList import and export support across supported platforms.

## From Beta 11

- Introduced the Android beta alongside the existing Windows and Linux releases.
- Added responsive mobile navigation, local SQLite storage, and APK installation without Google Play.
- Restored complete metadata for newly discovered recommendations and reduced repeated results.
- Added MyAnimeList XML and AniList JSON/CSV import and export.

This remains a public beta. Please report persistence problems, import mismatches, incorrect recommendations, broken provider links, or controls that do not respond.
