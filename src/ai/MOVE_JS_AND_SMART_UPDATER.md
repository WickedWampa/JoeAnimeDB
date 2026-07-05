# Move JS Out of Styles + Smart Updater

## What changed

- Moved `src/styles/useAnimeLibrary.js` to `src/hooks/useAnimeLibrary.js`
- Moved `src/styles/animeImporter.js` to `src/services/animeImporter.js`
- Updated imports across `src`
- Upgraded metadata update to local-audit first:
  - skip titles that already have usable metadata/artwork
  - only hit Jikan for missing/dirty/repair items
  - then build catalog
  - then generate missing Genome cards

## Test

```cmd
node scripts\checkMoveAndSmartUpdater.cjs
npm run dev
```

Then go to Settings and run the updater.

## Commit

```cmd
git add .
git commit -m "refactor: move hooks out of styles and add smart updater"
git push
```
