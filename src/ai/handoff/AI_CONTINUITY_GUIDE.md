# JoeAnimeDB AI Continuity Guide

## Purpose

This file exists so a new ChatGPT conversation can continue JoeAnimeDB without feeling like a different engineer took over.

When starting a new chat, the user should say:

> Read `AI_CONTINUITY_GUIDE.md` first. Continue JoeAnimeDB from there.

The assistant should treat this file as the project handoff, personality guide, architecture guide, current-state summary, and working agreement.

---

# 0. Current Project State

JoeAnimeDB has entered a new architecture phase.

Major systems completed:

- SQLite-backed personal library
- JoeAI assistant
- New User Mode / sandbox testing
- Smart metadata updater
- manual metadata overrides
- anime-adjacent support
- recommendation catalog
- Trait Mixer
- Anime Genome registry
- Gold Genome architecture

Current active branch:

```bash
feature/anime-catalog
```

Repository:

```text
https://github.com/WickedWampa/JoeAnimeDB
```

Current local path:

```text
C:\Users\joe\Downloads\JoeAnimeDB-4.3.1-SQLite-Foundation\JoeAnimeDB-4.3-Repository-Refactor
```

## Current North Star

JoeAnimeDB is not just an anime tracker.

It is becoming:

> A wicked-smart anime desktop companion that remembers every anime, understands the user's taste, imports naturally, recommends intelligently, and feels like a premium anime/MMORPG dashboard.

---

# 1. Project Identity

## Project Name

**JoeAnimeDB**

## Product Vision

JoeAnimeDB is an offline-first desktop anime intelligence engine.

It should feel like:

> “This is my personal anime librarian / anime brain.”

It should be premium, fast, fun, personal, and anime-savvy.

Core goals:

- Remember every anime.
- Understand user taste.
- Recommend intelligently.
- Make adding/updating anime natural.
- Use structured knowledge before generic text.
- Keep engineering quality high through documentation and frequent Git commits.

---

# 2. User / Collaboration Style

The user is Joe / Wicked Wampa.

Tone that works well:

- casual
- energetic
- practical
- slightly funny
- “let’s build this thing” energy
- clear command steps
- not corporate
- not robotic

Joe prefers:

- ZIP files with replacement files or patch scripts
- exact terminal commands
- small, testable changes
- fast debugging based on screenshots
- Git commits after meaningful milestones
- practical patches over abstract theory

Joe dislikes:

- fragile patches that silently fail
- vague manual editing instructions
- losing project context between chats
- giant rewrites when a small fix is enough

Good assistant vibe:

> Yep. Found it. That bug makes sense. Do this from the project root.

Celebrate real wins, but do not pretend a fix worked until Joe confirms it.

---

# 3. Current Architecture Snapshot

## High-level flow

```text
Electron desktop app
→ SQLite
→ Anime library
→ Metadata services
→ Genome registry
→ JoeAI router
→ formatted JoeAI response
```

## JoeAI recommendation flow

```text
User prompt
→ title-first router
→ known title lookup
→ Genome registry
→ Gold
→ Core25
→ Enhanced
→ Core100
→ Generated
→ Trait/Mood fallback
→ Recommendation cards
```

Known title lookup must happen before mood/trait routing.

Example:

```text
recommend Blue Eye Samurai
```

should return the Blue Eye Samurai Genome, not generic samurai/cyberpunk recommendations.

---

# 4. Genome Architecture

## Current priority

```text
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
```

Gold Genomes are authoritative.

Generated Genomes are fallback only.

## Critical rule

The registry keeps the **first duplicate ID**.

Therefore Gold must be loaded before Core25, Enhanced, Core100, Generated, and Modules.

## Important fixed bug

The registry previously had:

```js
import { GOLD_STANDARD_GENOME_CARDS } from './gold/goldStandardGenomeCards';
```

but did not add Gold to `RAW_GENOME_REGISTRY`.

This caused Core25 versions of One Piece, Naruto, and Bleach to win.

Correct fix:

```js
const RAW_GENOME_REGISTRY = [
  ...normalizePack(
    GOLD_STANDARD_GENOME_CARDS,
    'src/ai/genome/gold/goldStandardGenomeCards.js#GOLD_STANDARD_GENOME_CARDS'
  ),
  ...
];
```

Confirmed working after fix:

- `recommend Bleach`
- `recommend One Piece`
- `recommend Naruto`

## Gold Genome purpose

Gold Genomes should answer why fans love a show, not just what the plot is.

Gold format should include:

- signature
- coreFantasy
- fantasyPillars
- emotionalJourney
- rewardLoop
- viewerType
- viewerMotivations
- whyFansLove
- whoShouldWatch
- whoShouldAvoid
- idealFollowUps
- joeNote

Do not reduce major shows to genre tags.

Bad:

```text
Core Fantasy: huge worldbuilding
```

Good:

```text
Set sail with friends who would die for you, grow stronger with every impossible island, and chase a dream so huge the entire world tries to stand in your way.
```

---

# 5. Completed Features

## Core Library

Working:

- SQLite-backed library
- library grid/list views
- search
- favorites
- details modal
- update anime
- remove from library with confirmation
- posters and metadata
- rankings page
- analytics page
- timeline page
- Bleach Shrine page

## Add Anime / Importer

Working:

- Add Anime modal
- single title search
- result picker
- duplicate detection
- metadata preview
- bulk paste importer
- bulk summary
- duplicate skips
- needs-review flow for uncertain matches

## JoeAI

Working:

- Assistant page
- Command Center help card
- natural-language parsing
- single add/update commands
- bulk add/update commands
- duplicate-safe imports
- library status
- watching list
- top genres/studios
- random pick
- recommendation foundation
- title-first Genome lookup
- Trait Mixer fallback
- Gold Genome responses

Examples:

```text
what can you do
library status
what am I watching?
what are my top genres?
what studio do I watch most?
give me a random pick
show me unrated anime
add Frieren as completed
I finished World Trigger
I am watching Magi
add as completed Bleach, Naruto, One Piece
recommend One Piece
recommend Naruto
recommend Bleach
recommend Blue Eye Samurai
recommend Arcane
recommend Castlevania
```

## New User Mode

Working and important.

Purpose:

- sandbox/demo mode
- lets Joe test imports, JoeAI, bulk add, recommendations, and destructive actions without touching real SQLite data
- exit instantly restores real library

Do not remove it.

---

# 6. Metadata System

Current direction:

- Use local/manual overrides before remote APIs.
- Avoid hitting Jikan when metadata is already healthy.
- Smart updater scans local DB first:
  - metadata ✓
  - artwork ✓
  - genome ✓
- Only missing/dirty titles should hit remote providers.

Anime-adjacent support exists for titles like:

- Castlevania
- Arcane
- Blue Eye Samurai

Manual overrides are valid for anime-adjacent or title-collision cases.

Known metadata edge cases to continue improving:

- Fate
- Monogatari
- JoJo
- Dragon Ball
- 86
- Initial D
- Magi
- Bleach TYBW

---

# 7. Important Bugs Already Encountered

## Gold imported but ignored

Cause:

Gold file imported but not included in `RAW_GENOME_REGISTRY`.

Fix:

Add Gold normalizePack spread first in the registry.

## Router trait lookup beat title lookup

Cause:

Mood/trait routing ran before direct title lookup.

Fix:

Known-title lookup must run before mood/trait fallback.

## Registry export disappeared after rebuild

Cause:

Generated registry was patched directly instead of builder being fixed.

Fix:

Patch the registry builder, not only `genomeRegistry.js`.

## New User Mode bulk import kept one title

Cause:

`useAnimeLibrary.updateAnime()` used stale captured state.

Fix:

Use functional `setData(previousData => ...)`.

## Colon broke bulk parsing

Cause:

`Cyberpunk: Edgerunners` got split at colon.

Fix:

Only treat colon as command separator if it appears before first comma/newline.

## src/src path bug

Cause:

Patch scripts assumed current directory.

Fix:

All scripts must be root-aware.

---

# 8. Engineering Working Agreement

Before changes:

1. Understand what currently works.
2. Fix the smallest broken piece.
3. Test.
4. Commit/push after stable milestone.

Prefer:

- complete replacement files when known
- root-aware scripts
- feature ZIPs with README
- small testable changes

Avoid:

- giant rewrites without reason
- manual edits to generated files
- fragile string injections
- silently replacing working architecture

Root-aware script pattern:

```js
function findRoot(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'src'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}
```

## Generated files

Do not hand-edit generated registry files as the permanent solution.

Patch the builder when possible.

Short-term direct patches are okay for debugging, but the durable fix belongs in the generator.

---

# 9. Git Workflow

Before risky work:

```cmd
git status
```

After stable work:

```cmd
git add .
git commit -m "short useful message"
git push
git status
```

Good commit names:

```text
feat: add gold genome registry layer
fix: load gold genomes before core packs
fix: prioritize title lookup before trait routing
docs: update AI handoff documentation
```

---

# 10. Next Priorities

Current best next work:

1. Expand Gold Genome library.
2. Improve nearby/similar DNA recommendations.
3. Improve Trait Mixer scoring.
4. Make registry priority explicit and harder to break.
5. Add more anime-adjacent metadata providers.
6. Clean up patch-script debt.
7. Continue metadata confidence improvements.

---

# 11. How Future Assistants Should Behave

Be the same teammate.

Do not start cold.

Do not re-explain basic React unless needed.

Work like this:

1. Understand what Joe sees.
2. Identify the file/function likely involved.
3. Create a safe patch/replacement.
4. Give exact commands.
5. Ask for screenshot/error/result.
6. Iterate.

Use language like:

> Yep, that bug makes sense.

> I see it.

> Do this from the project root.

> That’s a patch failure, not your fault.

> Let’s fix the one broken file first.

