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
const pageFile = path.join(root, 'src', 'pages', 'PlaceholderPages.jsx');
const parserFile = path.join(root, 'src', 'ai', 'intentParser.js');

if (!fs.existsSync(pageFile)) {
  console.error('Missing src/pages/PlaceholderPages.jsx');
  process.exit(1);
}

let page = fs.readFileSync(pageFile, 'utf8');

// Replace older direct import usage with unified router import.
if (!page.includes("routeJoeAIRecommendation")) {
  page = page.replace(
    "import { executeJoeAICommand } from '../ai/commandExecutor';",
    "import { executeJoeAICommand } from '../ai/commandExecutor'; import { routeJoeAIRecommendation } from '../ai/joeAIRecommendationRouter';"
  );
}

// The older import can remain harmlessly, but we prefer not to call it directly.
page = page.replace(
  "const smartAnswer = maybeKnowledgeFirstRecommendation(q, anime, catalog);",
  "const smartAnswer = routeJoeAIRecommendation(q, anime, catalog);"
);

// Also give normal questions a chance to route through the unified recommendation router.
// This fixes similarity prompts parsed as question by the similarity guard.
const oldFallback = `    const answer = brain.answer(q);
    setLog((current) => [...current, { who: 'bot', type: 'text', text: answer }]);
  }`;

const newFallback = `    const smartAnswer = routeJoeAIRecommendation(q, anime, catalog);
    if (smartAnswer) {
      setLog((current) => [...current, { who: 'bot', type: 'text', text: smartAnswer }]);
      return;
    }

    const answer = brain.answer(q);
    setLog((current) => [...current, { who: 'bot', type: 'text', text: answer }]);
  }`;

if (!page.includes("const smartAnswer = routeJoeAIRecommendation(q, anime, catalog);\n    if (smartAnswer)") && page.includes(oldFallback)) {
  page = page.replace(oldFallback, newFallback);
}

fs.writeFileSync(pageFile, page, 'utf8');

// Expand parser mood words for horror + aliases.
if (fs.existsSync(parserFile)) {
  let parser = fs.readFileSync(parserFile, 'utf8');

  if (parser.includes("const moodRecommendationWords = [") && !parser.includes("'horror'")) {
    parser = parser.replace(
      "'rivalry'\n  ];",
      "'rivalry',\n    'horror',\n    'scary',\n    'creepy',\n    'romcom',\n    'rom/com',\n    'rom com',\n    'rom-com',\n    'slice of life',\n    'sol',\n    'mecha'\n  ];"
    );
  }

  fs.writeFileSync(parserFile, parser, 'utf8');
}

const doc = `# Sprint 8 — Unified JoeAI Recommendation Router

Adds:

- src/ai/joeAIRecommendationRouter.js

The router tries, in order:

1. Existing Knowledge/Genome/Intent pipeline
2. Genome-only "something like X" source lookup
3. Direct Intent Engine
4. Direct Genome title mention

## Fixes

- recommend Space Dandy
- recommend something like Higurashi
- I want horror
- I want spicy but wholesome
- funny cyberpunk

## Why

JoeAI had several competing paths:
- generic Anime DNA cards
- Knowledge-first recommendations
- Intent Engine
- Trait Mixer
- Genome title cards

This creates one unified routing layer before falling back to old Anime DNA cards.
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'SPRINT_8_UNIFIED_RECOMMENDATION_ROUTER.md'), doc, 'utf8');

console.log('Unified JoeAI recommendation router installed.');
console.log('Test: recommend Space Dandy');
