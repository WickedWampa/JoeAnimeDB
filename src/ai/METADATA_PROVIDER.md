# Metadata Provider

Adds a clean metadata provider layer:

```text
Metadata Provider
  ├─ Manual Overrides
  └─ Jikan
```

## Why

Some anime-adjacent shows, like Castlevania, are not normal Jikan/MAL anime entries.

The provider checks manual overrides first, then falls back to Jikan.

## Test

```cmd
node scripts\checkMetadataProvider.cjs
npm run dev
```

Then run the updater. Castlevania should repair from local manual metadata instead of Jikan.
