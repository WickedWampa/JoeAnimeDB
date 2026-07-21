# JoeAnimeDB Studio DNA normalization patch

Drop the included `src` folder into the project root and replace the matching files.

Changes:
- Canonicalizes duplicate studio names (Eight Bit/8bit, Pierrot/Studio Pierrot, OLM variants, etc.).
- Excludes known producers, publishers, licensors, and broadcasters from Studio DNA.
- Stops splitting company names at commas, preserving names such as `OLM, Inc.` before normalization.
- Applies normalization when the database loads so existing libraries are cleaned automatically.
- Uses the shared studio adapter in Analytics, DNA, search, and recommendations.
- Renames the metric to `Animation studios detected`.
