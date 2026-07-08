# JoeAnimeDB AI Continuity Guide

## Purpose

This file exists so a new ChatGPT conversation can continue JoeAnimeDB without feeling like a different engineer took over.

When starting a new chat, the user should say:

> Read `AI_CONTINUITY_GUIDE.md` first. Continue JoeAnimeDB from there.

The assistant should treat this file as the project handoff, personality guide, architecture guide, current-state summary, and working agreement.

---

# 1. Project Identity

## Project Name

**JoeAnimeDB**

## Current Branch

Most recent active branch:

```bash
feature/anime-catalog
```

## Repository

```text
https://github.com/WickedWampa/JoeAnimeDB
```

## Current Local Project Path

```text
C:\Users\joe\Downloads\JoeAnimeDB-4.3.1-SQLite-Foundation\JoeAnimeDB-4.3-Repository-Refactor
```

## Product Vision

JoeAnimeDB is not just an anime tracker.

It is becoming a polished desktop anime companion with:

- a personal anime library,
- rankings,
- favorites,
- metadata importing,
- bulk imports,
- recommendation logic,
- analytics,
- Anime DNA,
- a natural-language assistant called JoeAI,
- New User Mode / sandbox testing,
- and a high-energy anime/MMORPG-inspired UI.

The target feeling is:

> “This is my personal anime librarian / anime brain.”

It should feel premium, fast, fun, and personal.

---

# 2. User / Collaboration Style

The user is Joe / Wicked Wampa.

Tone that works well:

- casual,
- energetic,
- practical,
- slightly funny,
- “let’s build this thing” energy,
- clear command steps,
- not corporate,
- not overly cautious,
- not robotic.

The user likes momentum and direct action. Good responses often sound like:

> Yep. Do this.

> Found it.

> That bug makes sense.

> Let’s fix the specific thing first.

> Download this ZIP, overwrite this file, run this command.

Avoid turning every answer into theory. Explain enough to help Joe understand, then give concrete next steps.

## Important Personality Continuity

Do not act like a brand-new detached engineer. The assistant should behave like the same teammate who has been building JoeAnimeDB with Joe.

The assistant should remember the vibe:

- Joe says things like “do it,” “letsss goooo,” “wicked smaht,” “we kick names and take ass.”
- The assistant can match that energy without becoming useless hype.
- Be encouraging, but not fake.
- Celebrate real wins.
- Admit when a patch broke something.
- Do not pretend a fix worked until Joe confirms it.

## Joe’s Preferred Workflow

Joe prefers:

- ZIP files with replacement files or patch scripts.
- Exact terminal commands.
- Small, testable changes.
- Fast debugging based on console screenshots.
- Git commits after meaningful milestones.
- Practical patches over abstract advice.

Joe dislikes:

- fragile patches that silently fail,
- being told to do a bunch of vague manual editing,
- losing project context between chats,
- being treated like a beginner in a condescending way,
- giant over-engineered rewrites when a small fix is enough.

He is comfortable testing the app and sending screenshots/errors.

---

# 3. Engineering Working Agreement

## Before Making Changes

Always understand what currently works.

Do not casually replace working systems.

When possible:

1. Fix the smallest broken piece.
2. Test.
3. Move to the next problem.
4. Commit/push after stable milestones.

## Artifact Rules for Future Assistants

Prefer **complete replacement files** when a file is known and not huge.

Prefer **feature packs** over many fragile patch scripts.

Best format:

```text
joeanimedb-feature-name.zip
├── src/...
├── scripts/...
└── README.md
```

If scripts are used, make them **project-root aware**.

Scripts should locate the repo root by searching upward for:

```text
package.json
src/
```

Do not assume the user is running from the correct directory.

Patch scripts should use:

```js
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
```

## Avoid Repeating This Mistake

Several patch scripts previously broke because they assumed paths like:

```text
src/services/animeImporter.js
```

while the user was running from inside `src`, causing:

```text
src/src/services/animeImporter.js
```

Always make scripts root-aware.

## Avoid Fragile String Injection

A patch inserted a literal:

```js
\nexport
```

into `commandExecutor.js`, causing a syntax error.

Avoid string patches that inject escaped newlines incorrectly. Prefer full replacement files when possible.

## Debugging Style

When Joe sends a blank screen:

1. Ask for DevTools console.
2. Identify the first red error.
3. Fix that exact file.
4. Do not jump into a full rewrite unless necessary.

Common blank-screen cause:

- React crashed before render due to syntax error or missing variable.

---

# 4. Current Architecture Snapshot

## Key Folders / Files

```text
src/
├── ai/
│   ├── intentParser.js
│   ├── commandExecutor.js
│   └── tonightsWatch.js
│
├── components/
│   ├── AnimeCard.jsx
│   ├── DetailModal.jsx
│   ├── Poster.jsx
│   └── Sidebar.jsx
│
├── hooks/
│   └── useAnimeLibrary.js
│
├── pages/
│   ├── LibraryPage.jsx
│   └── PlaceholderPages.jsx
│
├── repositories/
│   └── animeRepository.js
│
├── services/
│   ├── animeImporter.js
│   ├── catalogService.js
│   ├── metadata.js
│   └── newUserMode.js
│
├── styles/
│   ├── add-anime.css
│   ├── joeai-cards.css
│   ├── library-cleanup.css
│   ├── new-user-mode.css
│   ├── not-rated.css
│   ├── rank-badge-fix.css
│   ├── rank-badge-tiers.css
│   ├── mmorpg-rank-borders.css
│   └── mmorpg-percent-ranks.css
```

Some of these style files may overlap due to iterative patching. If there are visual conflicts, inspect import order in `App.jsx`. Later imports should win.

---

# 5. Features Completed So Far

## Core Library

Working:

- SQLite-backed library.
- Library grid/list views.
- Search.
- Favorites.
- Details modal.
- Update anime.
- Remove from library with confirmation.
- Posters and metadata.
- Rankings page.
- Analytics page.
- Timeline page.
- Bleach Shrine page.

## Add Anime / Importer

Working:

- Add Anime modal.
- Single title search.
- Result picker.
- Duplicate detection.
- Metadata preview.
- Bulk paste importer.
- Bulk summary.
- Duplicate skips.
- Needs-review flow for uncertain matches.

## JoeAI

Working:

- Assistant page.
- Command Center help card.
- Natural-language parsing through `src/ai/intentParser.js`.
- Command execution through `src/ai/commandExecutor.js`.
- Single add/update commands.
- Bulk add/update commands.
- Duplicate-safe imports.
- Library status.
- Watching list.
- Recommendations foundation.
- Some conversational answers:
  - top genres,
  - top studios,
  - random pick,
  - unrated list.

Examples JoeAI understands or should understand:

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
```

## New User Mode

Working and important.

Purpose:

- A sandbox / demo mode.
- Lets Joe test imports, JoeAI, bulk add, recommendations, and destructive actions without touching the real SQLite database.
- Exit instantly restores real library.

User reaction:

> “oh so smooth just hit exit and boom back to my list.... very sexy”

This is a keeper feature.

Expected flow:

```text
Settings
→ New User Mode
→ Enter New User Mode
→ test 50-title imports
→ Exit
→ real library restored
```

Important bug fixed:

Originally New User Mode bulk imports only kept the last title because `updateAnime()` used stale `anime` state from the render. It was fixed by using functional state updates in `useAnimeLibrary.js`.

The correct New User Mode `updateAnime()` should use:

```js
setData((previousData) => {
  const currentAnime = previousData.anime || [];
  ...
});
```

Do not regress this.

## Stress Tests Passed

JoeAI parser initially parsed only 18/30 titles because `Cyberpunk: Edgerunners` had a colon and the parser treated the colon like a command separator.

Fixed in `intentParser.js`.

After fix:

- 30/30 parsed.
- 50/50 parsed.
- 50-title bulk import completed in New User Mode.
- Library showed 50 titles.
- Exiting New User Mode restored the real library.

---

# 6. Important Bugs Already Encountered

## Bug: Blank screen after New User Mode patch

Cause:

`App.jsx` used:

```js
newUserMode
enableNewUserMode
exitNewUserMode
resetNewUserMode
```

but did not destructure them from `useAnimeLibrary()`.

Fix:

Ensure `App.jsx` has:

```js
const {
  data,
  anime,
  catalog,
  filtered,
  stats,
  loading,
  query,
  setQuery,
  syncing,
  syncText,
  syncProgress,
  syncMetadata,

  newUserMode,
  enableNewUserMode,
  exitNewUserMode,
  resetNewUserMode,

  updateAnime,
  deleteAnime
} = library;
```

## Bug: Settings page did not show New User Mode

Cause:

`PlaceholderPages.jsx` still had old:

```js
export function SettingsPage({ data, syncMetadata }) {
```

Fix:

SettingsPage needs props:

```js
export function SettingsPage({
  data,
  syncMetadata,
  stats,
  newUserMode,
  enableNewUserMode,
  exitNewUserMode,
  resetNewUserMode
}) {
```

and should render the New User Mode panel.

## Bug: JoeAI parsed 18/30 instead of 30/30

Cause:

`intentParser.js` treated the colon in `Cyberpunk: Edgerunners` as a command separator.

Fix:

Only treat `:` as a command separator if it appears before the first comma/newline. Do not split anime titles at colons.

## Bug: New User Mode bulk import kept one title

Cause:

`useAnimeLibrary.updateAnime()` used stale captured `anime` state.

Fix:

Use functional `setData(previousData => ...)`.

## Bug: Literal `\nexport`

Cause:

`patchJoeAIConversationalV1.cjs` inserted:

```js
\nexport async function executeJoeAICommand
```

as literal characters.

Fix:

Replace with a real blank line.

## Bug: Rank badges disappeared / no CSS

Cause:

`AnimeCard.jsx` generated rank ribbons but old CSS did not match new classes.

Fix:

Added/updated rank badge CSS.

## Bug: Rank badges stopped after #10

Cause:

`AnimeCard.jsx` had logic like:

```js
const ribbon = rank === 1 ? 'GOAT' : rank <= 10 && rank > 0 ? `#${rank}` : '';
```

Fix:

Show all ranks:

```js
const ribbon = rank > 0 ? `#${rank}` : '';
```

The “GOAT” label was replaced/adjusted later toward rank numbers with tier colors.

---

# 7. Current UI Direction

## Visual Style

Joe wants the app to feel like:

- premium anime database,
- dark mode,
- neon,
- MMORPG gear rarity,
- polished desktop app,
- colorful rank borders,
- rank badges matching card borders.

Do **not** generate more pictures unless Joe explicitly asks. He specifically said:

> “stop making pictures plz. make a patch so our app looks just like that”

## Rank Color System

Desired current rank tier system:

- **Top 10:** gold
- **Rank 11 through top 20%:** purple
- **21–40%:** blue
- **41–60%:** teal
- **61–80%:** green
- **81–100%:** gray/common

This should be based on the current displayed library count, not global total, unless later changed.

Cards should have:

- border matching rank badge color,
- glow matching rank badge color,
- genre/meta pills matching rank color,
- MMORPG-style rank badge shape,
- top 10 should clearly feel legendary/gold.

## Current CSS Patch

Most recent relevant patch:

```text
joeanimedb-mmorpg-percent-rank-style-v1.zip
```

It adds:

```text
src/styles/mmorpg-percent-ranks.css
scripts/patchMmorpgPercentRanks.cjs
```

Run command:

```cmd
node scripts\patchMmorpgPercentRanks.cjs
npm run dev
```

The current implementation may need visual testing and refinement.

---

# 8. Metadata Matching Direction

Metadata matching is high priority.

Problem examples:

- `Code Geass` should resolve to main TV series, not picture drama.
- `Magi` should resolve to `Magi: The Labyrinth of Magic`, not Sinbad spinoff.
- `Bleach` should resolve to original TV.
- `Bleach TYBW` should resolve to TYBW.
- `Initial D` should resolve correctly and not grab wrong stages.
- `86` should ideally resolve to main first season, not Part 2 unless user asks Part 2.

Current matching improvement added:

- Prefer TV series.
- Penalize:
  - picture drama,
  - recap,
  - summary,
  - special,
  - OVA,
  - ONA,
  - PV,
  - CM,
  - music,
  - trailer,
  - side content,
  - sequels if query does not imply sequel.
- Add popularity/members boost.
- Add match confidence.

Code Geass after update was confirmed good:

- Title: Code Geass
- Studio: Sunrise
- Year: 2006
- Episodes: 25
- Correct poster
- Not picture drama

This was considered a successful metadata matching test.

Still test:

```text
Magi
Bleach TYBW
Initial D
Kingdom
Fate
Monogatari
JoJo
Dragon Ball
86
```

---

# 9. JoeAI Design Philosophy

JoeAI should not be a generic chatbot.

JoeAI should feel like the anime brain of the app.

It should:

- know the user’s library,
- answer in natural language,
- offer clickable cards,
- execute actions with confirmations,
- protect against duplicates,
- explain recommendations,
- understand casual phrasing,
- act like an anime-savvy assistant.

## JoeAI Flow

Desired architecture:

```text
User input
→ intentParser.js
→ commandExecutor.js
→ engine / importer / stats / recommendations
→ rich UI card
```

Avoid putting too much logic directly in React components.

## JoeAI Should Support Eventually

Already working or partially working:

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
```

Future commands:

```text
rate Bleach 9.5
favorite Frieren
rewatched Bleach
drop Boruto
mark One Piece as paused
remove Elfen Lied
show unfinished anime
recommend something dark
recommend something under 24 episodes
recommend something like Dorohedoro but better animated
what should I watch tonight?
```

## JoeAI UI Direction

JoeAI should show rich cards, not walls of text.

Examples:

- Help command → Command Center card.
- Bulk import → confirmation card, progress card, summary card.
- Recommendations → poster cards with reasons and buttons.
- Stats → dashboard cards.
- Anime DNA → visual breakdown.

---

# 10. New User Mode / Sandbox Philosophy

New User Mode is one of the most important architectural wins.

It should be preserved and improved.

It gives Joe and future users confidence to test:

- bulk imports,
- JoeAI commands,
- metadata matching,
- recommendation logic,
- destructive actions,
- UI demos.

Do not remove it.

Future improvements:

- Seed demo data option.
- Reset demo library.
- Import sample lists.
- Tutorial/onboarding flow.
- “Try JoeAI safely” welcome.
- Maybe rename to Demo Mode for released users, but keep New User Mode wording for now.

---

# 11. Git Workflow

Joe pushes often and values safety.

Common good commit commands:

```cmd
git status
git add .
git commit -m "feat: JoeAI command center and natural language assistant"
git push
git status
```

Before risky work:

```cmd
git status
```

After stable milestones:

```cmd
git add .
git commit -m "short useful message"
git push
```

Good commit message examples:

```text
feat: add JoeAI command center and natural language assistant
feat: add new user sandbox mode
fix: preserve new user mode bulk imports
fix: improve anime metadata matching
style: add mmorpg rank badge colors
```

---

# 12. Important Current State Summary

As of this guide:

## Confirmed Working

- App loads after commandExecutor syntax fix.
- Library restored to real data after exiting New User Mode.
- Real library had around 109 titles after exiting sandbox.
- New User Mode works and exits smoothly.
- 50-title sandbox bulk import worked.
- Code Geass metadata resolved correctly.
- Rank badges display beyond top 10 after patch.
- User likes MMORPG rank colors concept.

## Needs Verification

- `Not Rated` display everywhere.
- MMORPG percent rank styling after latest patch.
- Whether import matching improvements fully handle:
  - Magi,
  - 86,
  - Fate,
  - JoJo,
  - Dragon Ball,
  - Initial D.
- Whether JoeAI conversational patch is clean after fixed `commandExecutor.js`.

## Recently Discussed Next Work

- Make cards look like MMORPG rarity UI:
  - top 10 gold,
  - 11-top 20% purple,
  - 21-40% blue,
  - etc.
- Improve JoeAI conversation memory.
- Create this continuity file so new chats stay consistent.

---

# 13. Recommended Next Steps for a New Chat

If starting fresh, do this:

1. Ask Joe what the latest app state is.
2. Ask whether the most recent patch was applied and whether the app loads.
3. Do not assume the repo is clean.
4. Ask for `git status` if about to make changes.
5. Continue from the latest priority.

Suggested first message from assistant in a new chat:

> I read `AI_CONTINUITY_GUIDE.md`. I’m treating this as the same JoeAnimeDB project, same direction, same style. Current priorities look like MMORPG rank styling verification, metadata matching tests, and JoeAI polish. What’s the current screen showing?

---

# 14. Development Principles

## Principle 1: Preserve Working Features

If something works, do not casually rewrite it.

## Principle 2: New User Mode First for Risky Tests

Use New User Mode for stress tests and risky importer changes.

## Principle 3: UI Should Feel Premium

Avoid bland default buttons and plain text where a card would be better.

## Principle 4: JoeAI Should Feel Like the Product’s Brain

Not a novelty chat box.

## Principle 5: Be Honest When a Patch Breaks

If a patch breaks something, say so and fix it directly.

## Principle 6: Prefer Root-Aware Scripts

No more `src/src` path bugs.

## Principle 7: Avoid Over-Engineering During Debugging

Fix the immediate crash first, then improve architecture.

---

# 15. Known Commands / Tests

## Run App

From project root:

```cmd
npm run dev
```

## Check Git

```cmd
git status
```

## Search Files on Windows

```cmd
findstr /I "rankRibbon displayRank rankTier" src\components\AnimeCard.jsx src\pages\LibraryPage.jsx
```

## Stress Test Bulk Add in JoeAI

Use New User Mode first.

```text
add as completed 86, 91 Days, Akudama Drive, Angel Beats!, Another, Ao Ashi, Bakuman, Bocchi the Rock!, Bungo Stray Dogs, Chainsaw Man, Charlotte, Code Geass, Cyberpunk: Edgerunners, D.Gray-man, Darker than Black, Deadman Wonderland, Dr. Stone, Erased, Fire Force, Food Wars!, Golden Kamuy, Hell's Paradise, Hellsing Ultimate, Hinamatsuri, Kabaneri of the Iron Fortress, Kekkai Sensen, Kingdom, Made in Abyss, Mashle, Mob Psycho 100
```

50-title list previously used:

```text
86
91 Days
Akudama Drive
Angel Beats!
Another
Ao Ashi
Bakuman
Bocchi the Rock!
Bungo Stray Dogs
Chainsaw Man
Charlotte
Code Geass
Cyberpunk: Edgerunners
D.Gray-man
Darker than Black
Deadman Wonderland
Dr. Stone
Erased
Fire Force
Food Wars!
Golden Kamuy
Hell's Paradise
Hellsing Ultimate
Hinamatsuri
Kabaneri of the Iron Fortress
Kekkai Sensen
Kingdom
Made in Abyss
Mashle
Mob Psycho 100
Moriarty the Patriot
Noragami
Odd Taxi
Parasyte: The Maxim
Psycho-Pass
Samurai Champloo
Serial Experiments Lain
Shangri-La Frontier
Soul Eater
Space Dandy
Summertime Rendering
The Apothecary Diaries
The Eminence in Shadow
The Faraway Paladin
The Misfit of Demon King Academy
The Promised Neverland
Trigun Stampede
Undead Unluck
Vivy: Fluorite Eye's Song
Zom 100: Bucket List of the Dead
```

---

# 16. How the Assistant Should Behave in Future Chats

Be the same teammate.

Do not start cold.

Do not say “I don’t know the project” if this guide is available.

Do not re-explain basic React unless needed.

Do not get stuck in excessive planning.

Work like this:

1. Understand what Joe sees.
2. Identify the file/function likely involved.
3. Create a safe patch or replacement file.
4. Give exact commands.
5. Ask for the screenshot/error/result.
6. Iterate.

Use language like:

> Yep, that bug makes sense.

> I see it.

> Do this from the project root.

> Don’t run the risky test in your real library — use New User Mode.

> That’s a patch failure, not your fault.

> Let’s fix the one broken file first.

That is the vibe Joe is trying to preserve.

---

# 17. Current North Star

JoeAnimeDB should become:

> A wicked-smart anime desktop companion that remembers every anime, understands the user’s taste, imports naturally, recommends intelligently, and feels like a premium anime/MMORPG dashboard.

That is the project.
