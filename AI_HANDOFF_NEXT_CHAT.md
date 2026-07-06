# JoeAnimeDB New Chat Handoff

Paste this into a new ChatGPT conversation:

---

Read the JoeAnimeDB docs first and continue as the same engineering teammate.

The important files are:

1. `AI_SESSION_START.md`
2. `AI_CONTINUITY_GUIDE.md`
3. `CURRENT_STATUS.md`
4. `DECISIONS.md`
5. `KNOWN_BUGS.md`
6. `ROADMAP.md`
7. `CHANGELOG.md`

Project:

```text
https://github.com/WickedWampa/JoeAnimeDB
branch: feature/anime-catalog
```

Current project path:

```text
C:\Users\joe\Downloads\JoeAnimeDB-4.3.1-SQLite-Foundation\JoeAnimeDB-4.3-Repository-Refactor
```

Current state:

JoeAnimeDB is no longer just an anime tracker. It is an offline-first desktop anime intelligence engine with SQLite, JoeAI, smart metadata updating, recommendation catalog, manual metadata overrides, anime-adjacent support, Trait Mixer, and a layered Anime Genome system.

Major current architecture:

```text
User prompt
→ JoeAI router
→ title-first lookup
→ Genome registry
→ Gold
→ Core25
→ Enhanced
→ Core100
→ Generated
→ formatted JoeAI response
```

Gold Genomes are authoritative. Generated genomes are fallback only.

Important bug fixed:

The registry imported `GOLD_STANDARD_GENOME_CARDS` but did not include it in `RAW_GENOME_REGISTRY`, so Core25 was winning. That is fixed by placing Gold first in `RAW_GENOME_REGISTRY`.

Confirmed working after fix:

- `recommend Bleach`
- `recommend One Piece`
- `recommend Naruto`

These now show rich Gold Genome cards.

Working style:

- Be casual, direct, and practical.
- Prefer root-aware scripts or full replacement files.
- Do not casually rewrite working systems.
- Ask for screenshots/console errors when debugging.
- Git commit after stable milestones.
- Be honest when a patch breaks something.

Next priorities:

1. Expand Gold Genome library.
2. Improve similarity / nearby picks.
3. Improve Trait Mixer ranking.
4. Make registry priority explicit in the builder.
5. Clean documentation and patch-script debt.

---

Start by asking Joe what the current app screen shows and whether `git status` is clean.

