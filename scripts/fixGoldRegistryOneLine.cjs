const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

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
    console.warn('Missing:', rel);
    return false;
  }
  const before = fs.readFileSync(file, 'utf8');
  const after = fn(before);
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    console.log('Patched:', rel);
  } else {
    console.log('No change needed:', rel);
  }
  return true;
}

const goldSpread = "  ...normalizePack(GOLD_STANDARD_GENOME_CARDS, 'src/ai/genome/gold/goldStandardGenomeCards.js#GOLD_STANDARD_GENOME_CARDS'),\n";
const goldImport = "import { GOLD_STANDARD_GENOME_CARDS } from './gold/goldStandardGenomeCards';\n";

// Patch generated registry now.
patchFile('src/ai/genome/genomeRegistry.js', (text) => {
  let out = text;

  // Put gold import with the other imports, before any function/const declarations.
  out = out.replace(goldImport, '');
  const firstNonImport = out.search(/\nfunction |\nexport const GENOME_REGISTRY_VERSION/);
  if (firstNonImport !== -1) {
    out = out.slice(0, firstNonImport + 1) + goldImport + out.slice(firstNonImport + 1);
  } else {
    out = goldImport + out;
  }

  // Gold must be first because the registry duplicate filter keeps first card by id.
  if (!out.includes(goldSpread.trim())) {
    out = out.replace('const RAW_GENOME_REGISTRY = [\n', 'const RAW_GENOME_REGISTRY = [\n' + goldSpread);
  }

  return out;
});

// Patch registry builder so rebuilds keep the fix.
patchFile('scripts/rebuildGenomeRegistry.cjs', (text) => {
  let out = text;

  // Make builder scan gold first if source list exists.
  if (!out.includes("path.join(genomeDir, 'gold')")) {
    out = out.replace(
      "const sources = [ path.join(genomeDir, 'core25'),",
      "const sources = [ path.join(genomeDir, 'gold'), path.join(genomeDir, 'core25'),"
    );
  }

  // If builder already has the gold import in the template but forgot the RAW spread,
  // inject the spread in the generated template.
  if (!out.includes("GOLD_STANDARD_GENOME_CARDS, 'src/ai/genome/gold/goldStandardGenomeCards.js#GOLD_STANDARD_GENOME_CARDS'")) {
    out = out.replace(
      "const RAW_GENOME_REGISTRY = [",
      "const RAW_GENOME_REGISTRY = [\n  ...normalizePack(GOLD_STANDARD_GENOME_CARDS, 'src/ai/genome/gold/goldStandardGenomeCards.js#GOLD_STANDARD_GENOME_CARDS'),"
    );
  }

  return out;
});

// Try rebuild, then patch registry one more time in case builder shape was weird.
const rebuild = path.join(root, 'scripts', 'rebuildGenomeRegistry.cjs');
if (fs.existsSync(rebuild)) {
  try {
    execFileSync(process.execPath, [rebuild], { cwd: root, stdio: 'inherit' });
  } catch (error) {
    console.warn('Rebuild failed, but direct registry patch was applied:', error.message);
  }

  patchFile('src/ai/genome/genomeRegistry.js', (text) => {
    let out = text;
    out = out.replace(goldImport, '');
    const firstNonImport = out.search(/\nfunction |\nexport const GENOME_REGISTRY_VERSION/);
    if (firstNonImport !== -1) {
      out = out.slice(0, firstNonImport + 1) + goldImport + out.slice(firstNonImport + 1);
    } else {
      out = goldImport + out;
    }
    if (!out.includes(goldSpread.trim())) {
      out = out.replace('const RAW_GENOME_REGISTRY = [\n', 'const RAW_GENOME_REGISTRY = [\n' + goldSpread);
    }
    return out;
  });
}

// Verification
const registry = fs.readFileSync(path.join(root, 'src', 'ai', 'genome', 'genomeRegistry.js'), 'utf8');
const hasGoldImport = registry.includes("GOLD_STANDARD_GENOME_CARDS");
const rawIndex = registry.indexOf('const RAW_GENOME_REGISTRY = [');
const goldIndex = registry.indexOf('GOLD_STANDARD_GENOME_CARDS', rawIndex);
const coreIndex = registry.indexOf('CORE25_EXPERT_GENOME_CARDS', rawIndex);

console.log('');
console.log('Gold import:', hasGoldImport ? 'OK' : 'MISSING');
console.log('Gold before Core25:', goldIndex !== -1 && coreIndex !== -1 && goldIndex < coreIndex ? 'OK' : 'CHECK');
console.log('');
console.log('Now run: npm run dev');
console.log('Test: recommend One Piece / Naruto / Bleach');
