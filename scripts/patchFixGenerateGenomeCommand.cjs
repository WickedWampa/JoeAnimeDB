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
const file = path.join(root, 'src', 'ai', 'commandExecutor.js');

if (!fs.existsSync(file)) {
  console.error('Missing src/ai/commandExecutor.js');
  process.exit(1);
}

let text = fs.readFileSync(file, 'utf8');

if (!text.includes("case 'generateGenome':")) {
  const insert = `

    case 'generateGenome':
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
      ].join('\\n'));
`;

  const marker = "    case 'recommendation':";
  if (!text.includes(marker)) {
    console.error("Could not find recommendation case marker.");
    process.exit(1);
  }

  text = text.replace(marker, insert + "\n" + marker);
}

fs.writeFileSync(file, text, 'utf8');

const doc = `# Fix — Generate Genome Command

This adds the missing \`generateGenome\` case to \`src/ai/commandExecutor.js\`.

## Test in JoeAI

\`\`\`text
generate genome for Lord of Mysteries
\`\`\`

Expected response:

\`\`\`text
🧬 Ready to generate a Genome for "Lord of Mysteries".

Run these from your project root:

node scripts\\generateGenomeCardForTitle.cjs "Lord of Mysteries"
node scripts\\rebuildGenomeRegistry.cjs
\`\`\`

## Next

Full one-click generation needs Electron IPC so the UI can safely run the generator and rebuild the registry from the main process.
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'FIX_GENERATE_GENOME_COMMAND.md'), doc, 'utf8');

console.log('generateGenome command fixed in commandExecutor.js');
console.log('Test in JoeAI: generate genome for Lord of Mysteries');
