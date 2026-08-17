JoeAnimeDB Web Persistence Hardening

What this pack changes

1. Web libraries are stored in IndexedDB instead of localStorage.
2. Existing joeanimedb.com libraries migrate automatically the first time the updated site loads.
3. The old localStorage database is removed only after IndexedDB accepts the migrated snapshot.
4. If IndexedDB is unavailable or fails, JoeAnimeDB falls back to localStorage instead of blocking the user.
5. The web data-safety notice requests persistent browser storage when supported and reports its status.
6. Desktop SQLite and Android database bridges are unchanged.

Installation

Extract this archive into the project root and allow it to replace matching files.

Verification completed

- npm run test:reliability
- npm run build

Recommended release check

1. Open the current live version and confirm the existing library is populated.
2. Deploy the updated build.
3. Reload the same joeanimedb.com origin.
4. Confirm library counts, ratings, statuses, and recommendations are unchanged.
5. Export JoeAnimeDB-backup.json from Settings.

Do not test migration by clearing site data. Clearing site data deletes both localStorage and IndexedDB.
