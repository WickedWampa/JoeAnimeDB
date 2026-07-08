const fs = require('fs');
const path = require('path');

const root = process.cwd();
const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
const executor = fs.readFileSync(path.join(root, 'src', 'ai', 'commandExecutor.js'), 'utf8');

console.log('Bridge check:');
console.log('main ipc handler:', main.includes("ipcMain.handle('genome:generate'") ? 'OK' : 'MISSING');
console.log('preload generateGenome:', preload.includes('generateGenome:') ? 'OK' : 'MISSING');
console.log('commandExecutor JoeAnimeDB:', executor.includes('window.JoeAnimeDB?.generateGenome') ? 'OK' : 'MISSING');
