# Sprint 5 — Genome Opinion Mode Bridge

JoeAI previously had two separate systems:

1. Legacy handcrafted Opinion Profiles
2. Anime Genome Cards

This caused messages like:

> I do not have a handcrafted opinion profile for Ghost in the Shell yet...

even when a Genome Card existed.

This bridge teaches JoeAI to use Genome Cards as opinion context before falling back to legacy Anime DNA wording.

## Expected behavior

For titles with Genome Cards, JoeAI should say something closer to:

> JoeAI Genome Mode: Ghost in the Shell

instead of:

> I do not have a handcrafted opinion profile...

## Test prompts

- recommend something like Ghost in the Shell
- I want something like 86
- recommend philosophical sci-fi
- I want something like Dorohedoro

