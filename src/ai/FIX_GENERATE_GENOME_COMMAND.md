# Fix — Generate Genome Command

This adds the missing `generateGenome` case to `src/ai/commandExecutor.js`.

## Test in JoeAI

```text
generate genome for Lord of Mysteries
```

Expected response:

```text
🧬 Ready to generate a Genome for "Lord of Mysteries".

Run these from your project root:

node scripts\generateGenomeCardForTitle.cjs "Lord of Mysteries"
node scripts\rebuildGenomeRegistry.cjs
```

## Next

Full one-click generation needs Electron IPC so the UI can safely run the generator and rebuild the registry from the main process.
