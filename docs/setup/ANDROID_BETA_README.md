# JoeAnimeDB Android beta foundation

The Android application uses Capacitor and the existing React/Vite UI. Electron and `better-sqlite3` remain the desktop runtime; Android installs a platform bridge with the same database interface backed by `@capacitor-community/sqlite`.

## Requirements

- Node.js 22 or newer
- JDK 21
- Android Studio with Android SDK 36 and Build Tools 36.0.0

## Build a debug APK

```bash
npm ci
npm run android:debug
```

The APK is written to:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Android's `versionName` and monotonically increasing `versionCode` are derived
from the root `package.json`, so bump the package version before each APK build.

The npm command works on Windows, Linux, and macOS even when an archive has
removed the executable bit from `android/gradlew`. To invoke Gradle manually on
Windows, run the sync first and use the Windows wrapper:

```powershell
npm run android:sync
cd android
.\gradlew.bat assembleDebug
```

The `Android Debug APK` GitHub Actions workflow performs the same build and uploads the APK as a temporary workflow artifact.

> Debug APKs produced by different computers or fresh CI runners may use
> different signing keys and therefore may not install over one another. Use a
> single private release keystore before distributing updateable Android betas;
> otherwise testers may have to uninstall the old APK and lose local app data.

## Runtime boundaries

- Desktop continues using Electron IPC and `better-sqlite3`.
- Android uses private app storage and native SQLite.
- Browser development keeps the existing localStorage fallback.
- Full backups remain JSON-compatible across desktop and Android.
- Android exports use the system share sheet and a private cache file.
- Android system backup/device-transfer extraction is disabled for the database and preferences.
- No iOS platform has been added.

## Before a public signed beta

Create a release keystore outside the repository and keep its path and passwords in environment variables or GitHub Actions secrets. Do not add keystores, `keystore.properties`, `google-services.json`, exported personal libraries, or API keys to source control.
