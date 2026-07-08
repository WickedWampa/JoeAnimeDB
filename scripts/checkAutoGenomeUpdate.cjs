const fs = require('fs');
const path = require('path');

const root = process.cwd();
const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
const pages = fs.readFileSync(path.join(root, 'src', 'pages', 'PlaceholderPages.jsx'), 'utf8');

console.log('Auto Genome on Update check:');
console.log('main batch IPC:', main.includes("ipcMain.handle('genome:generateMissingForLibrary'") ? 'OK' : 'MISSING');
console.log('preload batch bridge:', preload.includes('generateMissingGenomesForLibrary') ? 'OK' : 'MISSING');
console.log('settings button:', pages.includes('Update Database + Genomes') ? 'OK' : 'MISSING');
console.log('batch script:', fs.existsSync(path.join(root, 'scripts', 'generateMissingGenomesForList.cjs')) ? 'OK' : 'MISSING');
