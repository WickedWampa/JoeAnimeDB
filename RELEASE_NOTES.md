# JoeAnimeDB 5.0.0-beta.22

## The Home Decision Engine

Beta 22 turns Home into a place that helps answer the question that matters: what should I watch next?

The new Home experience is shared across Windows, Linux, web, Android phones and tablets, and Android TV. Platform differences affect layout and navigation, not the underlying recommendations.

## Continue Watching

Every title marked Watching now appears in a dedicated Continue Watching shelf directly below the hero.

- Available on every supported platform
- Poster-first cards with reliable artwork fallbacks
- Click, touch, and D-pad access to Anime Details
- Horizontal browsing controls on desktop and touch scrolling on mobile
- Dynamic hero suggestions do not replace or hide the shelf

## Returning For You and You Missed a Sequel

JoeAnimeDB now follows verified Kitsu sequel relationships to separate two useful ideas:

- Returning For You: current, upcoming, and recently released direct continuations
- You Missed a Sequel: older legitimate direct sequels that are not in your library

Both shelves support Details, Add, Watched, and Follow actions where appropriate. Empty shelves stay hidden, and single-result shelves use the available space without leaving a giant empty box.

## JoeAI Quick Pick

Quick Pick adds seven ways to choose tonight's anime:

- Quick
- Movie
- Binge
- Dark
- Comfort
- Different
- Surprise Me

Each intent uses its own constrained candidate pool. Repeated presses perform a controlled weighted reroll, so JoeAI can offer variety without abandoning recommendation quality. Dark and Comfort use factual genre, theme, and synopsis signals instead of inferred taste labels.

Quick Pick pools are built off the UI thread, persisted locally, and restored on the next launch. Cached intent changes and rerolls are effectively immediate after Home becomes interactive. On a first cache miss, the selected intent shows a clear Preparing picks state while the current result stays visible and navigation remains responsive.

## On Your Services

Home and Discover can now surface anime available on the streaming services selected in Settings.

Beta 22 uses a cost-conscious Kitsu-first strategy:

- Saved Kitsu streaming links provide broad, fast coverage
- Kitsu requests are batched and cached locally
- Watchmode is reserved for explicit regional verification and Quick Watch actions
- Region-confirmed Watchmode results override general Kitsu links when available
- Discover reads saved provider data and remains responsive
- Provider filtering happens locally when the user changes streaming services
- Stale provider data can remain useful when a service is offline or rate limited

Kitsu links are general availability links and may vary by region. Use the Watchmode verification action in Anime Details when a regional check is needed.

## Safer Kitsu identity linkage

Missing identity is safer than incorrect identity.

MAL imports and database maintenance now save a Kitsu ID only when the existing resolver considers the match safe for automatic use. Ambiguous matches remain intact, keep all personal MAL data, and are marked for review instead of being attached to the wrong season or franchise entry.

Update Database now includes a paced full-library linkage repair pass for unlinked records. Safe repairs update identity linkage only and preserve:

- Score and ranking
- Watch status and episode progress
- Rewatches and favorites
- Notes and tags
- Personal dates and other user-owned fields

Home also keeps its smaller opportunistic repair path when relationship discovery encounters a safely resolvable title.

## Android TV responsiveness and navigation

TV startup now establishes TV mode before React renders and prioritizes the shell, local library, hero, Continue Watching, and cached Quick Pick state before secondary enrichment.

Additional TV work includes:

- Immediate D-pad response during cold launch
- Persisted Quick Pick pools
- Deferred relationship and provider refreshes
- Deterministic Home shelf navigation
- Up navigation that restores the top of page heroes
- Improved Anime Details navigation, score adjustment, status access, and return paths
- Strong focus states kept distinct from selected Quick Pick intent states
- Roughly six posters across on standard TV layouts

## Mobile, desktop, and visual polish

- Responsive Home shelves on phones, tablets, desktop, web, and TV
- Mobile continuation shelves support horizontal scrolling
- Quick Pick keeps the recommendation visually dominant while remaining compact on phones
- Desktop Home rails resize correctly inside application windows
- Home hero artwork is preserved without the heavy gradient treatment
- Empty Home shelves and prototype-style empty boxes were removed
- Excessive borders were reduced in favor of spacing, artwork, and theme surfaces
- The large incomplete-metadata warning was replaced by a subtle Repair Metadata attention state
- Needs Review badges were removed from Library poster art
- Updated onboarding highlights the current Home, Quick Pick, streaming, sync, and TV features

## Reliability and compatibility

Beta 22 preserves the existing MAL XML import/export, AniList file import/export, backups, Cloud Sync, Quick Add, Needs Review, Quick Watch, Anime DNA, and JoeAI routing behavior.

The release gate covers shared Home selection, platform-independent sequel classification, Quick Pick constraints and rerolls, Kitsu caching, identity safety, import/export, reliability, and sync behavior.

---

**JoeAnimeDB 5.0.0-beta.22**

*Remember every anime. Find the next obsession.*
