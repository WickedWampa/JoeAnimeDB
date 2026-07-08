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
const personalityFile = path.join(root, 'src', 'ai', 'joeAIPersonalityEngine.js');

let text = fs.readFileSync(personalityFile, 'utf8');

if (!text.includes("animeKnowledgeBase")) {
  text = text.replace(
    "const PROFILE_PRESETS = {",
    "import { buildKnowledgeIntro, buildKnowledgeWarnings, knowledgeOpinionFor } from './animeKnowledgeBase';\n\nconst PROFILE_PRESETS = {"
  );
}

if (!text.includes("knowledgeOpinionFor(source, item)")) {
  text = text.replace(
`  const exact = sourceProfile?.strongestMatches?.[key];

  if (exact) return exact;`,
`  const knowledgeOpinion = knowledgeOpinionFor(source, candidate);
  if (knowledgeOpinion) return knowledgeOpinion;

  const exact = sourceProfile?.strongestMatches?.[key];

  if (exact) return exact;`
  );
}

if (!text.includes("const knowledgeIntro = buildKnowledgeIntro(source);")) {
  text = text.replace(
`  const intro = profile
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
      ];`,
`  const knowledgeIntro = buildKnowledgeIntro(source);

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
        ];`
  );
}

if (!text.includes("const knowledgeWarnings = buildKnowledgeWarnings(source);")) {
  text = text.replace(
`  if (profile?.dontRecommend?.length) {
    parts.push('JoeAI warning label:');
    parts.push('');
    parts.push(profile.dontRecommend.map((line) => \`• \${line}\`).join('\\n'));
  }`,
`  const knowledgeWarnings = buildKnowledgeWarnings(source);
  if (knowledgeWarnings) {
    parts.push(knowledgeWarnings);
  } else if (profile?.dontRecommend?.length) {
    parts.push('JoeAI warning label:');
    parts.push('');
    parts.push(profile.dontRecommend.map((line) => \`• \${line}\`).join('\\n'));
  }`
  );
}

fs.writeFileSync(personalityFile, text);
console.log('Sprint 4 Phase 6 wired: Anime Knowledge Engine.');
