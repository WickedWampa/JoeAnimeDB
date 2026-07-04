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

// 1) Add Genome registry import.
const importLine = "import { buildKnowledgeIntro, buildKnowledgeWarnings, knowledgeOpinionFor } from './animeKnowledgeBase';";
const importReplacement =
  "import { buildKnowledgeIntro, buildKnowledgeWarnings, knowledgeOpinionFor } from './animeKnowledgeBase';\n" +
  "import { findGenomeCardFromRegistry as findGenomeCard } from './genome/genomeRegistry';";

if (!text.includes("findGenomeCardFromRegistry as findGenomeCard")) {
  if (!text.includes(importLine)) {
    console.error('Expected animeKnowledgeBase import not found. No changes made.');
    process.exit(1);
  }
  text = text.replace(importLine, importReplacement);
}

// 2) Add Genome intro helper before presetFor().
if (!text.includes("function buildGenomeIntro")) {
  const helper = `
function buildGenomeIntro(source = {}) {
  const card = findGenomeCard(source);
  if (!card) return null;

  const title = card.titles?.[0] || source.title || source.officialTitle || 'that anime';

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
  const marker = "function presetFor(anime = {}) {";
  if (!text.includes(marker)) {
    console.error('Expected presetFor() marker not found. No changes made.');
    process.exit(1);
  }
  text = text.replace(marker, helper + marker);
}

// 3) Replace the exact intro priority block.
const oldIntro = `  const knowledgeIntro = buildKnowledgeIntro(source);

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

const newIntro = `  const genomeIntro = buildGenomeIntro(source);
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
  if (!text.includes(oldIntro)) {
    console.error('Expected intro block not found. No changes made.');
    process.exit(1);
  }
  text = text.replace(oldIntro, newIntro);
}

// 4) Fix source not being passed into formatOpinionEntry().
text = text.replace(
  "inLibrary.map((entry, index) => formatOpinionEntry(profile, entry, index)).join('\\n\\n')",
  "inLibrary.map((entry, index) => formatOpinionEntry(profile, entry, index, source)).join('\\n\\n')"
);

text = text.replace(
  "discoveries.map((entry, index) => formatOpinionEntry(profile, entry, index)).join('\\n\\n')",
  "discoveries.map((entry, index) => formatOpinionEntry(profile, entry, index, source)).join('\\n\\n')"
);

// 5) Add documentation.
const doc = `# Sprint 5 — Genome-First Response Fix

This patch updates \`joeAIPersonalityEngine.js\` using the actual current file structure.

## New response priority

1. Genome Card intro
2. Knowledge intro
3. Legacy personality preset
4. Anime DNA fallback

## Fixed issue

JoeAI was saying:

> I do not have a handcrafted opinion profile for Ghost in the Shell yet...

even when Ghost in the Shell had a Genome Card.

## Test prompts

- recommend something like Ghost in the Shell
- I want something like 86
- I want something like Dorohedoro
- recommend something like Initial D
`;

fs.writeFileSync(file, text, 'utf8');
fs.writeFileSync(path.join(root, 'src', 'ai', 'SPRINT_5_GENOME_FIRST_RESPONSE_FIX.md'), doc, 'utf8');

console.log('Genome-first response fix applied.');
console.log('Run npm run dev and test: recommend something like Ghost in the Shell');
