# Sprint 8 — Registry Builder Module Wiring

This patch wires `src/ai/modules` into `scripts/rebuildGenomeRegistry.cjs`.

## What changed

The registry builder now scans:

- src/ai/genome/core25
- src/ai/genome/enhanced
- src/ai/genome/core100
- src/ai/modules

It also understands Knowledge Module exports like:

```js
export const COMEDY_MODULE = {
  id: 'comedy',
  cards: [...]
}
```

and turns `module.cards` into active Genome Registry cards.

## Added to module cards

- moduleId
- moduleName
- joeNote
- registrySource

## Run

```cmd
node scripts\patchSprint8WireModulesIntoRegistryBuilder.cjs
node scripts\rebuildGenomeRegistry.cjs
npm run dev
```

## Test

- I want spicy but wholesome
- recommend Space Dandy
- I want horror
- recommend something like Higurashi
