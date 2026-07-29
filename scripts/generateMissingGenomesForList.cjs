const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

function findRoot(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'src'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function runNode(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [scriptPath, ...args], { cwd: root }, (error, stdout, stderr) => {
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

function normalizeTitle(item) {
  if (typeof item === 'string') return item.trim();
  return String(item?.officialTitle || item?.titleEnglish || item?.title || item?.name || '').trim();
}

function existingGenomeTitles() {
  const registryFile = path.join(root, 'src', 'ai', 'genome', 'genomeRegistry.js');
  if (!fs.existsSync(registryFile)) return new Set();

  const text = fs.readFileSync(registryFile, 'utf8').toLowerCase();
  return {
    has(title) {
      const clean = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!clean || clean.length < 3) return true;
      return text.includes(clean) || text.includes(clean.replaceAll(' ', '-'));
    }
  };
}

const root = findRoot(process.cwd());

async function main() {
  const inputFile = process.argv[2];
  const limit = Number(process.argv[3] || 0);

  if (!inputFile || !fs.existsSync(inputFile)) {
    console.error('Usage: node scripts/generateMissingGenomesForList.cjs <anime-list.json> [limit]');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.anime || raw.items || raw.library || [];
  const titles = [...new Set(list.map(normalizeTitle).filter(Boolean))];

  const registry = existingGenomeTitles();
  const missing = titles.filter((title) => !registry.has(title));
  const queue = limit > 0 ? missing.slice(0, limit) : missing;

  const generator = path.join(root, 'scripts', 'generateGenomeCardForTitle.cjs');
  const rebuild = path.join(root, 'scripts', 'rebuildGenomeRegistry.cjs');

  const generated = [];
  const skipped = titles.filter((title) => registry.has(title));
  const failed = [];

  console.log('Anime titles found:', titles.length);
  console.log('Already have Genome:', skipped.length);
  console.log('Missing Genome:', missing.length);
  console.log('Generating now:', queue.length);

  for (const title of queue) {
    try {
      console.log('');
      console.log('Generating Genome:', title);
      await runNode(generator, [title]);
      generated.push(title);
      await new Promise((resolve) => setTimeout(resolve, 900));
    } catch (error) {
      failed.push(title + (error.message ? ': ' + error.message : ''));
      console.warn('Failed:', title, error.message);
    }
  }

  console.log('');
  console.log('Rebuilding registry...');
  await runNode(rebuild, []);

  console.log('');
  console.log('Genome batch complete.');
  console.log('Generated:', generated.length);
  console.log('Skipped:', skipped.length);
  console.log('Failed:', failed.length);

  if (failed.length) {
    console.log('');
    console.log('Failed titles:');
    failed.forEach((x) => console.log('- ' + x));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
