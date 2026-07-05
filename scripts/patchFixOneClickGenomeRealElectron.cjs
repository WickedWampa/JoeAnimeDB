const fs = require('fs');
const path = require('path');

function findRoot(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'electron'))) return dir;
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

// 1) Patch real Electron main file.
patchFile('electron/main.cjs', (text) => {
  let out = text;

  if (!out.includes("execFile")) {
    out = out.replace(
      "const path = require('path');",
      "const path = require('path');\nconst { execFile } = require('child_process');"
    );
  }

  if (!out.includes("function runNodeScript")) {
    const helper = `
function runNodeScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [scriptPath, ...args], { cwd: path.join(__dirname, '..') }, (error, stdout, stderr) => {
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
    // Put helper after imports, before app ready / ipc handlers.
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

    if (out.includes("app.whenReady")) {
      out = out.replace("app.whenReady", handler + "\napp.whenReady");
    } else {
      out += "\n" + handler;
    }
  }

  return out;
});

// 2) Patch real preload file. Your app exposes window.JoeAnimeDB, not window.electronAPI.
patchFile('electron/preload.cjs', (text) => {
  let out = text;

  if (!out.includes("generateGenome:")) {
    // Add inside exposeInMainWorld('JoeAnimeDB', { ... })
    out = out.replace(
      /contextBridge\.exposeInMainWorld\(\s*['"]JoeAnimeDB['"]\s*,\s*\{/,
      (match) => match + "\n  generateGenome: (title) => ipcRenderer.invoke('genome:generate', title),"
    );
  }

  return out;
});

// 3) Patch commandExecutor to call window.JoeAnimeDB instead of window.electronAPI.
patchFile('src/ai/commandExecutor.js', (text) => {
  let out = text;

  out = out.replaceAll("window.electronAPI?.generateGenome", "window.JoeAnimeDB?.generateGenome");
  out = out.replaceAll("window.electronAPI.generateGenome", "window.JoeAnimeDB.generateGenome");

  // Also fix the known bad stderr ternary if it exists.
  out = out.replace(
    `result?.error || 'Unknown error.',
          result?.stderr ? '',
          result?.stderr || ''`,
    `result?.error || 'Unknown error.',
          result?.stderr || ''`
  );

  return out;
});

// 4) Write docs.
const doc = `# Fix — One-Click Genome Generation for Real Electron Layout

Your app uses:

\`\`\`json
"main": "electron/main.cjs"
\`\`\`

and exposes APIs through:

\`\`\`js
window.JoeAnimeDB
\`\`\`

not \`window.electronAPI\`.

This patch wires one-click Genome generation into the real files:

- electron/main.cjs
- electron/preload.cjs
- src/ai/commandExecutor.js

## Test

Restart dev, then ask JoeAI:

\`\`\`text
generate genome for Lord of Mysteries
\`\`\`

Expected success response:

\`\`\`text
🧬 Genome generated for "Lord of Mysteries".

Metadata fetched.
Generated card saved.
Genome registry rebuilt.

Try:
recommend Lord of Mysteries
\`\`\`

## Commit

\`\`\`cmd
git add .
git commit -m "feat: wire one-click genome generation into Electron"
git push
\`\`\`
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'FIX_ONE_CLICK_GENOME_REAL_ELECTRON.md'), doc, 'utf8');

console.log('');
console.log('One-click Genome generation wired to real Electron files.');
console.log('Restart dev and test: generate genome for Lord of Mysteries');
