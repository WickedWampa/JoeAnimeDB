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
const registryFile = path.join(root, 'src', 'ai', 'genome', 'genomeRegistry.js');
let text = fs.readFileSync(registryFile, 'utf8');

if (!text.includes("pack2BattleShonen")) {
  text = text.replace(
`try {
  const fantasy = await import('./enhanced/fantasy/pack1FantasyIsekai');
  enhancedCards = [
    ...enhancedCards,
    ...(fantasy.ENHANCED_FANTASY_PACK_1 || [])
  ];
} catch {
  enhancedCards = [];
}`,
`try {
  const fantasy = await import('./enhanced/fantasy/pack1FantasyIsekai');
  enhancedCards = [
    ...enhancedCards,
    ...(fantasy.ENHANCED_FANTASY_PACK_1 || [])
  ];
} catch {}

try {
  const battle = await import('./enhanced/battle/pack2BattleShonen');
  enhancedCards = [
    ...enhancedCards,
    ...(battle.ENHANCED_BATTLE_PACK_2 || [])
  ];
} catch {}`
  );
}

fs.writeFileSync(registryFile, text);

const docFile = path.join(root, 'src', 'ai', 'SPRINT_5_ENHANCED_PACKS.md');
let doc = fs.existsSync(docFile) ? fs.readFileSync(docFile, 'utf8') : '# Sprint 5 Enhanced Genome Packs\n';
if (!doc.includes('Pack 2 — Battle Shonen')) {
  doc += `\n\n## Pack 2 — Battle Shonen\n\nAdded 12 enhanced Genome Cards:\n\n- Dragon Ball Z\n- My Hero Academia\n- Black Clover\n- Yu Yu Hakusho\n- Fairy Tail\n- One Punch Man\n- JoJo's Bizarre Adventure\n- Soul Eater\n- Fire Force\n- Blue Exorcist\n- Dr. Stone\n- Mashle\n`;
}
fs.writeFileSync(docFile, doc);

console.log('Enhanced Pack 2 — Battle Shonen connected to Genome Registry.');
