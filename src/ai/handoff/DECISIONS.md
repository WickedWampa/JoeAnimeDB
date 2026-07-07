

## 2026-07-05 / 2026-07-06

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
- Do not permanently fix generated registry issues by hand-editing only `genomeRegistry.js`; patch the builder.
- Known-title lookup must happen before mood/trait routing.
- Manual metadata overrides are valid for anime-adjacent titles and title-collision cases.
- Smart updater should check local metadata/artwork/genome health before calling remote APIs.
