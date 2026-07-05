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

function slugify(value = '') {
  return String(value || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function normalizeList(value = []) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((x) => x.trim()).filter(Boolean);
  return String(value).split(',').map((x) => x.trim()).filter(Boolean);
}

function inferDomain(metadata = {}) {
  const all = [...normalizeList(metadata.genres), ...normalizeList(metadata.themes)].join(' ').toLowerCase();
  if (/horror|gore|suspense/.test(all)) return 'horror / psychological';
  if (/romance/.test(all)) return 'romance / emotional growth';
  if (/comedy|gag humor|parody/.test(all)) return 'comedy / slice of life';
  if (/sports/.test(all)) return 'sports / mastery';
  if (/sci-fi|space|mecha|cyberpunk/.test(all)) return 'sci-fi / mecha';
  if (/fantasy|isekai|adventure/.test(all)) return 'fantasy / adventure';
  if (/mystery|detective/.test(all)) return 'mystery / thriller';
  return normalizeList(metadata.genres)[0] || 'general anime';
}

function inferVibes(metadata = {}) {
  const text = [metadata.synopsis, metadata.background, ...(metadata.genres || []), ...(metadata.themes || []), ...(metadata.demographics || [])].join(' ').toLowerCase();
  const rules = {
    comedy: ['comedy', 'funny', 'gag', 'parody', 'humor'],
    cozy: ['slice of life', 'healing', 'iyashikei', 'relaxing', 'camp'],
    dark: ['dark', 'gore', 'violent', 'brutal', 'death', 'revenge'],
    psychological: ['psychological', 'mind game', 'manipulation', 'paranoia', 'thriller'],
    cyberpunk: ['cyberpunk', 'robot', 'android', 'ai', 'technology', 'future'],
    romance: ['romance', 'love', 'relationship', 'couple'],
    spicy: ['ecchi', 'teasing', 'fanservice'],
    wholesome: ['heartwarming', 'family', 'friendship', 'kindness'],
    emotional: ['grief', 'loss', 'sad', 'tear', 'trauma', 'bittersweet'],
    action: ['action', 'battle', 'fight', 'combat'],
    fantasy: ['fantasy', 'magic', 'dungeon', 'kingdom', 'isekai'],
    mastery: ['sports', 'training', 'competition', 'rival', 'tournament'],
    mystery: ['mystery', 'detective', 'case', 'secret', 'conspiracy'],
    horror: ['horror', 'curse', 'vampire', 'ghost', 'dread', 'scary'],
    chaos: ['chaos', 'absurd', 'weird', 'bizarre', 'unhinged']
  };
  const vibes = {};
  for (const [key, words] of Object.entries(rules)) {
    let score = 0;
    for (const word of words) if (text.includes(word)) score += 3;
    if (score > 0) vibes[key] = Math.min(10, score);
  }
  return vibes;
}

function buildPrompt(metadata, examples = []) {
  return [
    'You are generating a JoeAnimeDB Anime Genome Card.',
    'Return ONLY strict JSON. No markdown. No comments.',
    'The card is provisional and must be honest about uncertainty.',
    'Use anime-fan recommendation language, not encyclopedia language.',
    'Required fields: domain, subdomain, signature, coreFantasy, viewerMotivations, themes, emotionalProfile, atmosphere, vibes, accessibility, idealFollowUps, antiRecommendations, recommendationWeight, rewatchValue, whyFansLove, whoShouldWatch, whoShouldAvoid, joeNote.',
    'Vibes are 0-10 numbers. Only include meaningful vibes.',
    '',
    'Metadata:',
    JSON.stringify(metadata, null, 2),
    '',
    'Style examples:',
    JSON.stringify(examples, null, 2)
  ].join('\n');
}

function stripJson(text = '') {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const first = body.indexOf('{');
  const last = body.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) return body.slice(first, last + 1);
  return body;
}

async function fetchJikanTitle(query) {
  const searchUrl = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1`;
  const search = await fetch(searchUrl).then((r) => r.json());
  const item = search?.data?.[0];
  if (!item?.mal_id) throw new Error(`No Jikan result found for: ${query}`);

  const detailUrl = `https://api.jikan.moe/v4/anime/${item.mal_id}/full`;
  const detail = await fetch(detailUrl).then((r) => r.json());
  const data = detail?.data || item;

  return {
    malId: data.mal_id,
    title: data.title,
    titleEnglish: data.title_english,
    titleJapanese: data.title_japanese,
    titleSynonyms: data.title_synonyms || [],
    synopsis: data.synopsis,
    background: data.background,
    year: data.year,
    season: data.season,
    type: data.type,
    episodes: data.episodes,
    status: data.status,
    score: data.score,
    rating: data.rating,
    source: data.source,
    studios: (data.studios || []).map((x) => x.name),
    genres: (data.genres || []).map((x) => x.name),
    themes: (data.themes || []).map((x) => x.name),
    demographics: (data.demographics || []).map((x) => x.name)
  };
}

async function generateWithOpenAI(metadata, examples) {
  if (!process.env.OPENAI_API_KEY) return null;

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const prompt = buildPrompt(metadata, examples);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You generate strict JSON Anime Genome Cards for JoeAnimeDB.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.55
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || '';
  return { ...JSON.parse(stripJson(content)), usedAI: true, model };
}


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
    joeNote: '',
    fantasyPillars: [],
    emotionalJourney: [],
    rewardLoop: [],
    dopamineSources: [],
    viewerType: [],
    pacing: 'medium',
    complexity: 5
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
        profile.fantasyPillars.push('forbidden knowledge', 'secret societies', 'power progression', 'occult investigation', 'cosmic mystery');
        profile.emotionalJourney.push('curiosity', 'paranoia', 'wonder', 'earned confidence');
        profile.rewardLoop.push('discover clue', 'understand the world', 'gain power', 'survive deeper danger');
        profile.dopamineSources.push('lore reveals', 'clever foreshadowing', 'power-system discovery', 'hidden-organization drama');
        profile.viewerType.push('lore hunter', 'mystery solver', 'worldbuilding addict', 'slow-burn payoff fan');
        profile.pacing = 'slow burn';
        profile.complexity = 9;
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
        profile.fantasyPillars.push('cosmic freedom', 'episodic reinvention', 'absurd adventure', 'style-first sci-fi');
        profile.emotionalJourney.push('amusement', 'surprise', 'cool detachment', 'occasional melancholy');
        profile.rewardLoop.push('new planet', 'weird problem', 'visual flex', 'comic reset');
        profile.dopamineSources.push('wild episode concepts', 'visual style', 'music', 'absurd punchlines');
        profile.viewerType.push('vibe watcher', 'animation fan', 'absurd comedy fan', 'episodic adventure fan');
        profile.pacing = 'episodic';
        profile.complexity = 6;
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
        profile.fantasyPillars.push('survival pressure', 'violent power growth', 'supernatural danger', 'revenge or justice');
        profile.emotionalJourney.push('fear', 'rage', 'determination', 'catharsis');
        profile.rewardLoop.push('threat appears', 'power is tested', 'cost is paid', 'survival feels earned');
        profile.dopamineSources.push('high-stakes fights', 'power escalation', 'dark reveals', 'enemy takedowns');
        profile.viewerType.push('dark fantasy fan', 'action fan', 'revenge arc fan', 'battle-system fan');
        profile.pacing = 'high pressure';
        profile.complexity = 7;
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
        profile.fantasyPillars.push('emotional safety', 'ordinary joy', 'gentle friendship', 'quiet healing');
        profile.emotionalJourney.push('stress relief', 'warmth', 'belonging', 'peace');
        profile.rewardLoop.push('small problem', 'human connection', 'gentle resolution', 'emotional reset');
        profile.dopamineSources.push('comfort scenes', 'cozy routines', 'soft character moments', 'low-stress humor');
        profile.viewerType.push('comfort watcher', 'slice-of-life fan', 'healing anime fan');
        profile.pacing = 'slow and gentle';
        profile.complexity = 3;
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
        profile.fantasyPillars.push('romantic tension', 'chemistry escalation', 'awkward honesty', 'earned affection');
        profile.emotionalJourney.push('amusement', 'secondhand embarrassment', 'anticipation', 'warm payoff');
        profile.rewardLoop.push('banter', 'misread feelings', 'small progress', 'bigger emotional reveal');
        profile.dopamineSources.push('flirty scenes', 'relationship progress', 'comic misunderstandings', 'chemistry moments');
        profile.viewerType.push('rom-com fan', 'chemistry watcher', 'slow-burn romance fan');
        profile.pacing = 'medium';
        profile.complexity = 5;
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
    profile.fantasyPillars.push(...[...new Set([...genres, ...themes])].slice(0, 5));
    profile.emotionalJourney.push('unknown');
    profile.rewardLoop.push('watch and review');
    profile.dopamineSources.push(...[...new Set([...genres, ...themes])].slice(0, 4));
    profile.viewerType.push('genre explorer');
    profile.pacing = 'unknown';
    profile.complexity = 5;
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

function buildDraftCard(metadata, ai = {}) {
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
    fantasyPillars: normalizeList(ai.fantasyPillars).length ? normalizeList(ai.fantasyPillars) : rich.fantasyPillars,
    emotionalJourney: normalizeList(ai.emotionalJourney).length ? normalizeList(ai.emotionalJourney) : rich.emotionalJourney,
    rewardLoop: normalizeList(ai.rewardLoop).length ? normalizeList(ai.rewardLoop) : rich.rewardLoop,
    dopamineSources: normalizeList(ai.dopamineSources).length ? normalizeList(ai.dopamineSources) : rich.dopamineSources,
    viewerType: normalizeList(ai.viewerType).length ? normalizeList(ai.viewerType) : rich.viewerType,
    pacing: ai.pacing || rich.pacing,
    complexity: Number(ai.complexity || rich.complexity || 5),

    viewerMotivations: normalizeList(ai.viewerMotivations).length ? normalizeList(ai.viewerMotivations) : rich.viewerMotivations,
    themes: normalizeList(ai.themes).length ? normalizeList(ai.themes) : rich.themes,
    emotionalProfile: normalizeList(ai.emotionalProfile).length ? normalizeList(ai.emotionalProfile) : rich.emotionalProfile,
    atmosphere: normalizeList(ai.atmosphere).length ? normalizeList(ai.atmosphere) : rich.atmosphere,

    vibes: { ...inferVibes({ ...metadata, genres, themes, demographics }), ...(ai.vibes || {}) },

    accessibility: ai.accessibility || `Generated draft. Confidence ${Math.round(confidence * 100)}%. Needs review.`,
    idealFollowUps: normalizeList(ai.idealFollowUps).slice(0, 8),
    antiRecommendations: normalizeList(ai.antiRecommendations).slice(0, 8),
    recommendationWeight: Number(ai.recommendationWeight || Math.max(0.45, Math.min(0.75, confidence))),
    rewatchValue: ai.rewatchValue || (confidence >= 0.65 ? 'Promising, but still needs human review.' : 'Unknown. Generated draft.'),
    whyFansLove: normalizeList(ai.whyFansLove).length ? normalizeList(ai.whyFansLove).slice(0, 6) : rich.whyFansLove,
    whoShouldWatch: ai.whoShouldWatch || rich.whoShouldWatch,
    whoShouldAvoid: ai.whoShouldAvoid || rich.whoShouldAvoid,
    joeNote: ai.joeNote || rich.joeNote
  };
}

function loadExistingCards(file) {
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/export const GENERATED_GENOME_CARDS = ([\s\S]*?);\s*$/m);
  if (!match) return [];
  try { return JSON.parse(match[1]); } catch { return []; }
}

function saveGeneratedCards(file, cards) {
  const body = `// Auto-generated provisional Genome Cards.
// This file is maintained by scripts/generateGenomeCardForTitle.cjs
// Cards here should be reviewed before being promoted to enhanced/expert modules.

export const GENERATED_GENOME_CARDS = ${JSON.stringify(cards, null, 2)};
`;
  fs.writeFileSync(file, body, 'utf8');
}

async function main() {
  const titleArg = process.argv.slice(2).join(' ').trim();
  if (!titleArg) {
    console.error('Usage: node scripts/generateGenomeCardForTitle.cjs "Anime Title"');
    process.exit(1);
  }

  const root = findRoot(process.cwd());
  const outFile = path.join(root, 'src', 'ai', 'genome', 'generated', 'generatedGenomeCards.js');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  console.log(`Fetching metadata from Jikan for: ${titleArg}`);
  const metadata = await fetchJikanTitle(titleArg);

  const examples = [
    { id: 'dorohedoro', signature: 'Like someone blended horror, black comedy, punk rock, mushrooms, and friendship into one filthy masterpiece.' },
    { id: 'space-dandy', signature: 'A stylish cosmic comedy about chasing aliens, vibes, and absolute nonsense across space.' },
    { id: 'monster', signature: 'A slow, grounded masterpiece about evil, guilt, identity, and moral responsibility.' }
  ];

  let ai = null;
  try {
    ai = await generateWithOpenAI(metadata, examples);
    if (ai) console.log(`AI draft generated with ${ai.model}.`);
  } catch (error) {
    console.warn('AI draft failed; using heuristic draft instead.');
    console.warn(error.message);
  }

  const card = buildDraftCard(metadata, ai || {});
  const existing = loadExistingCards(outFile);
  const next = [card, ...existing.filter((item) => item.id !== card.id && item.malId !== card.malId)];

  saveGeneratedCards(outFile, next);

  console.log('');
  console.log(`Generated Genome draft: ${card.titles[0]} (${card.id})`);
  console.log(`Quality: ${card.quality} / needsReview: ${card.needsReview}`);
  console.log(`Saved to: ${path.relative(root, outFile)}`);
  console.log('');
  console.log('Next run:');
  console.log('node scripts\\rebuildGenomeRegistry.cjs');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
