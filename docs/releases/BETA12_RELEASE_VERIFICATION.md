# JoeAnimeDB Beta 12 Release Verification

This is the release gate for JoeAnimeDB 5.0.0 Beta 12. Do not tag or publish Beta 12 until every blocker is green.

## Current preflight status

Status as of 2026-08-09: `NO-GO` pending the device matrix and automatic deployment proof.

| Check | Status | Evidence |
|---|---|---|
| Automated reliability and release gate | PASS | 11 release checks plus 11 JoeAI routes, 100 Gold genomes, recommendation, shelf, artwork, and new-user reliability checks |
| Production web build | PASS | Vite production build completed with 254 modules |
| Version identity | PASS | npm, web, desktop preload, and Android identify as `5.0.0-beta.12`; Android version code is `5000012` |
| Visible button source audit | PASS | 243 HTML buttons in 20 JSX files have an explicit handler or submit effect |
| Live web persistence | PASS | A library addition survived a full reload on joeanimedb.com |
| Live web content mode persistence | PASS | Kid-safe survived reload; the test restored Unrestricted afterward |
| Live Where to Watch | PASS | Bleach resolved to secure Crunchyroll provider links and match review handled the 2006 TV selection |
| Live JoeAI smoke test | PASS | `recommend something like Bleach` returned eight real recommendation cards |
| Web import and restore UI | MANUAL | Browser file chooser could not be completed in the automation session; use the steps below |
| Linux AppImage package | CI/MANUAL | Web build passed; local native rebuild was blocked by the restricted node-gyp cache path. The Linux GitHub job runs the same release gate before packaging |
| Android APK package | CI/MANUAL | Capacitor sync passed; local Gradle download was blocked by restricted network access. The Android GitHub job runs the same release gate before packaging |
| Windows package and all physical devices | MANUAL | Must be performed on the listed targets |
| Cloudflare deployment from `main` | MANUAL | Must be proven by a real push to `main`, not a Wrangler deployment |

The first Windows installer test exposed a stale New User Mode flag that could hide an existing SQLite database. Beta 12 now ignores and clears that flag on desktop before loading the existing database. Retest an installer update over the populated `JoeAnime.db` before marking Windows PASS.

The retest also exposed an Electron sandbox violation in the preload version lookup. Requiring `package.json` from the sandboxed preload prevented the entire SQLite bridge from loading and made desktop fall back to an empty browser store. The preload no longer imports local files; desktop version reporting uses the existing `app.getVersion()` IPC response. Rebuild and repeat the populated-database test.

## Automated gate

Run from the project root:

```bash
npm ci
npm run test:release
npm run build
```

Run the live Where to Watch check while online:

```bash
npm run test:release:live
```

Expected result: every check prints `[ok]`, the final line reports that the release gate passed, and the production build completes.

## Device matrix

Mark each cell `PASS`, `FAIL`, or `N/A`. Record a short note for every failure.

| Test | Windows | Linux | Android phone | Android tablet | joeanimedb.com |
|---|---|---|---|---|---|
| Clean install or first launch |  |  |  |  |  |
| Existing data survives update/reload |  |  |  |  |  |
| MAL XML import |  |  |  |  |  |
| AniList JSON or CSV import |  |  |  |  |  |
| JoeAnimeDB backup export |  |  |  |  |  |
| Backup restore |  |  |  |  |  |
| Rolling backup replaces the selected file |  |  | N/A | N/A |  |
| MAL XML export |  |  |  |  |  |
| AniList-compatible XML export |  |  |  |  |  |
| Local persistence after full restart |  |  |  |  |  |
| Where to Watch |  |  |  |  |  |
| Quick Watch |  |  |  |  |  |
| Content filtering |  |  |  |  |  |
| JoeAI routing |  |  |  |  |  |
| UI refinement: Home, Library, and Anime Detail |  |  |  |  |  |
| Visible button audit |  |  |  |  |  |

## Test data

Use a small, recognizable library containing:

- Bleach, completed, score 9.9, at least one rewatch
- Frieren: Beyond Journey's End, watching, partial episode progress
- One Piece, plan to watch
- One title with notes and tags
- One explicit or NSFW test title that can verify content filtering

Export a full backup before destructive restore or replacement tests.

## Exact checks

### Import and export

1. Import a MAL XML file.
2. Confirm title count, statuses, scores, episode progress, rewatches, dates, notes, tags, and MAL IDs.
3. Import an AniList JSON or CSV file and confirm the same fields plus AniList IDs.
4. Export MAL XML and import it into a clean JoeAnimeDB profile.
5. Export the AniList-compatible XML and inspect the export report for skipped titles.
6. Confirm skipped titles are only titles without a valid MAL ID.

Pass condition: supported personal data survives the round trip. Score rounding in MAL XML is clearly reported.

### Backup and restore

1. Change the theme, display name, content filter, and at least one JoeAI preference.
2. Add or modify a library title.
3. Export a full backup.
4. Make a second, obvious change.
5. Restore the backup.
6. Restart the app or reload the site.

Pass condition: the database and saved preferences return to the exported state and remain correct after restart.

### Rolling backup replacement

1. Choose a rolling backup location and save once.
2. Note the file path, modified time, and library count in the JSON.
3. Add a title and run the rolling backup again.
4. Confirm no second numbered file was created.

Pass condition: the original file is replaced at the same path and contains the newer library state.

On Android, the operating-system share sheet creates exports rather than a persistent rolling file, so mark this test `N/A`.

### Local persistence

1. Add a title, change its status, rate it, and add a rewatch.
2. Fully close the desktop app or Android app, then reopen it.
3. For the web version, close the tab and browser, reopen joeanimedb.com, and reload once.

Pass condition: all four changes remain without re-importing.

### Where to Watch and Quick Watch

1. Test Bleach (2004, TV) in the United States region.
2. Confirm at least one provider appears and every provider button opens the expected secure URL.
3. Test a deliberately ambiguous title and confirm match review works.
4. Confirm the selected match is remembered, then use the forget or retry action.
5. Change region and confirm the provider list refreshes.

Pass condition: the proxy returns a valid state (`ready`, `needs_review`, or `not_found`), errors are explained, and no button silently does nothing.

### Content filtering

Test Kid-safe, Teen, Mature, and Unrestricted on Home, Discover, JoeAI recommendations, and search results.

Pass condition:

- Kid-safe shows only known G and PG titles.
- Teen hides explicit and R-rated titles but permits unknown ratings.
- Mature hides explicit titles and permits R-rated titles.
- Unrestricted applies no rating filter.
- NSFW titles never leak into Kid-safe, Teen, or Mature.

### JoeAI routing

Run these prompts on each target:

| Prompt | Expected route or behavior |
|---|---|
| `recommend something like Bleach` | Similar-title recommendation |
| `recommend a sad movie` | Constraint-aware recommendation |
| `why do I like long adventures?` | Anime DNA or taste explanation |
| `what did I rate 9 or higher?` | Library query, not invented titles |
| `add One Piece to watching` | Mutation confirmation before or after clear action |
| `show me something kid-safe` | Recommendation obeys content mode |

Pass condition: the response matches the request, uses real library/catalog data, and recommendation cards load artwork and actions.

### Every visible button

Open every page and modal. Tap or click every visible enabled button once, including empty-state actions, filters, arrows, card actions, dialogs, menu items, links styled as buttons, and JoeAI recommendation actions.

Pass condition: each button causes a visible state change, opens a destination, saves data, or explains why the action cannot complete. No enabled button is silent.

### UI refinement pass

Review Home, Library, and the Anime Detail modal first, then make a short consistency pass across the remaining pages.

Verify that:

- Decorative glow and borders support hierarchy instead of appearing on every surface.
- Major sections use consistent spacing, heading sizes, body text, and metadata text.
- Cards rely on content and artwork rather than stacked outlines and badges.
- Primary, secondary, passive, and destructive actions are visually distinct and consistent.
- Empty states explain what belongs in the section and provide one clear next action.
- Anime Detail presents artwork, identity, status, score, Quick Watch, metadata, notes, and actions in a deliberate order.
- Phone and tablet layouts do not overlap, clip, or inherit unnecessary desktop width constraints.

Pass condition: all six themes retain their JoeAnimeDB identity while the tested screens feel calmer, clearer, and consistent at desktop, phone, and tablet widths.

## Cloudflare automatic deployment

1. Record the current production deployment time and commit SHA in Cloudflare Pages.
2. Push the verified Beta 12 commit to `main`.
3. Confirm Cloudflare starts a new production deployment without running Wrangler manually.
4. Confirm the deployment completes from the same commit SHA.
5. Open `https://joeanimedb.com`, hard refresh, and confirm the Beta 12 change is present.
6. Run `npm run test:release:live` again.

Pass condition: the `main` push alone creates a successful production deployment of the same commit, the custom domain serves it, and the live Watchmode test passes.

## Platform build checks

### Windows

```bash
npm run pack:win
```

Install the generated NSIS installer over the previous beta and repeat the Windows column.

### Linux

```bash
npm run pack:linux
```

Run the generated AppImage on a clean or representative Linux system and repeat the Linux column.

### Android

```bash
npm run android:debug
```

Install the debug APK on a phone and at least one tablet emulator or physical tablet. Repeat both Android columns at portrait and landscape widths.

## Release decision

Release only when:

- Automated gate passes.
- Production build passes.
- All five platform columns are complete.
- No release-blocking failures remain.
- Cloudflare automatic deployment is proven from a `main` push.
- The package version, tag, release title, and in-app version all say `5.0.0-beta.12`.

Record the final decision:

- Decision: `GO` / `NO-GO`
- Verified commit:
- Verified by:
- Date:
- Remaining non-blocking issues:
