#!/usr/bin/env node
/*
  JoeAnimeDB - Wire Gold Pack 2
  Run from repo root:
    node scripts\\wireGoldPack2.cjs

  What it does:
  - Verifies Gold Pack 2 exists
  - Patches src/ai/genome/genomeRegistry.js to import/use Pack 2 if needed
  - Patches scripts/rebuildGenomeRegistry.cjs to include Pack 2 if needed
  - Makes .bak backups before changing files
*/

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const pack2Rel = path.join('src', 'ai', 'genome', 'gold', 'goldStandardGenomeCardsPack2.js');
const registryRel = path.join('src', 'ai', 'genome', 'genomeRegistry.js');
const builderRel = path.join('scripts', 'rebuildGenomeRegistry.cjs');

const pack2 = path.join(root, pack2Rel);
const registry = path.join(root, registryRel);
const builder = path.join(root, builderRel);

function die(msg) {
  console.error('\n❌ ' + msg);
  process.exit(1);
}

function read(file) {
  if (!fs.existsSync(file)) die(`Missing file: ${path.relative(root, file)}`);
  return fs.readFileSync(file, 'utf8');
}

function backup(file) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = `${file}.bak-${stamp}`;
  fs.copyFileSync(file, bak);
  console.log(`Backup: ${path.relative(root, bak)}`);
}

function writeIfChanged(file, before, after) {
  if (before === after) {
    console.log(`No change needed: ${path.relative(root, file)}`);
    return false;
  }
  backup(file);
  fs.writeFileSync(file, after, 'utf8');
  console.log(`Patched: ${path.relative(root, file)}`);
  return true;
}

function patchImportsAndArray(source, importPath) {
  let out = source;

  const importLine = `import { goldStandardGenomeCardsPack2 } from '${importPath}';`;
  const importLineDbl = `import { goldStandardGenomeCardsPack2 } from \"${importPath}\";`;

  if (!out.includes('goldStandardGenomeCardsPack2')) {
    const goldImportRegex = /import\s+\{\s*goldStandardGenomeCards\s*\}\s+from\s+['\"][^'\"]+goldStandardGenomeCards\.js['\"];?/;
    const match = out.match(goldImportRegex);
    if (match) {
      out = out.replace(match[0], `${match[0]}\n${importLine}`);
    } else {
      // Fallback: add after last import.
      const imports = [...out.matchAll(/^import .*$/gm)];
      if (imports.length) {
        const last = imports[imports.length - 1];
        const insertAt = last.index + last[0].length;
        out = out.slice(0, insertAt) + `\n${importLine}` + out.slice(insertAt);
      } else {
        out = `${importLine}\n${out}`;
      }
    }
  }

  // If import existed but the array/reference does not, add Pack 2 right after Pack 1.
  const useCount = (out.match(/goldStandardGenomeCardsPack2/g) || []).length;
  if (useCount < 2) {
    // Most common forms: arrays containing goldStandardGenomeCards,
    out = out.replace(/(goldStandardGenomeCards\s*,)(?!\s*\n\s*goldStandardGenomeCardsPack2)/, `$1\n  goldStandardGenomeCardsPack2,`);
  }

  return out;
}

console.log('\n=== JoeAnimeDB Gold Pack 2 Wirer ===\n');

if (!fs.existsSync(pack2)) {
  die(`Gold Pack 2 was not found at ${pack2Rel}\nMove goldStandardGenomeCardsPack2.js there first, then run this again.`);
}

const packText = read(pack2);
if (!packText.includes('goldStandardGenomeCardsPack2')) {
  die('Gold Pack 2 file exists, but it does not export/use goldStandardGenomeCardsPack2.');
}
console.log('Found Gold Pack 2.');

if (fs.existsSync(registry)) {
  const before = read(registry);
  const after = patchImportsAndArray(before, './gold/goldStandardGenomeCardsPack2.js');
  writeIfChanged(registry, before, after);
} else {
  console.log(`Skipping missing optional file: ${registryRel}`);
}

if (fs.existsSync(builder)) {
  const before = read(builder);
  const after = patchImportsAndArray(before, '../src/ai/genome/gold/goldStandardGenomeCardsPack2.js');
  writeIfChanged(builder, before, after);
} else {
  console.log(`Skipping missing optional file: ${builderRel}`);
}

console.log('\n✅ Gold Pack 2 wiring script finished.');
console.log('\nNow run:');
console.log('  node scripts\\rebuildGenomeRegistry.cjs');
console.log('  npm run build');
console.log('\nIf either command errors, send me the screenshot.\n');
