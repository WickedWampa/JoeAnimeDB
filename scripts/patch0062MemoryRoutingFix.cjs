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

function insertBefore(needle, insertion, label) {
  if (!text.includes(needle)) {
    console.error(`Patch 0062 could not find marker: ${label}`);
    process.exit(1);
  }
  text = text.replace(needle, insertion + needle);
  changed = true;
}

function replaceOnce(needle, replacement, label) {
  if (!text.includes(needle)) {
    console.error(`Patch 0062 could not find marker: ${label}`);
    process.exit(1);
  }
  text = text.replace(needle, replacement);
  changed = true;
}

// Ensure memory import exists.
const memoryImport = "import { buildJoeAIMemory, summarizeJoeAIMemory } from '../ai/memory';\n";
if (!text.includes(memoryImport)) {
  replaceOnce(
    "import React, { useMemo, useState } from 'react';\n",
    "import React, { useMemo, useState } from 'react';\n" + memoryImport,
    'React import'
  );
}

// Ensure helpers exist. Patch 0061 may already have added these.
if (!text.includes('function isMemoryQuestion')) {
  insertBefore(
    '  function isRecommendationQuestion(value) {',
    `  function isMemoryQuestion(value = '') {\n    const lower = String(value || '').toLowerCase();\n\n    return [\n      'what do you know about me',\n      'analyze my taste',\n      'taste profile',\n      'joeai memory',\n      'anime taste'\n    ].some((phrase) => lower.includes(phrase));\n  }\n\n  function answerJoeAIMemoryQuestion() {\n    const memory = buildJoeAIMemory(anime, { persist: true });\n    return summarizeJoeAIMemory(memory.profile);\n  }\n\n`,
    'isRecommendationQuestion helper marker'
  );
}

// Ensure DevTools helper exists.
if (!text.includes('window.JoeAI.memory =')) {
  const brainLine = "  const brain = useMemo(() => createAnimeBrain(anime, catalog), [anime, catalog]);";
  const devtoolsBlock = `  const brain = useMemo(() => createAnimeBrain(anime, catalog), [anime, catalog]);\n\n  if (typeof window !== 'undefined') {\n    window.JoeAI = window.JoeAI || {};\n    window.JoeAI.memory = {\n      buildProfile: () => buildJoeAIMemory(anime).profile,\n      summarize: () => summarizeJoeAIMemory(buildJoeAIMemory(anime).profile)\n    };\n  }`;
  replaceOnce(brainLine, devtoolsBlock, 'Assistant brain line');
}

// This is the actual routing fix: catch memory questions before parseJoeAIIntent.
if (!text.includes('isMemoryQuestion(q)')) {
  insertBefore(
    '    const intent = parseJoeAIIntent(q);',
    `    if (isMemoryQuestion(q)) {\n      appendBotResult({\n        type: 'text',\n        text: answerJoeAIMemoryQuestion()\n      });\n      return;\n    }\n\n`,
    'parseJoeAIIntent marker'
  );
}

fs.writeFileSync(file, text, 'utf8');
console.log(changed ? 'PATCH_0062 applied: memory questions now route before old Genome lookup.' : 'PATCH_0062 already applied.');
