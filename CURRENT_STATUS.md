# Current Status

## Snapshot

JoeAnimeDB is currently on the `feature/anime-catalog` branch.

Repository:

```text
https://github.com/WickedWampa/JoeAnimeDB
```

Local project path usually used by Joe:

```text
C:\Users\joe\Downloads\JoeAnimeDB-4.3.1-SQLite-Foundation\JoeAnimeDB-4.3-Repository-Refactor
```

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

- `recommend Bleach` uses the Gold Genome
- `recommend One Piece` uses the Gold Genome
- `recommend Naruto` uses the Gold Genome

The key bug was:

```js
import { GOLD_STANDARD_GENOME_CARDS } from './gold/goldStandardGenomeCards';
```

existed, but `GOLD_STANDARD_GENOME_CARDS` was not added to `RAW_GENOME_REGISTRY`.

Fix:

```js
const RAW_GENOME_REGISTRY = [
  ...normalizePack(
    GOLD_STANDARD_GENOME_CARDS,
    'src/ai/genome/gold/goldStandardGenomeCards.js#GOLD_STANDARD_GENOME_CARDS'
  ),
  ...
];
```

Gold must be first because duplicate IDs keep the first card.

## Genome Priority

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

