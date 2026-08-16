# JoeAnimeDB 5.0 Beta 16

Beta 16 focuses on smoother cross-device recovery, safer JoeAI recommendation routing, and a cleaner web experience.

## Recovery QR and device linking

- Added **Recovery QR** generation so an existing JoeAnimeDB device can display a scannable device-link code.
- Added **live camera QR scanning** for phones, tablets, and supported browsers.
- Added a saved-image QR fallback for devices that cannot use the live camera.
- Added **Link With Recovery Code** to already-linked devices, so a fresh device can switch to an existing encrypted cloud library.
- Linking a device does **not** overwrite the local library until **Restore Cloud Library** is explicitly chosen.
- Recovery Kits and manual recovery codes remain available as fallback recovery methods.
- Cloud snapshots remain encrypted on-device with AES-256-GCM before upload.

## JoeAI recommendation reliability

- Fixed a title-normalization edge case where non-Latin alternate titles could become an empty match and incorrectly hijack similarity requests.
- Prevented unrelated titles such as NANA or The Promised Neverland from being selected as the source for unrelated recommendation prompts.
- Preserved structured recommendation-card output when JoeAI falls through to the knowledge-first recommendation path.
- Added regression coverage for recommendation routing and recommendation-card output.
- Removed a browser-only global dependency that caused Node reliability tests to fail.

## Web polish

- Added the JoeAnimeDB ramen-bowl favicon for browser tabs and mobile shortcuts.
- Kept the web build aligned with the same Beta 16 source used by the desktop and Android packages.

## Platform release

- Version: **5.0.0-beta.16**
- Windows NSIS installer and updater metadata
- Linux AppImage and updater metadata
- Android APK
- GitHub prerelease remains the source used by the built-in updater.

This is a public beta. Keep your Recovery Kit and recovery code private, maintain a separate backup, and report sync failures, restore problems, incorrect recommendations, broken QR pairing, missing metadata, or controls that do not respond.
