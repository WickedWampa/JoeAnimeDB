# 🚀 JoeAnimeDB — READ ME FIRST

If you are a new ChatGPT conversation, STOP.

Before writing code, proposing architecture, or making changes, read the documents in this exact order.

---

# 1) Read These Files

1. AI_SESSION_START.md
2. AI_CONTINUITY_GUIDE.md
3. CURRENT_STATUS.md
4. DECISIONS.md
5. KNOWN_BUGS.md
6. ROADMAP.md
7. CHANGELOG.md
8. PROJECT_VISION.md

Only after reading those files should you begin helping with the project.

---

# Repository

https://github.com/WickedWampa/JoeAnimeDB

Current working branch:

feature/anime-catalog

---

# Project Identity

JoeAnimeDB is **NOT** just an anime tracker.

It is an offline-first desktop Anime Intelligence Engine.

The long-term goal is to build the best desktop application for anime fans.

Major systems include:

- SQLite library
- JoeAI assistant
- Smart metadata updater
- Recommendation engine
- Manual metadata overrides
- Anime Genome system
- Gold Genome layer
- Trait Mixer
- Anime-adjacent support
- New User Mode

---

# Architecture Principles

Always preserve these rules.

## SQLite is the source of truth.

Do not bypass the database.

## Gold Genomes are authoritative.

Current priority:

Gold
↓
Core25
↓
Enhanced
↓
Core100
↓
Generated
↓
Modules

The registry keeps the FIRST duplicate ID.

Gold must always load first.

## Known-title lookup happens before mood routing.

Example:

recommend One Piece

must return the One Piece genome.

Generated genomes are fallback only.

---

# Engineering Philosophy

Prefer:

- Small patches
- Root-aware scripts
- Complete replacement files
- Safe refactors
- Git commits after milestones

Avoid:

- Massive rewrites
- Breaking working systems
- Hand-editing generated files unless debugging
- Guessing architecture

---

# Debugging Style

1. What works?
2. What changed?
3. What file owns the behavior?
4. Patch the smallest thing.
5. Test.
6. Commit.

---

# Working With Joe

Joe prefers:

- Practical solutions
- ZIP files
- Exact terminal commands
- Incremental improvements
- Honest debugging

Never pretend a fix worked.

---

# Current Status

Recent milestone:

✅ Gold Genome Architecture

Confirmed working:

- Bleach
- Naruto
- One Piece
- Arcane
- Castlevania
- Blue Eye Samurai

---

# Immediate Goal

1. Expand Gold Genome library
2. Improve recommendation quality
3. Improve nearby recommendations
4. Improve Trait Mixer
5. Continue metadata improvements

---

Welcome back.

Continue the project as the same engineering teammate—not as a brand-new assistant.
