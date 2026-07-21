# Fix — One-Click Genome Generation for Real Electron Layout

Your app uses:

```json
"main": "electron/main.cjs"
```

and exposes APIs through:

```js
window.JoeAnimeDB
```

not `window.electronAPI`.

This patch wires one-click Genome generation into the real files:

- electron/main.cjs
- electron/preload.cjs
- src/ai/commandExecutor.js

## Test

Restart dev, then ask JoeAI:

```text
generate genome for Lord of Mysteries
```

Expected success response:

```text
🧬 Genome generated for "Lord of Mysteries".

Metadata fetched.
Generated card saved.
Genome registry rebuilt.

Try:
recommend Lord of Mysteries
```

## Commit

```cmd
git add .
git commit -m "feat: wire one-click genome generation into Electron"
git push
```
