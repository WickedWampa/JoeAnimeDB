# JoeAnimeDB Android Release Signing

JoeAnimeDB Android releases must use one permanent signing key. The same key signs every public APK so Android can verify that a new APK is a legitimate update to the installed app.

## One-time setup

1. Run `setup-android-signing.cmd` from the JoeAnimeDB repository root.
2. The script creates `android-signing-private/joeanime-release.jks` and opens `android-signing-private/github-secrets.txt`.
3. In GitHub repository **Settings → Secrets and variables → Actions**, create these four repository secrets using the values from that text file:
   - `ANDROID_KEYSTORE_BASE64`
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`
4. Back up `joeanime-release.jks` somewhere private and durable. Keep it permanently.
5. After the four GitHub secrets are saved, delete `github-secrets.txt` if desired. Do not delete the `.jks` backup.

The repository already ignores `*.jks`, `*.keystore`, and APK files. Never force-add the signing key to Git.

## What changed in the release workflow

The Android release job now:

- restores the private signing keystore from GitHub Actions secrets;
- runs the normal Capacitor/Vite sync;
- builds `assembleRelease` instead of `assembleDebug`;
- requires all signing credentials to be present;
- verifies the resulting APK with Android `apksigner`;
- publishes `app-release.apk` as `JoeAnimeDB-<version>-Android.apk`.

## Transition from old Beta APKs

Previous public Android APKs were debug-signed. A new release signed by the permanent JoeAnimeDB key cannot be installed over an app signed by a different debug certificate.

For the first permanently signed release only:

1. Upload/safeguard the current JoeAnimeDB library first.
2. Uninstall the old Android beta.
3. Install the first permanently signed JoeAnimeDB APK fresh.
4. Link the device using Recovery QR / recovery code.
5. Restore the cloud library.

After that one-time migration, future APKs signed with this same key can update the installed signed app in place, provided the package ID remains `com.joeanimedb.app` and the Android version code increases.
