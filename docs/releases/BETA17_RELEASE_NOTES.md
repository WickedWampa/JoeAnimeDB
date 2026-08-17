# JoeAnimeDB 5.0 Beta 17

Beta 17 fixes Android distribution by switching JoeAnimeDB from disposable debug-signed APKs to a permanent release signing identity.

## Android update fix

- Android GitHub releases are now built as **signed release APKs** instead of debug APKs.
- Every public Android release from Beta 17 forward uses the same permanent JoeAnimeDB signing key.
- The GitHub Actions release job restores the signing key from encrypted repository secrets, builds `assembleRelease`, and verifies the finished APK with Android `apksigner` before publishing it.
- The package ID remains `com.joeanimedb.app`.
- Android version code is increased to `5000017`.

## Important: one-time Android reinstall

**Beta 16 and earlier Android APKs were debug-signed and cannot be updated in place to Beta 17.**

Android users coming from an older JoeAnimeDB beta should:

1. In the old app, upload the current library to JoeAnimeDB Cloud or save a Recovery Kit.
2. Uninstall the old JoeAnimeDB Android app.
3. Install the **Beta 17 Android APK** fresh.
4. Link the new install using the Recovery QR, recovery code, or Recovery Kit.
5. Choose **Restore Cloud Library**.

After that one-time migration, future JoeAnimeDB Android APKs signed with this same release key should install as normal updates without requiring another uninstall.

## Included from Beta 16

- Recovery QR generation and live-camera QR pairing.
- Recovery-code linking for new or already-linked devices.
- Encrypted cloud upload/restore and Recovery Kits.
- JoeAI recommendation routing fixes and recommendation-card fallback fixes.
- Browser favicon and web polish.

## Platform release

- Version: **5.0.0-beta.17**
- Windows NSIS installer and updater metadata
- Linux AppImage and updater metadata
- **Permanently signed Android release APK**
- GitHub prerelease remains the source used by the built-in updater.

This is a public beta. Keep your Recovery Kit and recovery code private, and keep a private backup of the permanent Android signing keystore.
