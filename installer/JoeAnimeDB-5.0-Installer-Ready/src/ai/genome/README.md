# Sprint 5 Phase 1 — Anime Genome Foundation

Adds:
- src/ai/genome/genomeCards.js
- src/ai/genome/genomeEngine.js

What it does:
- Starts replacing broad genre matching with identity-based Genome Cards.
- Adds Initial D, Dorohedoro, Bleach, and Frieren starter cards.
- Lets the recommender use Genome scoring when both source and candidate have cards.

Run:

node scripts\patchSprint5Phase1AnimeGenome.cjs
npm run dev

Test:
- I want to watch something like Initial D
- I want to watch something like Dorohedoro
