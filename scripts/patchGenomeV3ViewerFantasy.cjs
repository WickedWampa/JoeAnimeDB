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
const generatorFile = path.join(root, 'scripts', 'generateGenomeCardForTitle.cjs');

if (!fs.existsSync(generatorFile)) {
  console.error('Missing scripts/generateGenomeCardForTitle.cjs');
  process.exit(1);
}

let text = fs.readFileSync(generatorFile, 'utf8');

// Add richer Viewer Fantasy fields to inferRichProfile default object.
text = text.replace(
`    joeNote: ''
  };`,
`    joeNote: '',
    fantasyPillars: [],
    emotionalJourney: [],
    rewardLoop: [],
    dopamineSources: [],
    viewerType: [],
    pacing: 'medium',
    complexity: 5
  };`
);

// Occult mystery / progression fantasy.
text = text.replace(
`        profile.joeNote = 'Generated read: this should be treated as mystery/fantasy first, not generic isekai.';`,
`        profile.joeNote = 'Generated read: this should be treated as mystery/fantasy first, not generic isekai.';
        profile.fantasyPillars.push('forbidden knowledge', 'secret societies', 'power progression', 'occult investigation', 'cosmic mystery');
        profile.emotionalJourney.push('curiosity', 'paranoia', 'wonder', 'earned confidence');
        profile.rewardLoop.push('discover clue', 'understand the world', 'gain power', 'survive deeper danger');
        profile.dopamineSources.push('lore reveals', 'clever foreshadowing', 'power-system discovery', 'hidden-organization drama');
        profile.viewerType.push('lore hunter', 'mystery solver', 'worldbuilding addict', 'slow-burn payoff fan');
        profile.pacing = 'slow burn';
        profile.complexity = 9;`
);

// Space comedy.
text = text.replace(
`        profile.joeNote = 'Generated read: this is probably a vibe/showcase pick more than a plot-first recommendation.';`,
`        profile.joeNote = 'Generated read: this is probably a vibe/showcase pick more than a plot-first recommendation.';
        profile.fantasyPillars.push('cosmic freedom', 'episodic reinvention', 'absurd adventure', 'style-first sci-fi');
        profile.emotionalJourney.push('amusement', 'surprise', 'cool detachment', 'occasional melancholy');
        profile.rewardLoop.push('new planet', 'weird problem', 'visual flex', 'comic reset');
        profile.dopamineSources.push('wild episode concepts', 'visual style', 'music', 'absurd punchlines');
        profile.viewerType.push('vibe watcher', 'animation fan', 'absurd comedy fan', 'episodic adventure fan');
        profile.pacing = 'episodic';
        profile.complexity = 6;`
);

// Dark action fantasy.
text = text.replace(
`        profile.joeNote = 'Generated read: treat this as heavier action fantasy, not casual adventure.';`,
`        profile.joeNote = 'Generated read: treat this as heavier action fantasy, not casual adventure.';
        profile.fantasyPillars.push('survival pressure', 'violent power growth', 'supernatural danger', 'revenge or justice');
        profile.emotionalJourney.push('fear', 'rage', 'determination', 'catharsis');
        profile.rewardLoop.push('threat appears', 'power is tested', 'cost is paid', 'survival feels earned');
        profile.dopamineSources.push('high-stakes fights', 'power escalation', 'dark reveals', 'enemy takedowns');
        profile.viewerType.push('dark fantasy fan', 'action fan', 'revenge arc fan', 'battle-system fan');
        profile.pacing = 'high pressure';
        profile.complexity = 7;`
);

// Healing SOL.
text = text.replace(
`        profile.joeNote = 'Generated read: this is probably best recommended as a mood reset.';`,
`        profile.joeNote = 'Generated read: this is probably best recommended as a mood reset.';
        profile.fantasyPillars.push('emotional safety', 'ordinary joy', 'gentle friendship', 'quiet healing');
        profile.emotionalJourney.push('stress relief', 'warmth', 'belonging', 'peace');
        profile.rewardLoop.push('small problem', 'human connection', 'gentle resolution', 'emotional reset');
        profile.dopamineSources.push('comfort scenes', 'cozy routines', 'soft character moments', 'low-stress humor');
        profile.viewerType.push('comfort watcher', 'slice-of-life fan', 'healing anime fan');
        profile.pacing = 'slow and gentle';
        profile.complexity = 3;`
);

// Romcom.
text = text.replace(
`        profile.joeNote = 'Generated read: this belongs in the rom-com lane before anything else.';`,
`        profile.joeNote = 'Generated read: this belongs in the rom-com lane before anything else.';
        profile.fantasyPillars.push('romantic tension', 'chemistry escalation', 'awkward honesty', 'earned affection');
        profile.emotionalJourney.push('amusement', 'secondhand embarrassment', 'anticipation', 'warm payoff');
        profile.rewardLoop.push('banter', 'misread feelings', 'small progress', 'bigger emotional reveal');
        profile.dopamineSources.push('flirty scenes', 'relationship progress', 'comic misunderstandings', 'chemistry moments');
        profile.viewerType.push('rom-com fan', 'chemistry watcher', 'slow-burn romance fan');
        profile.pacing = 'medium';
        profile.complexity = 5;`
);

// Fallback.
text = text.replace(
`    profile.joeNote = 'Generated metadata-only draft. Needs a human pass.';`,
`    profile.joeNote = 'Generated metadata-only draft. Needs a human pass.';
    profile.fantasyPillars.push(...[...new Set([...genres, ...themes])].slice(0, 5));
    profile.emotionalJourney.push('unknown');
    profile.rewardLoop.push('watch and review');
    profile.dopamineSources.push(...[...new Set([...genres, ...themes])].slice(0, 4));
    profile.viewerType.push('genre explorer');
    profile.pacing = 'unknown';
    profile.complexity = 5;`
);

// Add fields to returned card after coreFantasy.
text = text.replace(
`    coreFantasy: ai.coreFantasy || rich.coreFantasy,

    viewerMotivations:`,
`    coreFantasy: ai.coreFantasy || rich.coreFantasy,
    fantasyPillars: normalizeList(ai.fantasyPillars).length ? normalizeList(ai.fantasyPillars) : rich.fantasyPillars,
    emotionalJourney: normalizeList(ai.emotionalJourney).length ? normalizeList(ai.emotionalJourney) : rich.emotionalJourney,
    rewardLoop: normalizeList(ai.rewardLoop).length ? normalizeList(ai.rewardLoop) : rich.rewardLoop,
    dopamineSources: normalizeList(ai.dopamineSources).length ? normalizeList(ai.dopamineSources) : rich.dopamineSources,
    viewerType: normalizeList(ai.viewerType).length ? normalizeList(ai.viewerType) : rich.viewerType,
    pacing: ai.pacing || rich.pacing,
    complexity: Number(ai.complexity || rich.complexity || 5),

    viewerMotivations:`
);

fs.writeFileSync(generatorFile, text, 'utf8');

// Patch router display to show core fantasy and viewer fantasy if available.
const routerFile = path.join(root, 'src', 'ai', 'joeAIRecommendationRouter.js');
if (fs.existsSync(routerFile)) {
  let router = fs.readFileSync(routerFile, 'utf8');

  if (!router.includes('Viewer Fantasy:')) {
    router = router.replace(
`  if (card.viewerMotivations?.length) {
    lines.push('', 'Why someone would pick it:');
    lines.push(card.viewerMotivations.slice(0, 6).map((item) => \`• \${item}\`).join('\\n'));
  }`,
`  if (card.coreFantasy) {
    lines.push('', 'Core Fantasy:');
    lines.push(card.coreFantasy);
  }

  if (card.fantasyPillars?.length || card.rewardLoop?.length || card.viewerType?.length) {
    lines.push('', 'Viewer Fantasy:');
    if (card.fantasyPillars?.length) lines.push('• Pillars: ' + card.fantasyPillars.slice(0, 5).join(', '));
    if (card.rewardLoop?.length) lines.push('• Reward loop: ' + card.rewardLoop.slice(0, 5).join(' → '));
    if (card.viewerType?.length) lines.push('• Best for: ' + card.viewerType.slice(0, 5).join(', '));
  }

  if (card.viewerMotivations?.length) {
    lines.push('', 'Why someone would pick it:');
    lines.push(card.viewerMotivations.slice(0, 6).map((item) => \`• \${item}\`).join('\\n'));
  }`
    );
  }

  fs.writeFileSync(routerFile, router, 'utf8');
}

const doc = `# Genome v3 — Viewer Fantasy Profile

Adds richer experience-based fields to generated Genome Cards.

## New optional fields

\`\`\`js
coreFantasy
fantasyPillars
emotionalJourney
rewardLoop
dopamineSources
viewerType
pacing
complexity
\`\`\`

## Why

Genres describe what a show is.

Viewer Fantasy describes what the viewer is chasing.

Example:

\`\`\`text
"I want to uncover forbidden secrets"
\`\`\`

should match shows with:

- forbidden knowledge
- secret societies
- occult investigation
- mystery progression

not just the genre "Mystery".

## Test

\`\`\`cmd
node scripts\\generateGenomeCardForTitle.cjs "Lord of Mysteries"
node scripts\\rebuildGenomeRegistry.cjs
npm run dev
\`\`\`

Then ask:

\`\`\`text
recommend Lord of Mysteries
\`\`\`
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'GENOME_V3_VIEWER_FANTASY.md'), doc, 'utf8');

console.log('Genome v3 Viewer Fantasy fields added.');
console.log('Regenerate a card to see the new fields.');
