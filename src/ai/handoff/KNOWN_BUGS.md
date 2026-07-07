# Known Bugs

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

