# Phase 1.1 — Auto Genome Generation Bridge

JoeAI can now understand:

```text
generate genome for Lord of Mysteries
create genome card for Space Dandy
make genome for Takamine-san
```

For now it returns the exact CLI generator commands to run.

## Why not fully automatic yet?

React/browser code cannot safely write project files directly. The final version needs an Electron main-process IPC handler:

```text
React Assistant
  ↓
ipcRenderer.invoke('genome:generate', title)
  ↓
Electron main
  ↓
Jikan + OpenAI/heuristic generator
  ↓
writes generatedGenomeCards.js
  ↓
rebuilds or refreshes registry
```

## Added

- src/ai/genome/runtime/autoGenomeRuntime.js
- generateGenome intent parser support
- assistant bridge for generateGenome intent
