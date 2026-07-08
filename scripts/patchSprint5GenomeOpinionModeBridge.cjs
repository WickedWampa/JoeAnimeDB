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

function findFunctionStart(text, names) {
  for (const name of names) {
    const patterns = [
      `export function ${name}`,
      `function ${name}`,
      `const ${name} =`,
      `export const ${name} =`
    ];
    for (const pattern of patterns) {
      const idx = text.indexOf(pattern);
      if (idx !== -1) return { idx, name, pattern };
    }
  }
  return null;
}

function findFunctionBodyOpen(text, startIdx) {
  const arrow = text.indexOf('=>', startIdx);
  const brace = text.indexOf('{', startIdx);
  if (brace === -1) return -1;
  if (arrow !== -1 && arrow < brace) return brace;
  return brace;
}

const root = findRoot(process.cwd());
const file = path.join(root, 'src', 'ai', 'joeAIPersonalityEngine.js');

if (!fs.existsSync(file)) {
  console.error('Could not find src/ai/joeAIPersonalityEngine.js');
  process.exit(1);
}

let text = fs.readFileSync(file, 'utf8');

if (!text.includes("findGenomeCardFromRegistry")) {
  text = text.replace(
    /^(import .+?;\s*)/m,
    `$1\nimport { findGenomeCardFromRegistry } from './genome/genomeRegistry';\n`
  );
}

if (!text.includes("SPRINT5_GENOME_OPINION_BRIDGE")) {
  const helper = `
/* SPRINT5_GENOME_OPINION_BRIDGE */
function buildGenomeOpinionIntro(sourceTitle) {
  const card = findGenomeCardFromRegistry(sourceTitle);
  if (!card) return null;

  const title = card.titles?.[0] || sourceTitle;
  const lines = [
    \`🧬 JoeAI Genome Mode: \${title}\`,
    '',
    card.signature || card.note || \`\${title} has a Genome profile.\`
  ];

  const chasing = card.viewerMotivations || card.chasing || [];
  if (chasing.length) {
    lines.push('', 'What you are probably chasing:');
    lines.push(chasing.slice(0, 6).map((x) => \`• \${x}\`).join('\\n'));
  }

  const why = card.whyFansLove || [];
  if (why.length) {
    lines.push('', 'Why fans love it:');
    lines.push(why.slice(0, 4).map((x) => \`• \${x}\`).join('\\n'));
  }

  return lines.join('\\n');
}

function replaceLegacyNoProfileIntro(text, sourceTitle) {
  if (!text || !String(text).includes('I do not have a handcrafted opinion profile for')) return text;

  const genomeIntro = buildGenomeOpinionIntro(sourceTitle);
  if (!genomeIntro) return text;

  return String(text).replace(
    /🎭 JoeAI Opinion Mode:[^\\n]*\\n\\s*I do not have a handcrafted opinion profile for[^\\n]*\\n\\s*so I(?:’|'|’)m using Anime DNA plus your library patterns\\.?/i,
    genomeIntro
  ).replace(
    /I do not have a handcrafted opinion profile for[^\\n]*\\n\\s*so I(?:’|'|’)m using Anime DNA plus your library patterns\\.?/i,
    genomeIntro
  );
}
`;
  text = helper + '\n\n' + text;
}

// Strategy 1: patch buildPersonalityRecommendationText return path if present.
const fn = findFunctionStart(text, ['buildPersonalityRecommendationText', 'formatPersonalityRecommendationText', 'answerPersonalityRecommendation']);
if (fn) {
  const open = findFunctionBodyOpen(text, fn.idx);
  if (open !== -1 && !text.slice(open, open + 600).includes('SPRINT5_GENOME_RETURN_PATCH')) {
    const injection = `
  // SPRINT5_GENOME_RETURN_PATCH
  const __sprint5SourceTitle =
    source?.title || source?.officialTitle || sourceTitle || matchedTitle || title || queryTitle || '';
`;
    text = text.slice(0, open + 1) + injection + text.slice(open + 1);
  }

  // Wrap final "return lines.join" style returns in this function only.
  const nextExport = text.indexOf('\nexport ', fn.idx + 20);
  const endRegion = nextExport === -1 ? text.length : nextExport;
  let region = text.slice(fn.idx, endRegion);
  if (!region.includes('replaceLegacyNoProfileIntro(')) {
    region = region.replace(/return\s+([^;\n]+\.join\(['"`]\\n['"`]\));/g, "return replaceLegacyNoProfileIntro($1, __sprint5SourceTitle);");
    region = region.replace(/return\s+(text|answer|response|result);/g, "return replaceLegacyNoProfileIntro($1, __sprint5SourceTitle);");
    text = text.slice(0, fn.idx) + region + text.slice(endRegion);
  }
}

// Strategy 2: direct string fallback patch if Strategy 1 missed.
if (!text.includes('SPRINT5_GENOME_DIRECT_FALLBACK_PATCH')) {
  const legacyPattern = /([`'"])I do not have a handcrafted opinion profile for \$\{([^}]+)\} yet, so I(?:’|'|’)m using Anime DNA plus your library patterns\.?\1/;
  const match = text.match(legacyPattern);
  if (match) {
    text = text.replace(
      legacyPattern,
      `(buildGenomeOpinionIntro(${match[2]}) || ${match[1]}I do not have a handcrafted opinion profile for \${${match[2]}} yet, so I’m using Anime DNA plus your library patterns.${match[1]}) /* SPRINT5_GENOME_DIRECT_FALLBACK_PATCH */`
    );
  }
}

fs.writeFileSync(file, text);

const docFile = path.join(root, 'src', 'ai', 'SPRINT_5_GENOME_OPINION_BRIDGE.md');
fs.writeFileSync(docFile, `# Sprint 5 — Genome Opinion Mode Bridge

JoeAI previously had two separate systems:

1. Legacy handcrafted Opinion Profiles
2. Anime Genome Cards

This caused messages like:

> I do not have a handcrafted opinion profile for Ghost in the Shell yet...

even when a Genome Card existed.

This bridge teaches JoeAI to use Genome Cards as opinion context before falling back to legacy Anime DNA wording.

## Expected behavior

For titles with Genome Cards, JoeAI should say something closer to:

> JoeAI Genome Mode: Ghost in the Shell

instead of:

> I do not have a handcrafted opinion profile...

## Test prompts

- recommend something like Ghost in the Shell
- I want something like 86
- recommend philosophical sci-fi
- I want something like Dorohedoro

`, 'utf8');

console.log('Sprint 5 Genome Opinion Mode Bridge applied.');
console.log('Test: recommend something like Ghost in the Shell');
