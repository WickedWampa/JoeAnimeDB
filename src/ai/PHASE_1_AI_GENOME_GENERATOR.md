# Phase 1 — AI Genome Generator

Adds a first-pass draft Genome generator.

## Usage

Heuristic draft only:

```cmd
node scripts\generateGenomeCardForTitle.cjs "Space Dandy"
node scripts\rebuildGenomeRegistry.cjs
npm run dev
```

AI-assisted draft:

```cmd
set OPENAI_API_KEY=your_key_here
set OPENAI_MODEL=gpt-4o-mini
node scripts\generateGenomeCardForTitle.cjs "Lord of Mysteries"
node scripts\rebuildGenomeRegistry.cjs
npm run dev
```

Generated cards are saved to:

`src/ai/genome/generated/generatedGenomeCards.js`

and are marked:

```js
quality: 'generated'
generated: true
needsReview: true
```
