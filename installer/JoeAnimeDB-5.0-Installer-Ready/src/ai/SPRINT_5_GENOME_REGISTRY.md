# Sprint 5 — Genome Registry System

This adds a central Genome Registry.

## Purpose

The registry merges Genome data in priority order:

1. Core25 Expert Cards
2. Enhanced Packs
3. Core100 Starter Cards
4. Legacy Starter Cards

The first card with a matching id wins.

## Why this matters

This lets us add packs without manually rewriting recommendation logic every time.

Future packs should live under:

- src/ai/genome/enhanced/fantasy/
- src/ai/genome/enhanced/sports/
- src/ai/genome/enhanced/scifi/
- src/ai/genome/enhanced/romance/
- src/ai/genome/enhanced/action/
- src/ai/genome/enhanced/classics/

Then the registry can become the single source of truth for JoeAI recommendations.
