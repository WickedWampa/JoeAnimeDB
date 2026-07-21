JoeAnimeDB current-src metadata repair identity fix

Drop this ZIP into the project root and overwrite the two files.

Fixes:
- Existing library id is now the only authoritative match for repairs.
- Provider malId collisions can no longer redirect an update into another title.
- Single-title repair explicitly preserves the original library id.
- The repository throws instead of silently accepting a reduced library count.

Test:
1. Add the Metadata Gauntlet titles.
2. Note the library count.
3. Repair them one at a time.
4. Verify the count never decreases and previously repaired titles remain present.
