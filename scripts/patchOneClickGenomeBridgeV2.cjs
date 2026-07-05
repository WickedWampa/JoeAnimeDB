const fs = require('fs');
const path = require('path');

function findRoot(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (
      fs.existsSync(path.join(dir, 'package.json')) &&
      fs.existsSync(path.join(dir, 'electron', 'main.cjs')) &&
      fs.existsSync(path.join(dir, 'electron', 'preload.cjs'))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const root = findRoot(process.cwd());

function patchFile(rel, fn) {
  const file = path.join(root, rel);

  if (!fs.existsSync(file)) {
    console.error('Missing ' + rel);
    process.exitCode = 1;
    return;
  }

  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before);

  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    console.log('Patched ' + rel);
  } else {
    console.log('No change needed ' + rel);
  }
}

// 1. Patch electron/main.cjs.
// Adds ipcMain handler that runs:
// - scripts/generateGenomeCardForTitle.cjs
// - scripts/rebuildGenomeRegistry.cjs
patchFile('electron/main.cjs', (text) => {
  let out = text;

  if (!out.includes("const { execFile } = require('child_process');")) {
    if (out.includes("const path = require('path');")) {
      out = out.replace(
        "const path = require('path');",
        "const path = require('path');\nconst { execFile } = require('child_process');"
      );
    } else {
      out = "const { execFile } = require('child_process');\n" + out;
    }
  }

  if (!out.includes('function joeRunNodeScript')) {
    const helper = `
function joeRunNodeScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [scriptPath, ...args],
      { cwd: path.join(__dirname, '..') },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }

        resolve({ stdout, stderr });
      }
    );
  });
}

`;
    if (out.includes("let mainWindow")) {
      out = out.replace("let mainWindow", helper + "let mainWindow");
    } else if (out.includes("function createWindow")) {
      out = out.replace("function createWindow", helper + "function createWindow");
    } else {
      out = helper + out;
    }
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
    const generatorScript = path.join(__dirname, '..', 'scripts', 'generateGenomeCardForTitle.cjs');
    const rebuildScript = path.join(__dirname, '..', 'scripts', 'rebuildGenomeRegistry.cjs');

    if (!fs.existsSync(generatorScript)) {
      return {
        ok: false,
        title: cleanTitle,
        error: 'Missing generator script: ' + generatorScript
      };
    }

    if (!fs.existsSync(rebuildScript)) {
      return {
        ok: false,
        title: cleanTitle,
        error: 'Missing registry builder script: ' + rebuildScript
      };
    }

    const generated = await joeRunNodeScript(generatorScript, [cleanTitle]);
    const rebuilt = await joeRunNodeScript(rebuildScript, []);

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
      error: error.message || String(error),
      stdout: error.stdout || '',
      stderr: error.stderr || ''
    };
  }
});

`;

    // Add before app.whenReady if possible so handler is registered early.
    if (out.includes("app.whenReady")) {
      out = out.replace("app.whenReady", handler + "\napp.whenReady");
    } else {
      out += "\n" + handler;
    }
  }

  return out;
});

// 2. Patch electron/preload.cjs.
// Your app exposes window.JoeAnimeDB, so add generateGenome there.
patchFile('electron/preload.cjs', (text) => {
  let out = text;

  if (!out.includes("generateGenome:")) {
    out = out.replace(
      /contextBridge\.exposeInMainWorld\(\s*['"]JoeAnimeDB['"]\s*,\s*\{/,
      (match) => match + "\n  generateGenome: (title) => ipcRenderer.invoke('genome:generate', title),"
    );
  }

  return out;
});

// 3. Patch commandExecutor.js to use the real bridge.
patchFile('src/ai/commandExecutor.js', (text) => {
  let out = text;

  out = out.replaceAll("window.electronAPI?.generateGenome", "window.JoeAnimeDB?.generateGenome");
  out = out.replaceAll("window.electronAPI.generateGenome", "window.JoeAnimeDB.generateGenome");

  // Fix previous bad ternary if it exists.
  out = out.replace(
    `result?.error || 'Unknown error.',
          result?.stderr ? '',
          result?.stderr || ''`,
    `result?.error || 'Unknown error.',
          result?.stderr || ''`
  );

  // If generateGenome still only returns CLI text, replace that case with one-click logic.
  const start = out.indexOf("    case 'generateGenome':");
  const next = start === -1 ? -1 : out.indexOf("\n    case 'recommendation':", start);

  if (start !== -1 && next !== -1 && !out.slice(start, next).includes("window.JoeAnimeDB?.generateGenome")) {
    const replacement = `    case 'generateGenome': {
      const title = intent.title;

      if (typeof window !== 'undefined' && window.JoeAnimeDB?.generateGenome) {
        const result = await window.JoeAnimeDB.generateGenome(title);

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
          result?.stderr || ''
        ].filter(Boolean).join('\\n'));
      }

      return makeTextResult([
        \`🧬 Ready to generate a Genome for "\${title}".\`,
        '',
        'The Electron bridge is not available yet. Restart npm run dev, then try again.',
        '',
        'Fallback commands:',
        \`node scripts\\\\generateGenomeCardForTitle.cjs "\${title}"\`,
        'node scripts\\\\rebuildGenomeRegistry.cjs'
      ].join('\\n'));
    }

`;
    out = out.slice(0, start) + replacement + out.slice(next + 1);
  }

  return out;
});

// 4. Write a quick bridge test script.
const testScript = `const fs = require('fs');
const path = require('path');

const root = process.cwd();
const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
const executor = fs.readFileSync(path.join(root, 'src', 'ai', 'commandExecutor.js'), 'utf8');

console.log('Bridge check:');
console.log('main ipc handler:', main.includes("ipcMain.handle('genome:generate'") ? 'OK' : 'MISSING');
console.log('preload generateGenome:', preload.includes('generateGenome:') ? 'OK' : 'MISSING');
console.log('commandExecutor JoeAnimeDB:', executor.includes('window.JoeAnimeDB?.generateGenome') ? 'OK' : 'MISSING');
`;

fs.writeFileSync(path.join(root, 'scripts', 'checkGenomeBridge.cjs'), testScript, 'utf8');

// 5. Documentation.
const doc = `# One-Click Genome Bridge v2

This wires the assistant command into your real Electron app layout.

Your project uses:

\`\`\`text
electron/main.cjs
electron/preload.cjs
window.JoeAnimeDB
\`\`\`

## What this adds

- \`ipcMain.handle('genome:generate')\` in \`electron/main.cjs\`
- \`window.JoeAnimeDB.generateGenome(title)\` in \`electron/preload.cjs\`
- \`commandExecutor.js\` now calls \`window.JoeAnimeDB.generateGenome(title)\`

## Test

\`\`\`cmd
node scripts\\checkGenomeBridge.cjs
npm run dev
\`\`\`

Then in JoeAI:

\`\`\`text
generate genome for Made in Abyss
\`\`\`

Expected:

\`\`\`text
🧬 Genome generated for "Made in Abyss".
Metadata fetched.
Generated card saved.
Genome registry rebuilt.
Try:
recommend Made in Abyss
\`\`\`
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'ONE_CLICK_GENOME_BRIDGE_V2.md'), doc, 'utf8');

console.log('');
console.log('One-click Genome bridge v2 installed.');
console.log('Run: node scripts\\\\checkGenomeBridge.cjs');
console.log('Then restart dev and test: generate genome for Made in Abyss');
