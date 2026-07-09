const fs = require('fs');
const path = require('path');

const repo = process.cwd();
const file = path.join(repo, 'src', 'pages', 'PlaceholderPages.jsx');

if (!fs.existsSync(file)) {
  console.error('Could not find src/pages/PlaceholderPages.jsx. Run this from the repo root.');
  process.exit(1);
}

let text = fs.readFileSync(file, 'utf8');
let changed = false;

function replaceOnce(needle, replacement, label) {
  if (!text.includes(needle)) {
    console.error(`Patch 0061 could not find marker: ${label}`);
    process.exit(1);
  }
  text = text.replace(needle, replacement);
  changed = true;
}

// 1) Add memory import. Keep it as a simple separate import so we do not touch the long combined import line.
const memoryImport = "import { buildJoeAIMemory, summarizeJoeAIMemory } from '../ai/memory';\n";
if (!text.includes(memoryImport)) {
  replaceOnce(
    "import React, { useMemo, useState } from 'react';\n",
    "import React, { useMemo, useState } from 'react';\n" + memoryImport,
    'React import'
  );
}

// 2) Expose a tiny devtools helper without changing UI behavior.
const brainLine = "  const brain = useMemo(() => createAnimeBrain(anime, catalog), [anime, catalog]);";
const devtoolsBlock = `  const brain = useMemo(() => createAnimeBrain(anime, catalog), [anime, catalog]);\n\n  if (typeof window !== 'undefined') {\n    window.JoeAI = window.JoeAI || {};\n    window.JoeAI.memory = {\n      buildProfile: () => buildJoeAIMemory(anime).profile,\n      summarize: () => summarizeJoeAIMemory(buildJoeAIMemory(anime).profile)\n    };\n  }`;
if (!text.includes('window.JoeAI.memory =')) {
  replaceOnce(brainLine, devtoolsBlock, 'Assistant brain line');
}

// 3) Add memory phrase detection and answer function near the other Assistant helper functions.
const helperMarker = "  function isRecommendationQuestion(value) {";
const helperBlock = `  function isMemoryQuestion(value = '') {\n    const lower = String(value || '').toLowerCase();\n\n    return [\n      'what do you know about me',\n      'analyze my taste',\n      'taste profile',\n      'joeai memory',\n      'anime taste'\n    ].some((phrase) => lower.includes(phrase));\n  }\n\n  function answerJoeAIMemoryQuestion() {\n    const memory = buildJoeAIMemory(anime, { persist: true });\n    return summarizeJoeAIMemory(memory.profile);\n  }\n\n` + helperMarker;
if (!text.includes('function isMemoryQuestion')) {
  replaceOnce(helperMarker, helperBlock, 'isRecommendationQuestion helper marker');
}

// 4) Intercept memory questions early in ask(), before the normal intent router.
const intentMarker = "    const intent = parseJoeAIIntent(q);";
const memoryIntercept = `    if (isMemoryQuestion(q)) {\n      appendBotResult({\n        type: 'text',\n        text: answerJoeAIMemoryQuestion()\n      });\n      return;\n    }\n\n` + intentMarker;
if (!text.includes('answerJoeAIMemoryQuestion()')) {
  replaceOnce(intentMarker, memoryIntercept, 'parseJoeAIIntent marker');
}

if (changed) {
  fs.writeFileSync(file, text, 'utf8');
  console.log('PATCH_0061 applied: JoeAI Memory assistant command wired.');
} else {
  console.log('PATCH_0061 already appears to be applied.');
}
