# JoeAnimeDB 5.0 Beta 18 — Android Camera Hotfix

Beta 18 fixes the Android Recovery QR scanner.

## Android QR scanner

- Added the Android `CAMERA` permission required by the live Recovery QR scanner.
- Capacitor can now request camera permission when JoeAnimeDB calls `getUserMedia()`.
- Fixes the Android app opening the Live QR Scanner without a permission prompt and leaving the video area inactive.
- No cloud-sync format or recovery-code format changes.
- Beta 17 remains the permanent Android signing baseline, so Beta 18 should install over Beta 17 as a normal signed update.

## Test after updating

1. Open **More → Cloud Sync**.
2. Choose **Scan Recovery QR / Open Camera Scanner**.
3. Android should ask for camera permission the first time.
4. Choose **Allow while using the app**.
5. Point the live camera at a Recovery QR displayed on another JoeAnimeDB device.

If camera permission was previously denied at the OS level, open Android **Settings → Apps → JoeAnimeDB → Permissions → Camera** and allow it.
