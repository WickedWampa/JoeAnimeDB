const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function findRoot(start) {
  let dir = start;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'src'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

const root = findRoot(process.cwd());
const builderPath = path.join(root, 'scripts', 'rebuildGenomeRegistry.cjs');
const packPath = path.join(root, 'src', 'ai', 'genome', 'gold', 'goldStandardGenomeCardsPack2.js');

if (!fs.existsSync(packPath)) {
  console.error('Gold Pack 2 file not found:', path.relative(root, packPath));
  console.error('Extract the ZIP into your JoeAnimeDB repo root first.');
  process.exit(1);
}

if (!fs.existsSync(builderPath)) {
  console.error('Registry builder not found:', path.relative(root, builderPath));
  process.exit(1);
}

let builder = fs.readFileSync(builderPath, 'utf8');

if (!builder.includes("path.join(genomeDir, 'gold')")) {
  const before = "const sources = [ path.join(genomeDir, 'core25'),";
  const after = "const sources = [ path.join(genomeDir, 'gold'), path.join(genomeDir, 'core25'),";
  if (!builder.includes(before)) {
    console.error('Could not patch sources array automatically. The builder format changed.');
    process.exit(1);
  }
  builder = builder.replace(before, after);
  fs.writeFileSync(builderPath, builder, 'utf8');
  console.log('Patched scripts/rebuildGenomeRegistry.cjs to scan src/ai/genome/gold.');
} else {
  console.log('Registry builder already scans src/ai/genome/gold.');
}

const result = spawnSync(process.execPath, [builderPath], {
  cwd: root,
  stdio: 'inherit'
});

if (result.status !== 0) {
  console.error('Registry rebuild failed.');
  process.exit(result.status || 1);
}

console.log('');
console.log('Gold Pack 2 installed.');
console.log('Next suggested checks:');
console.log('  npm run build');
console.log('  git diff -- src/ai/genome/gold scripts/rebuildGenomeRegistry.cjs src/ai/genome/genomeRegistry.js');
console.log('  git add src/ai/genome/gold/goldStandardGenomeCardsPack2.js scripts/rebuildGenomeRegistry.cjs src/ai/genome/genomeRegistry.js');
console.log('  git commit -m "feat: add gold genome pack 2"');
