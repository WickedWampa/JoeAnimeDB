JoeAnimeDB v5 MAL Identity Migration

1. Back up the current JoeAnime.db before first run.
2. Copy this package into the project root and replace matching files.
3. Run npm run dev.
4. Click Update Database once.
5. The updater refreshes MAL IDs/canonical titles, then collapses duplicate
   library records sharing the same MAL ID while preserving personal fields.

Identity order:
- MAL ID first
- Local ID second
- Title matching only for legacy records without a MAL ID
