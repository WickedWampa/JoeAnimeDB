const fs = require('fs');
const path = require('path');

function findRoot(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'src'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const root = findRoot(process.cwd());

function patchFile(rel, fn) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    console.warn('Missing', rel);
    return;
  }
  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before);
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    console.log('Patched', rel);
  } else {
    console.log('No change needed', rel);
  }
}

patchFile('scripts/rebuildGenomeRegistry.cjs', (text) => {
  if (text.includes("path.join(genomeDir, 'generated')")) return text;
  return text.replace(
    "path.join(genomeDir, 'core100')",
    "path.join(genomeDir, 'core100'),\n  path.join(genomeDir, 'generated')"
  );
});

patchFile('src/ai/intentParser.js', (text) => {
  if (text.includes("kind: 'generateGenome'")) return text;

  const insert = `
  const generateGenomeMatch = raw.match(/^(generate|create|make)\\s+(?:a\\s+)?genome(?:\\s+card)?\\s+(?:for\\s+)?(.+)$/i);
  if (generateGenomeMatch?.[2]) {
    return {
      kind: 'generateGenome',
      title: generateGenomeMatch[2].trim()
    };
  }

`;

  return text.replace(
    "  if (lower.includes('help') || lower.includes('what can you do')) {",
    insert + "  if (lower.includes('help') || lower.includes('what can you do')) {"
  );
});

patchFile('src/ai/commandExecutor.js', (text) => {
  if (text.includes("intent.kind === 'generateGenome'")) return text;

  const marker = "export async function executeJoeAICommand({ intent, anime = [], catalog = [], updateAnime, brain }) {";
  if (!text.includes(marker)) return text;

  const handler = `
  if (intent.kind === 'generateGenome') {
    return {
      type: 'text',
      text: [
        '🧬 Genome generation is ready for: ' + intent.title,
        '',
        'For now, run this from your project root:',
        '',
        'node scripts\\\\generateGenomeCardForTitle.cjs "' + intent.title + '"',
        'node scripts\\\\rebuildGenomeRegistry.cjs',
        '',
        'Next step is wiring this into Electron main so JoeAI can do it automatically from the app.'
      ].join('\\\\n')
    };
  }

`;

  return text.replace(marker, marker + "\n" + handler);
});

patchFile('src/pages/PlaceholderPages.jsx', (text) => {
  if (text.includes("intent.kind === 'generateGenome'")) return text;

  const block = `
    if (intent.kind === 'generateGenome') {
      const result = await executeJoeAICommand({
        intent,
        anime,
        catalog,
        updateAnime,
        brain
      });
      setLog((current) => [...current, { who: 'bot', ...result }]);
      return;
    }

`;

  return text.replace("    if (intent.kind === 'help') {", block + "    if (intent.kind === 'help') {");
});

const doc = `# Phase 1.1 — Auto Genome Generation Bridge

JoeAI can now understand:

\`\`\`text
generate genome for Lord of Mysteries
create genome card for Space Dandy
make genome for Takamine-san
\`\`\`

For now it returns the exact CLI generator commands to run.

## Why not fully automatic yet?

React/browser code cannot safely write project files directly. The final version needs an Electron main-process IPC handler:

\`\`\`text
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
\`\`\`

## Added

- src/ai/genome/runtime/autoGenomeRuntime.js
- generateGenome intent parser support
- assistant bridge for generateGenome intent
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'PHASE_1_1_AUTO_GENOME_GENERATION_BRIDGE.md'), doc, 'utf8');

console.log('');
console.log('Phase 1.1 Auto Genome Generation bridge installed.');
console.log('Test in JoeAI: generate genome for Lord of Mysteries');
