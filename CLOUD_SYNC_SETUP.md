# JoeAnimeDB Cloud Sync Setup

JoeAnimeDB cloud sync is optional. Local SQLite or IndexedDB storage remains the primary copy on every device. The sync service stores only client-encrypted snapshots and does not require user accounts, email addresses, passwords, or subscriptions.

## Architecture

The first milestone uses:

1. The existing JoeAnimeDB client on web, Windows, Linux, and Android.
2. A Cloudflare Worker that exposes the sync API.
3. A Cloudflare D1 database that stores encrypted snapshots and revision metadata.
4. A Recovery Kit or recovery code that links another device.

The server never receives the encryption secret. The client derives separate encryption and authentication values from the secret. Snapshot contents are encrypted with AES-256-GCM before upload.

## Create the free Cloudflare backend

Run these commands from the repository root:

```bash
cd cloudflare/sync-worker
npm install
npx wrangler login
npx wrangler d1 create joeanime-sync
```

The final command prints a D1 database ID. Copy that ID into `cloudflare/sync-worker/wrangler.toml`, replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`.

Create the remote tables and deploy the Worker:

```bash
npm run db:remote
npm run deploy
```

Wrangler prints a URL similar to:

```text
https://joeanime-sync-api.your-subdomain.workers.dev
```

Test it in a browser:

```text
https://joeanime-sync-api.your-subdomain.workers.dev/health
```

The response should contain `"ok":true`.

## Connect local builds

Create `.env.local` in the repository root:

```text
VITE_SYNC_API_URL=https://joeanime-sync-api.your-subdomain.workers.dev
```

Restart the Vite or Electron development process after changing the environment file.

For Android, rebuild and reinstall the debug APK because Vite environment values are compiled into the application:

```bash
npm run android:debug
```

## Connect Cloudflare Pages

Open the Cloudflare dashboard and select the JoeAnimeDB Pages project.

1. Open Settings, then Environment variables.
2. Add `VITE_SYNC_API_URL` for Production and Preview.
3. Set it to the deployed Worker URL.
4. Redeploy the Pages project.

## Connect GitHub release builds

Open the GitHub repository and select Settings, Secrets and variables, Actions, then Variables. Create a repository variable named `VITE_SYNC_API_URL` with the Worker URL.

The JoeAnimeDB workflows pass that variable into web, Windows, Linux, and Android builds. An unset variable leaves cloud upload disabled while Recovery Kit export and import continue to work.

## First-device test

1. Open Settings in JoeAnimeDB.
2. Select Enable Sync.
3. Download the Recovery Kit and store it somewhere private.
4. Select Upload This Library.
5. Confirm that cloud revision 1 appears.

## Second-device test

Use either method:

1. Import the Recovery Kit. This links the device and offers to restore its bundled encrypted snapshot.
2. Copy the recovery code from the first device, select Link With Recovery Code on the second device, then select Restore Cloud Library.

After changing the library on one device, select Upload This Library. On the other device, select Restore Cloud Library.

## Conflict protection

Every upload includes the last known cloud revision. If another device has already uploaded a newer revision, the Worker rejects the stale upload. Restore the cloud library first, repeat the local change if necessary, and upload again.

Automatic background merging is intentionally not part of the first milestone. Explicit upload and restore actions make conflicts visible while the sync format is tested with real libraries.

## Recovery and privacy

The Recovery Kit contains an encrypted snapshot and the secret needed to open it. Anyone who obtains the file can restore the library, so it must be treated like a password and kept private.

Losing both the Recovery Kit and recovery code means the encrypted cloud copy cannot be recovered. Regular full JSON backups should continue alongside cloud sync.
