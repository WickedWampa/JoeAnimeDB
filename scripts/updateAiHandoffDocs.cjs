const fs = require('fs');
const path = require('path');

function findRoot(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'src'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const root = findRoot(process.cwd());

function writeFile(rel, content) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart() + '\n', 'utf8');
  console.log('Wrote:', rel);
}

function appendSection(rel, heading, content) {
  const file = path.join(root, rel);
  let current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';

  if (current.includes(heading)) {
    console.log('Already has section:', rel, heading);
    return;
  }

  current = current.trimEnd() + '\n\n' + heading + '\n\n' + content.trim() + '\n';
  fs.writeFileSync(file, current, 'utf8');
  console.log('Updated:', rel);
}

const currentStatus = `# Current Status

## Snapshot

JoeAnimeDB is currently on the \`feature/anime-catalog\` branch.

Repository:

\`\`\`text
https://github.com/WickedWampa/JoeAnimeDB
\`\`\`

Local project path usually used by Joe:

\`\`\`text
C:\\Users\\joe\\Downloads\\JoeAnimeDB-4.3.1-SQLite-Foundation\\JoeAnimeDB-4.3-Repository-Refactor
\`\`\`

## Current Milestone

JoeAnimeDB has moved beyond a basic anime tracker.

It is now an offline-first desktop anime intelligence engine with:

- SQLite-backed personal library
- JoeAI assistant
- smart metadata updater
- manual metadata overrides
- recommendation catalog
- Anime Genome registry
- Gold Genome layer
- anime-adjacent support
- Trait Mixer
- title-first recommendation routing

## Latest Major Win

Gold Genome architecture is working.

Confirmed in-app:

- \`recommend Bleach\` uses the Gold Genome
- \`recommend One Piece\` uses the Gold Genome
- \`recommend Naruto\` uses the Gold Genome

The key bug was:

\`\`\`js
import { GOLD_STANDARD_GENOME_CARDS } from './gold/goldStandardGenomeCards';
\`\`\`

existed, but \`GOLD_STANDARD_GENOME_CARDS\` was not added to \`RAW_GENOME_REGISTRY\`.

Fix:

\`\`\`js
const RAW_GENOME_REGISTRY = [
  ...normalizePack(
    GOLD_STANDARD_GENOME_CARDS,
    'src/ai/genome/gold/goldStandardGenomeCards.js#GOLD_STANDARD_GENOME_CARDS'
  ),
  ...
];
\`\`\`

Gold must be first because duplicate IDs keep the first card.

## Genome Priority

\`\`\`text
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
\`\`\`

Gold is authoritative.

## Stable Systems

Do not rewrite casually:

- SQLite library
- New User Mode
- smart metadata updater
- metadata provider/manual override system
- JoeAI router
- genome registry builder
- Gold Genome layer

## Current Focus

Next work should focus on:

1. Expanding Gold Genomes from 20 toward 100 flagship titles.
2. Improving recommendation confidence.
3. Improving nearby picks / similar DNA logic.
4. Cleaning patch-script debt.
5. Making registry priority explicit and hard to break.
`;

const handoff = `# JoeAnimeDB New Chat Handoff

Paste this into a new ChatGPT conversation:

---

Read the JoeAnimeDB docs first and continue as the same engineering teammate.

The important files are:

1. \`AI_SESSION_START.md\`
2. \`AI_CONTINUITY_GUIDE.md\`
3. \`CURRENT_STATUS.md\`
4. \`DECISIONS.md\`
5. \`KNOWN_BUGS.md\`
6. \`ROADMAP.md\`
7. \`CHANGELOG.md\`

Project:

\`\`\`text
https://github.com/WickedWampa/JoeAnimeDB
branch: feature/anime-catalog
\`\`\`

Current project path:

\`\`\`text
C:\\Users\\joe\\Downloads\\JoeAnimeDB-4.3.1-SQLite-Foundation\\JoeAnimeDB-4.3-Repository-Refactor
\`\`\`

Current state:

JoeAnimeDB is no longer just an anime tracker. It is an offline-first desktop anime intelligence engine with SQLite, JoeAI, smart metadata updating, recommendation catalog, manual metadata overrides, anime-adjacent support, Trait Mixer, and a layered Anime Genome system.

Major current architecture:

\`\`\`text
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
\`\`\`

Gold Genomes are authoritative. Generated genomes are fallback only.

Important bug fixed:

The registry imported \`GOLD_STANDARD_GENOME_CARDS\` but did not include it in \`RAW_GENOME_REGISTRY\`, so Core25 was winning. That is fixed by placing Gold first in \`RAW_GENOME_REGISTRY\`.

Confirmed working after fix:

- \`recommend Bleach\`
- \`recommend One Piece\`
- \`recommend Naruto\`

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

Start by asking Joe what the current app screen shows and whether \`git status\` is clean.
`;

const continuity = `# JoeAnimeDB AI Continuity Guide

## Purpose

This file exists so a new ChatGPT conversation can continue JoeAnimeDB without feeling like a different engineer took over.

When starting a new chat, the user should say:

> Read \`AI_CONTINUITY_GUIDE.md\` first. Continue JoeAnimeDB from there.

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

\`\`\`bash
feature/anime-catalog
\`\`\`

Repository:

\`\`\`text
https://github.com/WickedWampa/JoeAnimeDB
\`\`\`

Current local path:

\`\`\`text
C:\\Users\\joe\\Downloads\\JoeAnimeDB-4.3.1-SQLite-Foundation\\JoeAnimeDB-4.3-Repository-Refactor
\`\`\`

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

\`\`\`text
Electron desktop app
→ SQLite
→ Anime library
→ Metadata services
→ Genome registry
→ JoeAI router
→ formatted JoeAI response
\`\`\`

## JoeAI recommendation flow

\`\`\`text
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
\`\`\`

Known title lookup must happen before mood/trait routing.

Example:

\`\`\`text
recommend Blue Eye Samurai
\`\`\`

should return the Blue Eye Samurai Genome, not generic samurai/cyberpunk recommendations.

---

# 4. Genome Architecture

## Current priority

\`\`\`text
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
\`\`\`

Gold Genomes are authoritative.

Generated Genomes are fallback only.

## Critical rule

The registry keeps the **first duplicate ID**.

Therefore Gold must be loaded before Core25, Enhanced, Core100, Generated, and Modules.

## Important fixed bug

The registry previously had:

\`\`\`js
import { GOLD_STANDARD_GENOME_CARDS } from './gold/goldStandardGenomeCards';
\`\`\`

but did not add Gold to \`RAW_GENOME_REGISTRY\`.

This caused Core25 versions of One Piece, Naruto, and Bleach to win.

Correct fix:

\`\`\`js
const RAW_GENOME_REGISTRY = [
  ...normalizePack(
    GOLD_STANDARD_GENOME_CARDS,
    'src/ai/genome/gold/goldStandardGenomeCards.js#GOLD_STANDARD_GENOME_CARDS'
  ),
  ...
];
\`\`\`

Confirmed working after fix:

- \`recommend Bleach\`
- \`recommend One Piece\`
- \`recommend Naruto\`

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

\`\`\`text
Core Fantasy: huge worldbuilding
\`\`\`

Good:

\`\`\`text
Set sail with friends who would die for you, grow stronger with every impossible island, and chase a dream so huge the entire world tries to stand in your way.
\`\`\`

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

\`\`\`text
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
\`\`\`

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

Gold file imported but not included in \`RAW_GENOME_REGISTRY\`.

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

Patch the registry builder, not only \`genomeRegistry.js\`.

## New User Mode bulk import kept one title

Cause:

\`useAnimeLibrary.updateAnime()\` used stale captured state.

Fix:

Use functional \`setData(previousData => ...)\`.

## Colon broke bulk parsing

Cause:

\`Cyberpunk: Edgerunners\` got split at colon.

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

\`\`\`js
function findRoot(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'src'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}
\`\`\`

## Generated files

Do not hand-edit generated registry files as the permanent solution.

Patch the builder when possible.

Short-term direct patches are okay for debugging, but the durable fix belongs in the generator.

---

# 9. Git Workflow

Before risky work:

\`\`\`cmd
git status
\`\`\`

After stable work:

\`\`\`cmd
git add .
git commit -m "short useful message"
git push
git status
\`\`\`

Good commit names:

\`\`\`text
feat: add gold genome registry layer
fix: load gold genomes before core packs
fix: prioritize title lookup before trait routing
docs: update AI handoff documentation
\`\`\`

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
`;

const sessionStart = `# AI Session Start

Read these files before writing code:

1. AI_CONTINUITY_GUIDE.md
2. CURRENT_STATUS.md
3. DECISIONS.md
4. KNOWN_BUGS.md
5. ROADMAP.md
6. CHANGELOG.md

Rules:

- Continue the existing architecture.
- Behave like the same engineer continuing the project.
- Prefer small patches over rewrites.
- Never replace working systems without a reason.
- Prefer root-aware scripts.
- Test before declaring success.
- Update these docs before every git push.

Current critical architecture:

\`\`\`text
JoeAI prompt
→ title-first router
→ Genome registry
→ Gold
→ Core25
→ Enhanced
→ Core100
→ Generated
\`\`\`

Gold Genomes are authoritative.

The registry keeps the first duplicate ID, so Gold must load first.

Never let mood/trait routing beat a known title lookup.
`;

const decisionsAppend = `## 2026-07-05 / 2026-07-06

- JoeAnimeDB is now treated as an anime intelligence engine, not just a tracker.
- Gold Genomes are authoritative.
- Genome registry priority is:
  1. Gold
  2. Core25
  3. Enhanced
  4. Core100
  5. Generated
  6. Modules
- Duplicate genome IDs keep the first card, so Gold must load first.
- Do not permanently fix generated registry issues by hand-editing only \`genomeRegistry.js\`; patch the builder.
- Known-title lookup must happen before mood/trait routing.
- Manual metadata overrides are valid for anime-adjacent titles and title-collision cases.
- Smart updater should check local metadata/artwork/genome health before calling remote APIs.
`;

const roadmap = `# Roadmap

## Current Focus

- Expand Gold Genome Library from 20 toward 100 flagship titles.
- Improve nearby/similar DNA recommendations.
- Improve Trait Mixer ranking and confidence.
- Make registry priority explicit and harder to break.
- Continue metadata confidence improvements.

## Near Term

- Gold Genomes for more major anime.
- Better recommendation confidence scoring.
- Better "why this matches you" explanations.
- UI polish for JoeAI recommendation cards.
- Metadata resolver improvements for complex franchises.

## Mid Term

- Genome V2 reviewer.
- Compare generated genomes against Gold standards.
- Emotional similarity matching.
- Theme similarity matching.
- Pacing similarity matching.
- Character archetype matching.
- Worldbuilding similarity matching.

## Long Term

- Public release.
- Optional cloud sync.
- Community features if useful.
- Larger curated genome library.
`;

const knownBugs = `# Known Bugs

## Open

- Expand Gold Genome library.
- Improve Trait Mixer ranking.
- Improve recommendation confidence.
- Improve nearby/similar DNA recommendations.
- Make registry priority explicit in builder so Gold precedence is harder to break.
- Continue metadata matching for complex franchises:
  - Fate
  - Monogatari
  - JoJo
  - Dragon Ball
  - 86
  - Initial D
  - Magi
  - Bleach TYBW

## Watchlist

- Do not let Core25 override Gold.
- Do not let mood/trait routing beat known-title lookup.
- Do not let generated registry rebuilds remove needed exports.
- Do not put JS files in styles folders.
- Do not create src/src path bugs in patch scripts.

## Fixed

- src/src patch path issue.
- New User Mode bulk update bug.
- Rank badges beyond Top 10.
- Code Geass metadata matching.
- Castlevania manual metadata override.
- Arcane manual metadata override.
- Blue Eye Samurai title-first routing.
- Gold registry import existed but was not added to RAW_GENOME_REGISTRY.
`;

const changelogAppend = `## 2026-07-05 / 2026-07-06

- Added Gold Genome architecture.
- Added Top 20 Gold Genome drafts.
- Wired Gold Genomes into active registry.
- Fixed Gold import bug where \`GOLD_STANDARD_GENOME_CARDS\` was imported but not added to \`RAW_GENOME_REGISTRY\`.
- Confirmed Gold responses for Bleach, One Piece, and Naruto.
- Added anime-adjacent support for Castlevania, Arcane, and Blue Eye Samurai.
- Fixed JoeAI title-first routing so known titles beat trait/mood routing.
- Added/fixed manual metadata override flow.
- Improved smart updater behavior to skip healthy local titles before calling remote APIs.
`;

const projectVision = `# Project Vision

JoeAnimeDB is a premium desktop anime intelligence companion.

It is not just an anime tracker.

Goals:

- Remember every anime.
- Understand user taste.
- Recommend intelligently.
- Explain why recommendations fit.
- Handle anime, anime-adjacent animation, donghua/aeni, and manual overrides.
- Feel fast, polished, and fun.
- Keep engineering quality high through documentation and frequent Git commits.

Current product identity:

> A wicked-smart anime desktop companion that remembers every anime, understands the user's taste, imports naturally, recommends intelligently, and feels like a premium anime/MMORPG dashboard.

Core product pillars:

1. Personal library
2. JoeAI assistant
3. Smart metadata
4. Anime Genome
5. Gold curated knowledge
6. Recommendation intelligence
7. Premium UI
`;

writeFile('CURRENT_STATUS.md', currentStatus);
writeFile('AI_HANDOFF_NEXT_CHAT.md', handoff);
writeFile('AI_CONTINUITY_GUIDE.md', continuity);
writeFile('AI_SESSION_START.md', sessionStart);
writeFile('ROADMAP.md', roadmap);
writeFile('KNOWN_BUGS.md', knownBugs);
writeFile('PROJECT_VISION.md', projectVision);

appendSection('DECISIONS.md', '## 2026-07-05 / 2026-07-06', decisionsAppend.replace('## 2026-07-05 / 2026-07-06', '').trim());
appendSection('CHANGELOG.md', '## 2026-07-05 / 2026-07-06', changelogAppend.replace('## 2026-07-05 / 2026-07-06', '').trim());

const check = `const fs = require('fs');
const files = [
  'AI_SESSION_START.md',
  'AI_CONTINUITY_GUIDE.md',
  'CURRENT_STATUS.md',
  'AI_HANDOFF_NEXT_CHAT.md',
  'DECISIONS.md',
  'KNOWN_BUGS.md',
  'ROADMAP.md',
  'CHANGELOG.md',
  'PROJECT_VISION.md'
];

for (const file of files) {
  console.log(file + ':', fs.existsSync(file) ? 'OK' : 'MISSING');
}

console.log('');
console.log('Hand this to the next chat: AI_HANDOFF_NEXT_CHAT.md');
`;
writeFile('scripts/checkAiHandoffDocs.cjs', check);

console.log('');
console.log('AI handoff docs updated.');
console.log('Run: node scripts\\\\checkAiHandoffDocs.cjs');
