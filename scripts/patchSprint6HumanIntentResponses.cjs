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
const file = path.join(root, 'src', 'ai', 'joeAIIntentEngine.js');

if (!fs.existsSync(file)) {
  console.error('Missing src/ai/joeAIIntentEngine.js');
  process.exit(1);
}

let text = fs.readFileSync(file, 'utf8');

if (!text.includes("function intentOpening")) {
  const helper = `
function intentOpening(intent, scored = []) {
  const top = scored[0]?.card;
  const topTitle = top?.titles?.[0] || top?.id || 'the top pick';

  const openings = {
    funny: [
      'You asked for something funny, so I am ignoring generic action/fantasy matches and looking for actual comedy DNA.',
      \`If you want the safest first pick, I would start with \${topTitle}.\`
    ],
    comforting: [
      'You asked for something comforting, so I am looking for warmth, healing, friendship, and low-stress vibes.',
      \`\${topTitle} looks like the strongest comfort pick from the Genome.\`
    ],
    mind_games: [
      'You asked for mind games, so I am looking for pressure, manipulation, strategy, and psychological tension.',
      \`\${topTitle} is the strongest brain-game match.\`
    ],
    make_me_cry: [
      'You asked for emotional damage, so I am looking for grief, healing, loss, and stories that leave a mark.',
      \`\${topTitle} is where I would start if you want the feelings to hit.\`
    ],
    cyberpunk: [
      'You asked for cyberpunk or philosophical sci-fi, so I am looking for identity, AI, surveillance, and future-dread.',
      \`\${topTitle} is the strongest match for that sci-fi itch.\`
    ],
    sports_mastery: [
      'You asked for competition or mastery, so I am looking for discipline, rivalry, obsession, and earned improvement.',
      \`\${topTitle} is the strongest mastery-focused pick.\`
    ],
    dark: [
      'You asked for something dark, so I am looking for heavier worlds, moral pressure, violence, and uncomfortable stakes.',
      \`\${topTitle} is the strongest dark-vibe match.\`
    ]
  };

  return openings[intent.id] || [
    \`You asked for \${intent.label.toLowerCase()}, so I matched your request against the Anime Genome.\`,
    \`\${topTitle} looks like the strongest match.\`
  ];
}

`;
  text = text.replace("function formatCard(card, index, scored) {", helper + "function formatCard(card, index, scored) {");
}

text = text.replace(
  "  return [\n    `${index + 1}. ${title} — ${percent}% intent match`,\n    `   • ${why}`,\n    scored.reasons?.length ? `   • Matched on: ${scored.reasons.slice(0, 5).join(', ')}.` : ''\n  ].filter(Boolean).join('\\n');",
  "  const label = index === 0 ? 'Start here' : index === 1 ? 'Strong backup pick' : index === 2 ? 'Also very strong' : 'Worth considering';\n\n  return [\n    `${index + 1}. ${title} — ${percent}% intent match`,\n    `   • ${label}: ${why}`,\n    scored.reasons?.length ? `   • Why it matched: ${scored.reasons.slice(0, 5).join(', ')}.` : ''\n  ].filter(Boolean).join('\\n');"
);

const oldReturn = "  return [\n    `🧠 JoeAI Intent Mode: ${intent.label}`,\n    '',\n    `I heard the vibe, not just a title. Matching your request against the Anime Genome.`,\n    '',\n    scored.map((entry, index) => formatCard(entry.card, index, entry)).join('\\n\\n')\n  ].join('\\n');";

const newReturn = "  const opening = intentOpening(intent, scored);\n\n  return [\n    `🧠 JoeAI Intent Mode: ${intent.label}`,\n    '',\n    opening.join('\\n'),\n    '',\n    scored.map((entry, index) => formatCard(entry.card, index, entry)).join('\\n\\n')\n  ].join('\\n');";

if (text.includes(oldReturn)) {
  text = text.replace(oldReturn, newReturn);
} else if (!text.includes("const opening = intentOpening(intent, scored);")) {
  console.error('Could not find Intent Engine return block. No changes made.');
  process.exit(1);
}

fs.writeFileSync(file, text, 'utf8');

const doc = `# Sprint 6.1 — Human Intent Responses

This polish pass makes JoeAI Intent Mode sound more like an anime fan and less like a raw search result.

## Improved

- Adds conversational intent openings
- Adds "Start here" / "Strong backup pick" labels
- Changes "Matched on" to "Why it matched"
- Keeps the same Genome scoring behavior

## Test prompts

- recommend something funny
- I want something comforting
- I want mind games
- recommend cyberpunk
- I want something dark
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'SPRINT_6_HUMAN_INTENT_RESPONSES.md'), doc, 'utf8');

console.log('Sprint 6.1 human Intent responses applied.');
console.log('Test: recommend something funny');
