# Permanent Alias Registry Fix

This fixes the bug where `findGenomeCardByTitle` disappeared after rebuilding the Genome registry.

## What changed

- `scripts/rebuildGenomeRegistry.cjs` now generates:
  - `GENOME_ALIAS_INDEX`
  - `findGenomeCardByTitle()`
  - `findGenomeCardFromRegistry()` as a compatibility alias
- `src/ai/titleAliases.js` is the shared canonical title helper.
- `joeAIRecommendationRouter.js` uses alias-aware lookups.
- Known title lookup now happens before generic mood/trait routing.

## Test

```cmd
node scripts\checkPermanentAliasRegistry.cjs
npm run dev
```

Then ask:

```text
recommend Blue Eye Samurai
recommend BES
recommend Arcane
```
