# Phase 2 — One-Click Genome Generation

This adds Electron IPC support for generating Genome cards from inside JoeAI.

## New behavior

In JoeAI:

```text
generate genome for Lord of Mysteries
```

Expected flow:

1. Electron main runs `scripts/generateGenomeCardForTitle.cjs`
2. Electron main runs `scripts/rebuildGenomeRegistry.cjs`
3. JoeAI replies that the Genome was generated

## Files patched

- main.cjs
- preload.cjs
- src/ai/commandExecutor.js

## Test

```text
generate genome for Lord of Mysteries
recommend Lord of Mysteries
```

Generated cards are still marked:

```js
quality: 'generated'
needsReview: true
```

## Commit

```cmd
git add .
git commit -m "feat: add one-click genome generation IPC"
git push
```
