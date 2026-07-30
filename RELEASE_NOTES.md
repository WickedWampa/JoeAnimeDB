# JoeAnimeDB 5.0 Beta 7

JoeAnimeDB is now available for both Windows and x86_64 Linux.

## Highlights

- Added the first Linux AppImage release.
- Confirmed JoeAnimeDB, JoeAI, and the native SQLite database run on Arch Linux.
- Added a one-command Linux installer that downloads the newest AppImage, creates an application-menu entry, installs the JoeAnimeDB icon, and adds the `joeanime-db` terminal command.
- Enabled application updates for supported installed Windows and Linux builds.
- Repaired the Upcoming feed so future-dated Kitsu titles are not buried behind date-TBA entries.
- Preserved separate Airing Now, Upcoming, Delayed, and Date TBA sections.
- Kept the existing Windows installer, shortcuts, update metadata, and personal-data behavior unchanged.

## Install on Windows

Download and run:

`JoeAnimeDB-Setup-5.0.0-beta.7.exe`

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

Supported packaged builds check GitHub for newer JoeAnimeDB releases. Updates replace application files only; the library, ratings, notes, Anime DNA, Genome data, and JoeAI data remain in the operating system's per-user data folder.

## Beta Notes

- JoeAnimeDB remains a public beta.
- Export a full backup before upgrading.
- Report crashes, interface bugs, recommendation issues, metadata mismatches, installation problems, and Linux compatibility results through GitHub Issues.
