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

const helper = `
function containsAny(text, words = []) {
  return words.some((word) => text.includes(String(word).toLowerCase()));
}

function metadataText(metadata = {}) {
  return [
    metadata.title,
    metadata.titleEnglish,
    metadata.synopsis,
    metadata.background,
    ...(metadata.genres || []),
    ...(metadata.themes || []),
    ...(metadata.demographics || []),
    ...(metadata.studios || [])
  ].filter(Boolean).join(' ').toLowerCase();
}

function inferRichProfile(metadata = {}) {
  const text = metadataText(metadata);
  const genres = normalizeList(metadata.genres);
  const themes = normalizeList(metadata.themes);
  const title = metadata.titleEnglish || metadata.title || 'This anime';

  const profile = {
    domain: inferDomain(metadata),
    subdomain: '',
    signature: '',
    coreFantasy: '',
    viewerMotivations: [],
    themes: [...new Set([...themes, ...genres])].slice(0, 10),
    emotionalProfile: [],
    atmosphere: [],
    whyFansLove: [],
    whoShouldWatch: '',
    whoShouldAvoid: '',
    joeNote: ''
  };

  const rules = [
    {
      when: containsAny(text, ['mystery', 'suspense', 'secret', 'conspiracy', 'detective']) &&
        containsAny(text, ['fantasy', 'supernatural', 'occult', 'ritual', 'god', 'isekai', 'reincarnation']),
      apply() {
        profile.domain = 'occult mystery / progression fantasy';
        profile.subdomain = 'secret societies, supernatural rules, and layered worldbuilding';
        profile.signature = title + ' looks like a mystery-first fantasy where secrets, power systems, and hidden organizations matter more than simple action.';
        profile.coreFantasy = 'Uncovering a dangerous hidden world piece by piece while growing powerful enough to survive it.';
        profile.viewerMotivations.push('dense worldbuilding', 'mystery progression', 'secret organizations', 'power-system discovery', 'slow-burn reveals');
        profile.emotionalProfile.push('curious', 'tense', 'intelligent', 'ominous');
        profile.atmosphere.push('mysterious', 'dark', 'gothic', 'investigative');
        profile.whyFansLove.push('the world feels bigger than the main character', 'the mysteries reward paying attention', 'the power system gives progression real structure');
        profile.whoShouldWatch = 'Viewers who like fantasy with investigation, lore, conspiracies, and slow-burn payoff.';
        profile.whoShouldAvoid = 'Skip it if you want simple action, fast pacing, or a low-effort comfort watch.';
        profile.joeNote = 'Generated read: this should be treated as mystery/fantasy first, not generic isekai.';
      }
    },
    {
      when: containsAny(text, ['space', 'sci-fi', 'sci fi']) && containsAny(text, ['comedy', 'gag', 'parody']),
      apply() {
        profile.domain = 'absurd sci-fi comedy';
        profile.subdomain = 'episodic space adventure with style-first comedy';
        profile.signature = title + ' looks like a stylish space comedy built around weird adventures, big personality, and loose sci-fi imagination.';
        profile.coreFantasy = 'Drifting through a colorful universe where every episode can become a different kind of ridiculous.';
        profile.viewerMotivations.push('absurd sci-fi', 'episodic comedy', 'style', 'weird adventures', 'space vibes');
        profile.emotionalProfile.push('playful', 'chaotic', 'cool', 'surprisingly wistful');
        profile.atmosphere.push('funky', 'colorful', 'cosmic', 'loose');
        profile.whyFansLove.push('it treats sci-fi as a playground', 'the style is part of the appeal', 'it can be stupid and brilliant in the same episode');
        profile.whoShouldWatch = 'Viewers who want funny sci-fi that is more about vibe and imagination than strict plot.';
        profile.whoShouldAvoid = 'Skip it if you need tight continuity or serious hard sci-fi.';
        profile.joeNote = 'Generated read: this is probably a vibe/showcase pick more than a plot-first recommendation.';
      }
    },
    {
      when: containsAny(text, ['action', 'battle', 'fight']) &&
        containsAny(text, ['fantasy', 'supernatural', 'demon', 'monster']) &&
        containsAny(text, ['dark', 'gore', 'revenge', 'curse', 'death']),
      apply() {
        profile.domain = 'dark action fantasy';
        profile.subdomain = 'violent supernatural conflict and survival pressure';
        profile.signature = title + ' looks like dark fantasy where the hook is danger, power, violence, and survival.';
        profile.coreFantasy = 'Getting stronger in a hostile supernatural world where every fight has consequences.';
        profile.viewerMotivations.push('dark fantasy', 'supernatural action', 'survival stakes', 'power escalation');
        profile.emotionalProfile.push('intense', 'grim', 'violent', 'determined');
        profile.atmosphere.push('bloody', 'hostile', 'high-stakes');
        profile.whyFansLove.push('the danger feels immediate', 'the fantasy elements have teeth', 'the action has darker stakes');
        profile.whoShouldWatch = 'Viewers who want fantasy with bite, fights, and heavier stakes.';
        profile.whoShouldAvoid = 'Skip it if you want cozy fantasy or light adventure.';
        profile.joeNote = 'Generated read: treat this as heavier action fantasy, not casual adventure.';
      }
    },
    {
      when: containsAny(text, ['slice of life', 'iyashikei', 'healing', 'relaxing']) ||
        (containsAny(text, ['daily life', 'countryside', 'school']) && containsAny(text, ['friendship', 'family', 'heartwarming'])),
      apply() {
        profile.domain = 'healing slice of life';
        profile.subdomain = 'comfort, daily rhythm, and emotional reset';
        profile.signature = title + ' looks like a low-stress comfort watch built around small moments and gentle character connection.';
        profile.coreFantasy = 'Slowing down and spending time with people whose ordinary lives feel warm enough to stay in.';
        profile.viewerMotivations.push('comfort', 'daily life', 'friendship', 'gentle pacing', 'emotional reset');
        profile.emotionalProfile.push('warm', 'calm', 'soft', 'reassuring');
        profile.atmosphere.push('cozy', 'quiet', 'pleasant');
        profile.whyFansLove.push('it is easy to relax into', 'the small moments carry the show', 'it feels like a break from heavier anime');
        profile.whoShouldWatch = 'Viewers who want comfort, warmth, and a low-pressure watch.';
        profile.whoShouldAvoid = 'Skip it if you need heavy plot momentum or big stakes.';
        profile.joeNote = 'Generated read: this is probably best recommended as a mood reset.';
      }
    },
    {
      when: containsAny(text, ['romance', 'love', 'relationship']) &&
        containsAny(text, ['comedy', 'school', 'teasing', 'ecchi', 'harem']),
      apply() {
        profile.domain = 'romantic comedy';
        profile.subdomain = 'chemistry, teasing, and relationship tension';
        profile.signature = title + ' looks like a rom-com where the main appeal is chemistry, awkward tension, and watching feelings get harder to ignore.';
        profile.coreFantasy = 'Watching two people bounce off each other until the jokes start turning into real feelings.';
        profile.viewerMotivations.push('romantic tension', 'comedy', 'chemistry', 'school romance', 'character banter');
        profile.emotionalProfile.push('playful', 'flustered', 'sweet', 'light');
        profile.atmosphere.push('bright', 'awkward', 'flirty');
        profile.whyFansLove.push('the chemistry keeps the story moving', 'the comedy makes the romance easier to root for');
        profile.whoShouldWatch = 'Viewers who want romance with humor, teasing, and character chemistry.';
        profile.whoShouldAvoid = 'Skip it if you dislike school rom-com setups or slow romantic progress.';
        profile.joeNote = 'Generated read: this belongs in the rom-com lane before anything else.';
      }
    }
  ];

  const matched = rules.find((rule) => rule.when);
  if (matched) matched.apply();

  if (!profile.signature) {
    profile.signature = title + ' looks like a ' + profile.domain + ' story, but this draft needs review because metadata alone is limited.';
    profile.coreFantasy = 'A provisional read based on genres, themes, synopsis, and Jikan metadata.';
    profile.viewerMotivations.push(...[...new Set([...genres, ...themes])].slice(0, 6));
    profile.whoShouldWatch = 'Viewers interested in this show’s listed genres and themes.';
    profile.whoShouldAvoid = 'Unknown from metadata alone. Review needed.';
    profile.joeNote = 'Generated metadata-only draft. Needs a human pass.';
  }

  return profile;
}

function estimateGenerationConfidence(metadata = {}, ai = {}, profile = {}) {
  if (ai.usedAI) return 0.82;

  let confidence = 0.35;
  if (metadata.synopsis && metadata.synopsis.length > 160) confidence += 0.15;
  if ((metadata.genres || []).length) confidence += 0.08;
  if ((metadata.themes || []).length) confidence += 0.12;
  if (profile.signature && !profile.signature.includes('metadata alone is limited')) confidence += 0.15;
  if (profile.viewerMotivations?.length >= 4) confidence += 0.08;

  return Math.min(0.78, Number(confidence.toFixed(2)));
}
`;

if (!text.includes("function inferRichProfile")) {
  text = text.replace("function buildDraftCard(metadata, ai = {}) {", helper + "\nfunction buildDraftCard(metadata, ai = {}) {");
}

const start = text.indexOf("function buildDraftCard(metadata, ai = {}) {");
const end = text.indexOf("\n\nfunction loadExistingCards", start);

if (start === -1 || end === -1) {
  console.error("Could not find buildDraftCard block boundaries.");
  process.exit(1);
}

const newBuild = `function buildDraftCard(metadata, ai = {}) {
  const title = metadata.titleEnglish || metadata.title || ai.title || 'Unknown Anime';
  const genres = normalizeList(metadata.genres);
  const themes = normalizeList(metadata.themes);
  const demographics = normalizeList(metadata.demographics);
  const rich = inferRichProfile({ ...metadata, genres, themes, demographics });
  const confidence = estimateGenerationConfidence(metadata, ai, rich);

  return {
    id: ai.id || slugify(title),
    titles: [...new Set([metadata.title, metadata.titleEnglish, metadata.titleJapanese, ...(metadata.titleSynonyms || [])].filter(Boolean))],
    malId: metadata.malId,
    quality: 'generated',
    generationQuality: ai.usedAI ? 'ai-assisted' : confidence >= 0.68 ? 'strong-heuristic' : confidence >= 0.52 ? 'medium-heuristic' : 'low-heuristic',
    confidence,
    generated: true,
    needsReview: true,
    generatedAt: new Date().toISOString(),
    source: { metadata: 'jikan', generator: ai.usedAI ? 'ai-assisted' : 'heuristic-v2', model: ai.model || null },

    domain: ai.domain || rich.domain,
    subdomain: ai.subdomain || ai.subDomain || rich.subdomain,
    signature: ai.signature || rich.signature,
    coreFantasy: ai.coreFantasy || rich.coreFantasy,

    viewerMotivations: normalizeList(ai.viewerMotivations).length ? normalizeList(ai.viewerMotivations) : rich.viewerMotivations,
    themes: normalizeList(ai.themes).length ? normalizeList(ai.themes) : rich.themes,
    emotionalProfile: normalizeList(ai.emotionalProfile).length ? normalizeList(ai.emotionalProfile) : rich.emotionalProfile,
    atmosphere: normalizeList(ai.atmosphere).length ? normalizeList(ai.atmosphere) : rich.atmosphere,

    vibes: { ...inferVibes({ ...metadata, genres, themes, demographics }), ...(ai.vibes || {}) },

    accessibility: ai.accessibility || \`Generated draft. Confidence \${Math.round(confidence * 100)}%. Needs review.\`,
    idealFollowUps: normalizeList(ai.idealFollowUps).slice(0, 8),
    antiRecommendations: normalizeList(ai.antiRecommendations).slice(0, 8),
    recommendationWeight: Number(ai.recommendationWeight || Math.max(0.45, Math.min(0.75, confidence))),
    rewatchValue: ai.rewatchValue || (confidence >= 0.65 ? 'Promising, but still needs human review.' : 'Unknown. Generated draft.'),
    whyFansLove: normalizeList(ai.whyFansLove).length ? normalizeList(ai.whyFansLove).slice(0, 6) : rich.whyFansLove,
    whoShouldWatch: ai.whoShouldWatch || rich.whoShouldWatch,
    whoShouldAvoid: ai.whoShouldAvoid || rich.whoShouldAvoid,
    joeNote: ai.joeNote || rich.joeNote
  };
}`;

text = text.slice(0, start) + newBuild + text.slice(end);

fs.writeFileSync(generatorFile, text, 'utf8');

const doc = `# Improve Generated Genome Quality

This upgrades the heuristic generator from simple genre metadata to richer pattern inference.

## Adds

- Rich profile inference from synopsis + genres + themes
- Stronger signatures
- Core Fantasy drafts
- Viewer motivations
- Atmosphere and emotional profile
- Why fans love it
- Who should watch / avoid
- Confidence score
- generationQuality

## Test

\`\`\`cmd
node scripts\\generateGenomeCardForTitle.cjs "Lord of Mysteries"
node scripts\\rebuildGenomeRegistry.cjs
npm run dev
\`\`\`
`;

fs.writeFileSync(path.join(root, 'src', 'ai', 'IMPROVE_GENERATED_GENOME_QUALITY.md'), doc, 'utf8');

console.log('Generated Genome heuristic quality upgraded.');
console.log('Test: node scripts\\\\generateGenomeCardForTitle.cjs "Lord of Mysteries"');
