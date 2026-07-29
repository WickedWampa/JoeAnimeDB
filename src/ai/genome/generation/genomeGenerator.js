// Phase 1: AI Genome Generator helpers.
// Creates provisional/generated Genome Cards from Kitsu metadata + optional AI JSON.

export function slugify(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeList(value = []) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((x) => x.trim()).filter(Boolean);
  return String(value).split(',').map((x) => x.trim()).filter(Boolean);
}

export function inferDomain(metadata = {}) {
  const all = [...normalizeList(metadata.genres), ...normalizeList(metadata.themes)]
    .join(' ')
    .toLowerCase();

  if (/horror|gore|suspense/.test(all)) return 'horror / psychological';
  if (/romance/.test(all)) return 'romance / emotional growth';
  if (/comedy|gag humor|parody/.test(all)) return 'comedy / slice of life';
  if (/sports/.test(all)) return 'sports / mastery';
  if (/sci-fi|space|mecha|cyberpunk/.test(all)) return 'sci-fi / mecha';
  if (/fantasy|isekai|adventure/.test(all)) return 'fantasy / adventure';
  if (/mystery|detective/.test(all)) return 'mystery / thriller';
  return normalizeList(metadata.genres)[0] || 'general anime';
}

export function inferVibes(metadata = {}) {
  const text = [
    metadata.synopsis,
    metadata.background,
    ...(metadata.genres || []),
    ...(metadata.themes || []),
    ...(metadata.demographics || [])
  ].join(' ').toLowerCase();

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

export function buildDraftGenomeCard({ metadata = {}, ai = {} } = {}) {
  const title = metadata.titleEnglish || metadata.title || ai.title || 'Unknown Anime';
  const genres = normalizeList(metadata.genres);
  const themes = normalizeList(metadata.themes);
  const demographics = normalizeList(metadata.demographics);

  return {
    id: ai.id || slugify(title),
    titles: [...new Set([metadata.title, metadata.titleEnglish, metadata.titleJapanese, ...(metadata.titleSynonyms || [])].filter(Boolean))],
    malId: metadata.malId,
    quality: 'generated',
    generated: true,
    needsReview: true,
    generatedAt: new Date().toISOString(),
    source: {
      metadata: 'kitsu',
      generator: ai.usedAI ? 'ai-assisted' : 'heuristic',
      model: ai.model || null
    },
    domain: ai.domain || inferDomain({ ...metadata, genres, themes, demographics }),
    subdomain: ai.subdomain || ai.subDomain || '',
    signature: ai.signature || `${title} looks like a ${inferDomain({ ...metadata, genres, themes })} story based on its metadata.`,
    coreFantasy: ai.coreFantasy || 'A provisional Genome Card generated from metadata. Review before marking curated.',
    viewerMotivations: normalizeList(ai.viewerMotivations).length ? normalizeList(ai.viewerMotivations) : [...new Set([...genres, ...themes, ...demographics])].slice(0, 6),
    themes: normalizeList(ai.themes).length ? normalizeList(ai.themes) : [...new Set([...themes, ...genres])].slice(0, 8),
    emotionalProfile: normalizeList(ai.emotionalProfile),
    atmosphere: normalizeList(ai.atmosphere),
    vibes: { ...inferVibes({ ...metadata, genres, themes, demographics }), ...(ai.vibes || {}) },
    accessibility: ai.accessibility || 'Generated draft. Needs review.',
    idealFollowUps: normalizeList(ai.idealFollowUps).slice(0, 8),
    antiRecommendations: normalizeList(ai.antiRecommendations).slice(0, 8),
    recommendationWeight: Number(ai.recommendationWeight || 0.55),
    rewatchValue: ai.rewatchValue || 'Unknown. Generated draft.',
    whyFansLove: normalizeList(ai.whyFansLove).slice(0, 6),
    whoShouldWatch: ai.whoShouldWatch || 'Viewers interested in this show’s genres and themes.',
    whoShouldAvoid: ai.whoShouldAvoid || 'Unknown. Generated draft.',
    joeNote: ai.joeNote || 'Generated draft. Joe should review this before it becomes curated.'
  };
}
