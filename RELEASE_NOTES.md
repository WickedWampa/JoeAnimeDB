# JoeAnimeDB 5.0 Beta 14

Beta 14 adds optional encrypted device sync while keeping JoeAnimeDB offline-first. It also packages the Windows installer, Linux AppImage, and Android APK together in one GitHub prerelease.

## Optional encrypted device sync

- Added account-free library transfer between web, Windows, Linux, and Android.
- Encrypts each cloud snapshot on the device with AES-256-GCM before upload.
- Added Recovery Kits and recovery codes for linking another device without an email address, account, or subscription.
- Added upload and restore controls with visible cloud revision and last-sync status.
- Keeps local storage as the primary copy. Cloud sync remains optional and user-controlled.
- Replaces the previous cloud snapshot when a newer revision is uploaded.

## Reliability and data safety

- Added corrupt-data fallback and encrypted recovery tests.
- Verified full backup creation, parsing, and preference restoration.
- Preserved MyAnimeList and AniList import and export support.
- Added release-gate coverage for cloud sync, web and desktop backup replacement, Android restore wiring, and cross-platform version identity.

## Platform release

- Updated version identity to 5.0.0-beta.14 across web, Windows, Linux, and Android.
- Added the production sync API configuration to automated builds.
- Publishes the Windows installer, Linux AppImage, and Android APK under the same Beta 14 prerelease.

This is a public beta. Keep your Recovery Kit private and store a separate backup. Please report sync failures, restore problems, incorrect recommendations, missing metadata, import mismatches, broken provider links, or controls that do not respond.
