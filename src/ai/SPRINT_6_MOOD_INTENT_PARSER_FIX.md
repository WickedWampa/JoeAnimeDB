# Sprint 6 — Mood Intent Parser Fix

## Problem

Prompts like:

- I want something comforting
- I want mind games
- i want something funny

were being classified as generic questions because they did not contain words like "recommend", "watch", or "next".

That meant they bypassed the Intent Engine.

## Fix

The parser now treats mood/vibe words as recommendation intents.

## Test prompts

- I want something comforting
- I want mind games
- i want something funny
- make me cry
- I want cyberpunk
- give me something dark
