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
const file = path.join(root, 'src', 'ai', 'joeAIPersonalityEngine.js');

let text = fs.readFileSync(file, 'utf8');

if (!text.includes("findGenomeCardFromRegistry")) {
  text = text.replace(
    "import { buildKnowledgeIntro, buildKnowledgeWarnings, knowledgeOpinionFor } from './animeKnowledgeBase';",
    "import { buildKnowledgeIntro, buildKnowledgeWarnings, knowledgeOpinionFor } from './animeKnowledgeBase';\nimport { findGenomeCardFromRegistry as findGenomeCard } from './genome/genomeRegistry';"
  );
}

if (!text.includes("function buildGenomeIntro")) {
  const helper = `
function buildGenomeIntro(source = {}) {
  const card = findGenomeCard(source);
  if (!card) return null;

  const title = card.titles?.[0] || source.title || 'that anime';
  const lines = [
    \`🧬 JoeAI Genome Analysis: \${title}\`,
    '',
    card.signature || card.note || \`\${title} has a Genome profile.\`
  ];

  const chasing = card.viewerMotivations || card.chasing || [];
  if (chasing.length) {
    lines.push('', 'What you are probably chasing:');
    lines.push(chasing.slice(0, 6).map((item) => \`• \${item}\`).join('\\n'));
  }

  const whyFansLove = card.whyFansLove || [];
  if (whyFansLove.length) {
    lines.push('', 'Why fans love it:');
    lines.push(whyFansLove.slice(0, 4).map((item) => \`• \${item}\`).join('\\n'));
  }

  if (card.accessibility) {
    lines.push('', \`Accessibility: \${card.accessibility}\`);
  }

  return lines.join('\\n');
}
`;
  text = text.replace("function presetFor(anime = {}) {", helper + "\nfunction presetFor(anime = {}) {");
}

const oldBlock = `  const knowledgeIntro = buildKnowledgeIntro(source);

  const intro = knowledgeIntro
    ? [knowledgeIntro]
    : profile
      ? [
          \`🎭 JoeAI Opinion Mode: \${title}\`,
          '',
          profile.hook,
          '',
          \`Translation: \${profile.chase}.\`
        ]
      : [
          \`🎭 JoeAI Opinion Mode: \${title}\`,
          '',
          \`I do not have a handcrafted opinion profile for \${title} yet, so I’m using Anime DNA plus your library patterns.\`,
          ''
        ];`;

const newBlock = `  const genomeIntro = buildGenomeIntro(source);
  const knowledgeIntro = buildKnowledgeIntro(source);

  const intro = genomeIntro
    ? [genomeIntro]
    : knowledgeIntro
      ? [knowledgeIntro]
      : profile
        ? [
            \`🎭 JoeAI Opinion Mode: \${title}\`,
            '',
            profile.hook,
            '',
            \`Translation: \${profile.chase}.\`
          ]
        : [
            \`🧬 JoeAI DNA Fallback: \${title}\`,
            '',
            \`I do not have a Genome Card or handcrafted profile for \${title} yet, so I’m using Anime DNA plus your library patterns.\`,
            ''
          ];`;

if (!text.includes("const genomeIntro = buildGenomeIntro(source);")) {
  if (!text.includes(oldBlock)) {
    console.error('Could not find the expected intro block in joeAIPersonalityEngine.js. No changes made.');
    process.exit(1);
  }
  text = text.replace(oldBlock, newBlock);
}

// Fix source not being passed into formatOpinionEntry.
text = text.replace(
  "inLibrary.map((entry, index) => formatOpinionEntry(profile, entry, index)).join('\\n\\n')",
  "inLibrary.map((entry, index) => formatOpinionEntry(profile, entry, index, source)).join('\\n\\n')"
);

text = text.replace(
  "discoveries.map((entry, index) => formatOpinionEntry(profile, entry, index)).join('\\n\\n')",
  "discoveries.map((entry, index) => formatOpinionEntry(profile, entry, index, source)).join('\\n\\n')"
);

fs.writeFileSync(file, text, 'utf8');

const doc = `# Sprint 5 — Genome-First Response Refactor

This refactor makes JoeAI use Genome Cards before falling back to legacy Opinion Mode.

## New priority order

1. Anime Genome Card
2. Knowledge intro
3. Legacy personality preset
4. Anime DNA fallback

## Why

JoeAI was saying:

> I do not have a handcrafted opinion profile for Ghost in the Shell yet...

even though Ghost in the Shell had a Genome Card.

Now titles with Genome Cards should produce:

> JoeAI Genome Analysis: Ghost in the Shell

## Also fixed

The personality formatter was not passing \`source\` into recommendation entries, which weakened source-aware opinion text.

## Test prompts

- recommend something like Ghost in the Shell
- I want something like 86
- I want something like Dorohedoro
- recommend something like Initial D
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'SPRINT_5_GENOME_FIRST_RESPONSE.md'), doc, 'utf8');

console.log('Sprint 5 Genome-first response refactor applied.');
console.log('Test: recommend something like Ghost in the Shell');
