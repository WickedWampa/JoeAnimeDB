# Auto Generate Genomes on Database Update

This changes the Settings button from:

```text
Update Database
```

to:

```text
Update Database + Genomes
```

## What it does

1. Runs the existing metadata update.
2. Sends the library list to Electron main.
3. Generates missing Genome cards for titles without Genome coverage.
4. Rebuilds the Genome registry.

## Added

- scripts/generateMissingGenomesForList.cjs
- ipcMain handler: genome:generateMissingForLibrary
- preload bridge: window.JoeAnimeDB.generateMissingGenomesForLibrary
- Settings button wrapper
- scripts/checkAutoGenomeUpdate.cjs

## Test

```cmd
node scripts\checkAutoGenomeUpdate.cjs
npm run dev
```

Then go to Settings and click:

```text
Update Database + Genomes
```

## Note

For a huge library, first run may take a while because Jikan requests are spaced out to avoid hammering the API.
