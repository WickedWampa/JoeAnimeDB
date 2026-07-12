# JoeAnimeDB Shippable Build

This patch separates development data from release data and creates a clean
first-run installer.

## Replace these files

- package.json
- electron/main.cjs
- electron/preload.cjs
- src/repositories/animeRepository.js
- src/services/storage.js
- src/data/animeSeed.json
- src/pages/Dashboard.jsx

## What changes

### Development

`npm run dev` keeps using the existing Electron development `userData` path.
Your current Joe library is not moved or deleted.

### Packaged installer / portable build

Writable files are kept beside the installed EXE:

JoeAnimeDB/
- JoeAnimeDB.exe
- data/
  - JoeAnime.db
  - runtime/
- backups/
- logs/

A brand-new install starts with an empty library.

## Build the installer

```cmd
rmdir /s /q dist
rmdir /s /q dist-desktop
npm install
npm run pack:win
```

The installer will be created under:

```text
dist-desktop\JoeAnimeDB-Setup-4.3.1.exe
```

## Optional portable EXE

```cmd
npm run pack:portable
```

Important: install or extract JoeAnimeDB to a user-writable folder. The NSIS
installer is configured as a per-user install and allows the user to choose the
installation directory.

## Test before publishing

1. Install to a new folder.
2. Launch JoeAnimeDB.
3. Confirm the library is empty.
4. Confirm the greeting says “Welcome to JoeAnimeDB.”
5. Add one title.
6. Close and reopen the app.
7. Confirm the title remains.
8. Confirm `data\JoeAnime.db` exists beside the app.
