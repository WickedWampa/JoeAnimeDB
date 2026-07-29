# JoeAnimeDB Windows Update Release Guide

JoeAnimeDB’s installed Windows build checks the public GitHub releases for newer versions. It never replaces the SQLite database or the files in the user’s JoeAnimeDB data folder.

## What the updater requires

Every update release must contain files produced together by the same build:

- `JoeAnimeDB-Setup-<version>.exe`
- `JoeAnimeDB-Setup-<version>.exe.blockmap`
- `latest.yml`

Do not mix an installer, blockmap, or `latest.yml` from different builds. The updater validates the downloaded package against the release metadata.

GitHub draft releases are invisible to installed applications. The release must be published as a prerelease or normal release.

## Recommended release method

The repository includes `.github/workflows/release-windows.yml`.

1. Update the version in `package.json` and `package-lock.json`.
2. Commit and push the version change to `main`.
3. Create a tag that exactly matches the package version:

   ```bash
   git tag v5.0.0-beta.2
   git push origin v5.0.0-beta.2
   ```

4. GitHub Actions builds the NSIS installer on Windows and publishes the installer, blockmap, and `latest.yml` to a GitHub prerelease.
5. Confirm the GitHub release is published—not a draft.

The workflow deliberately fails if the Git tag and `package.json` version do not match.

## Local Windows build

Double-click `BUILD-WINDOWS-INSTALLER.bat`, or run:

```bat
npm install
npm run pack:win
```

The output appears in `dist-desktop`.

If you publish the files manually, upload the installer, its `.blockmap`, and `latest.yml` to the same GitHub release.

To let electron-builder publish directly from the Windows console, set a GitHub token for that console session and run:

```bat
set GH_TOKEN=YOUR_TEMPORARY_GITHUB_TOKEN
npm run release:win
set GH_TOKEN=
```

Never save a GitHub token in `package.json`, source files, a batch file, or Git.

## End-to-end update test

Automatic updates can only be fully tested with two different packaged versions.

1. Build and install the updater-enabled `5.0.0-beta.2`.
2. Change the package version to `5.0.0-beta.3`.
3. Commit, tag, and publish `v5.0.0-beta.3`.
4. Start the installed Beta 2 build.
5. Open **About / Help → Windows App Updates**.
6. Choose **Check for Updates**.
7. Download the update.
8. Choose **Restart & Install**.
9. Confirm About / Help reports `v5.0.0-beta.3` and the existing library is unchanged.

Installed beta builds accept newer prereleases. Stable builds can be switched to normal GitHub releases when the beta ends by changing `build.publish[0].releaseType` from `prerelease` to `release`.

## Important first-release limitation

An older installer that does not contain the updater cannot teach itself to update. Testers using Beta 1 or another pre-updater build must manually install Beta 2 once. Every later correctly published release can then be installed through JoeAnimeDB.
