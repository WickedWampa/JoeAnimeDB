# JoeAnimeDB 5.0 Beta 9

Beta 9 makes JoeAI answers more dependable, gives Discover shelves genuinely different identities, and completes a substantial metadata-repair cleanup.

## Highlights

- Fixed personal taste questions such as “Why do I like long adventures?” so JoeAI answers the taste pattern directly instead of analyzing an unrelated title.
- Improved JoeAI routing for genre, theme, mood, and viewing-pattern questions.
- Prevented Discover from repeating the same recommendations across multiple shelves.
- Changed Highest Rated to rank unseen titles by their actual community score instead of recommendation order.
- Preserved JoeAI Picks as a separate personalized shelf.
- Centered the JoeAI dashboard’s episodes, rewatches, and comfort-anchor statistics.

## Metadata Repair

- Added Kitsu-first repair for missing studio, genre, year, and episode data.
- Added direct Kitsu ID lookups and stronger alternate-title matching.
- Improved movie and franchise matching, including shortened titles such as Reincarnated as a Slime Movie.
- Added another Wikidata release-date fallback for titles whose year is stored as a start date.
- Stopped treating an unknown final episode total as damaged metadata for currently airing or date-TBA series.
- Expanded Metadata Health to report missing studio, genre, year, and episode-count fields clearly.
- Improved repair reports so repaired and unresolved titles show the provider result and fields affected.

## Install on Windows

Download and run:

`JoeAnimeDB-Setup-5.0.0-beta.9.exe`

Windows SmartScreen may display a warning because this public beta is not yet code signed.

## Install on Linux

Run:

```bash
curl -fsSL https://raw.githubusercontent.com/WickedWampa/JoeAnimeDB/main/install-linux.sh | bash
```

Then open JoeAnimeDB from the application menu or run:

```bash
joeanime-db
```

The Linux beta currently supports x86_64 systems. Some distributions require a FUSE 2 package to run AppImages.

## Updating

Supported packaged Windows and Linux builds check GitHub for newer JoeAnimeDB releases. Updates replace application files only; your library, ratings, notes, Anime DNA, Genome data, and JoeAI data remain in the operating system’s per-user data folder.

## Beta Notes

- JoeAnimeDB remains a public beta.
- Export a full backup before upgrading.
- Report crashes, interface bugs, recommendation issues, metadata mismatches, installation problems, and Linux compatibility results through GitHub Issues.
