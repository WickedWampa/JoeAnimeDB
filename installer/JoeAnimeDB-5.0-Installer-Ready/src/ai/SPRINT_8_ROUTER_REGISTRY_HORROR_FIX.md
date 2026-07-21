# Sprint 8 Fix — Router + Registry + Horror

Fixes three bugs found during testing:

1. `I want horror` was treated like a title lookup.
2. `src/ai/modules/index.js` could leak module objects into the Genome registry as fake cards.
3. Trait Mixer did not have a dedicated horror trait.

## Run

```cmd
node scripts\patchSprint8RouterRegistryHorrorFix.cjs
node scripts\rebuildGenomeRegistry.cjs
npm run dev
```

## Test

- I want horror
- recommend something like Higurashi
- recommend Space Dandy
- I want spicy but wholesome
- I want funny cyberpunk
