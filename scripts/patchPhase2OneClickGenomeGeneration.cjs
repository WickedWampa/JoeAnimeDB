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
    return false;
  }

  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before);

  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    console.log('Patched', rel);
  } else {
    console.log('No change needed', rel);
  }

  return true;
}

// 1) Main process IPC: run existing generator + registry builder.
patchFile('main.cjs', (text) => {
  let out = text;

  if (!out.includes("const { execFile } = require('child_process');")) {
    out = out.replace(
      "const path = require('path');",
      "const path = require('path');\nconst { execFile } = require('child_process');"
    );
  }

  if (!out.includes("function runNodeScript")) {
    const helper = `
function runNodeScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [scriptPath, ...args], { cwd: __dirname }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

`;
    out = out.replace("app.whenReady().then", helper + "app.whenReady().then");
  }

  if (!out.includes("ipcMain.handle('genome:generate'")) {
    const handler = `
ipcMain.handle('genome:generate', async (_event, title) => {
  const cleanTitle = String(title || '').trim();

  if (!cleanTitle) {
    return {
      ok: false,
      title: cleanTitle,
      error: 'No title provided.'
    };
  }

  try {
    const generatorScript = path.join(__dirname, 'scripts', 'generateGenomeCardForTitle.cjs');
    const rebuildScript = path.join(__dirname, 'scripts', 'rebuildGenomeRegistry.cjs');

    const generated = await runNodeScript(generatorScript, [cleanTitle]);
    const rebuilt = await runNodeScript(rebuildScript, []);

    return {
      ok: true,
      title: cleanTitle,
      generatedStdout: generated.stdout,
      generatedStderr: generated.stderr,
      rebuildStdout: rebuilt.stdout,
      rebuildStderr: rebuilt.stderr
    };
  } catch (error) {
    return {
      ok: false,
      title: cleanTitle,
      error: error.message,
      stdout: error.stdout || '',
      stderr: error.stderr || ''
    };
  }
});

`;
    // Add before app ready when possible, otherwise append.
    if (out.includes("app.whenReady().then")) {
      out = out.replace("app.whenReady().then", handler + "\napp.whenReady().then");
    } else {
      out += "\n" + handler;
    }
  }

  return out;
});

// 2) Preload bridge.
patchFile('preload.cjs', (text) => {
  let out = text;

  if (!out.includes("generateGenome")) {
    // Try to add to existing contextBridge object.
    if (out.includes("contextBridge.exposeInMainWorld") && out.includes("electronAPI")) {
      out = out.replace(
        /contextBridge\.exposeInMainWorld\(\s*['"]electronAPI['"]\s*,\s*\{/,
        (match) => match + "\n  generateGenome: (title) => ipcRenderer.invoke('genome:generate', title),"
      );
    } else {
      out += `

contextBridge.exposeInMainWorld('electronAPI', {
  generateGenome: (title) => ipcRenderer.invoke('genome:generate', title)
});
`;
    }
  }

  return out;
});

// 3) Command executor: use Electron bridge if available, fallback to command text.
patchFile('src/ai/commandExecutor.js', (text) => {
  let out = text;

  const oldCase = `    case 'generateGenome':
      return makeTextResult([
        \`🧬 Ready to generate a Genome for "\${intent.title}".\`,
        '',
        'Run these from your project root:',
        '',
        \`node scripts\\\\generateGenomeCardForTitle.cjs "\${intent.title}"\`,
        'node scripts\\\\rebuildGenomeRegistry.cjs',
        '',
        'Then restart dev or refresh JoeAI so the new generated card is available.',
        '',
        'This is the safe bridge. Full one-click generation needs an Electron main-process IPC handler next.'
      ].join('\\n'));`;

  const newCase = `    case 'generateGenome': {
      const title = intent.title;

      if (typeof window !== 'undefined' && window.electronAPI?.generateGenome) {
        const result = await window.electronAPI.generateGenome(title);

        if (result?.ok) {
          return makeTextResult([
            \`🧬 Genome generated for "\${title}".\`,
            '',
            'Metadata fetched.',
            'Generated card saved.',
            'Genome registry rebuilt.',
            '',
            'Try:',
            \`recommend \${title}\`,
            '',
            'Note: generated cards are marked quality: generated and needsReview: true.'
          ].join('\\n'));
        }

        return makeTextResult([
          \`I tried to generate a Genome for "\${title}", but something failed.\`,
          '',
          result?.error || 'Unknown error.',
          result?.stderr ? '',
          result?.stderr || ''
        ].filter(Boolean).join('\\n'));
      }

      return makeTextResult([
        \`🧬 Ready to generate a Genome for "\${title}".\`,
        '',
        'Run these from your project root:',
        '',
        \`node scripts\\\\generateGenomeCardForTitle.cjs "\${title}"\`,
        'node scripts\\\\rebuildGenomeRegistry.cjs'
      ].join('\\n'));
    }`;

  if (out.includes(oldCase)) {
    out = out.replace(oldCase, newCase);
  } else if (!out.includes("window.electronAPI?.generateGenome") && out.includes("case 'generateGenome':")) {
    console.warn('generateGenome case exists but did not match expected block. Manual review may be needed.');
  }

  return out;
});

// 4) Type guard helper for Vite/browser linting if needed.
const doc = `# Phase 2 — One-Click Genome Generation

This adds Electron IPC support for generating Genome cards from inside JoeAI.

## New behavior

In JoeAI:

\`\`\`text
generate genome for Lord of Mysteries
\`\`\`

Expected flow:

1. Electron main runs \`scripts/generateGenomeCardForTitle.cjs\`
2. Electron main runs \`scripts/rebuildGenomeRegistry.cjs\`
3. JoeAI replies that the Genome was generated

## Files patched

- main.cjs
- preload.cjs
- src/ai/commandExecutor.js

## Test

\`\`\`text
generate genome for Lord of Mysteries
recommend Lord of Mysteries
\`\`\`

Generated cards are still marked:

\`\`\`js
quality: 'generated'
needsReview: true
\`\`\`

## Commit

\`\`\`cmd
git add .
git commit -m "feat: add one-click genome generation IPC"
git push
\`\`\`
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'PHASE_2_ONE_CLICK_GENOME_GENERATION.md'), doc, 'utf8');

console.log('');
console.log('Phase 2 one-click Genome generation patch applied.');
console.log('Restart dev, then test: generate genome for Lord of Mysteries');
