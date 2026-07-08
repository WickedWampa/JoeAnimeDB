# One-Click Genome Bridge v2

This wires the assistant command into your real Electron app layout.

Your project uses:

```text
electron/main.cjs
electron/preload.cjs
window.JoeAnimeDB
```

## What this adds

- `ipcMain.handle('genome:generate')` in `electron/main.cjs`
- `window.JoeAnimeDB.generateGenome(title)` in `electron/preload.cjs`
- `commandExecutor.js` now calls `window.JoeAnimeDB.generateGenome(title)`

## Test

```cmd
node scripts\checkGenomeBridge.cjs
npm run dev
```

Then in JoeAI:

```text
generate genome for Made in Abyss
```

Expected:

```text
🧬 Genome generated for "Made in Abyss".
Metadata fetched.
Generated card saved.
Genome registry rebuilt.
Try:
recommend Made in Abyss
```
