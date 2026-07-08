# Sprint 8 — Unified JoeAI Recommendation Router

Adds:

- src/ai/joeAIRecommendationRouter.js

The router tries, in order:

1. Existing Knowledge/Genome/Intent pipeline
2. Genome-only "something like X" source lookup
3. Direct Intent Engine
4. Direct Genome title mention

## Fixes

- recommend Space Dandy
- recommend something like Higurashi
- I want horror
- I want spicy but wholesome
- funny cyberpunk

## Why

JoeAI had several competing paths:
- generic Anime DNA cards
- Knowledge-first recommendations
- Intent Engine
- Trait Mixer
- Genome title cards

This creates one unified routing layer before falling back to old Anime DNA cards.
