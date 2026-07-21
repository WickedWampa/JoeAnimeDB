import { buildJoeAIMemory } from '../memory';
import { MEMORY_DIMENSIONS, DIMENSION_LABELS, normalizeText } from '../memory/memoryTypes';
import { answerMemoryReflection } from '../memory/reflectionEngine';

function titleOf(item = {}) {
  return item.officialTitle || item.title || item.name || 'Unknown title';
}

function scoreOf(item = {}) {
  const value = Number(item.joeScore || item.score || item.finalScore || 0);
  return Number.isFinite(value) ? value : 0;
}

function normalizeTitle(value = '') {
  return normalizeText(value).replace(/\s+/g, ' ').trim();
}

function titleTokens(item = {}) {
  return [
    item.title,
    item.officialTitle,
    item.japaneseTitle,
    ...(item.titleSynonyms || [])
  ].filter(Boolean);
}

function findAnimeByPrompt(text = '', anime = [], catalog = []) {
  const raw = String(text || '');
  const cleaned = raw
    .replace(/\b(why|did|do|does|you|i|me|my|like|love|recommend|recommended|this|that|anime|show|series|because|about|what|makes|special|explain|reason|for)\b/gi, ' ')
    .replace(/[?!.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const pool = [...(anime || []), ...(catalog || [])];
  const query = normalizeTitle(cleaned || raw);
  if (!query) return null;

  const scored = pool
    .map((item) => {
      let best = 0;
      for (const title of titleTokens(item)) {
        const key = normalizeTitle(title);
        if (!key) continue;
        if (key === query) best = Math.max(best, 100);
        if (query.includes(key) || key.includes(query)) {
          best = Math.max(best, Math.min(96, Math.round((Math.min(key.length, query.length) / Math.max(key.length, query.length)) * 100)));
        }
        const words = query.split(' ').filter(Boolean);
        const hits = words.filter((word) => key.includes(word)).length;
        if (words.length) best = Math.max(best, Math.round((hits / words.length) * 82));
      }
      return { item, score: best };
    })
    .filter((entry) => entry.score >= 58)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.item || null;
}

function itemText(item = {}) {
  return normalizeText([
    item.title,
    item.officialTitle,
    item.synopsis,
    item.description,
    item.studio,
    item.domain,
    item.subdomain,
    ...(item.genres || []),
    ...(item.themes || []),
    ...(item.viewerMotivations || []),
    ...(item.fantasyPillars || []),
    ...(item.tags || [])
  ].filter(Boolean).join(' '));
}

function dimensionFromText(text = '', profile = {}) {
  const lower = normalizeText(text);
  const dimensions = profile.dimensions || {};

  for (const key of MEMORY_DIMENSIONS) {
    const label = DIMENSION_LABELS[key] || key;
    const possible = [key, label, label.replace(/\s*\/\s*/g, ' ')].map(normalizeText);
    if (possible.some((token) => token && lower.includes(token))) {
      return dimensions[key] || null;
    }
  }

  const aliases = [
    ['world building', 'worldbuilding'],
    ['worldbuilding', 'worldbuilding'],
    ['world', 'worldbuilding'],
    ['found family', 'foundFamily'],
    ['friends', 'foundFamily'],
    ['crew', 'foundFamily'],
    ['comfort', 'longRunning'],
    ['rewatch', 'longRunning'],
    ['kingdom', 'kingdomBuilding'],
    ['politics', 'politics'],
    ['political', 'politics'],
    ['strategy', 'strategicBattles'],
    ['strategic', 'strategicBattles'],
    ['battle', 'strategicBattles'],
    ['combat', 'supernaturalCombat'],
    ['supernatural', 'supernaturalCombat'],
    ['power fantasy', 'powerFantasy'],
    ['power', 'powerFantasy'],
    ['long running', 'longRunning'],
    ['long form', 'longRunning'],
    ['long-form', 'longRunning'],
    ['comedy', 'comedy'],
    ['funny', 'comedy'],
    ['romance', 'romance'],
    ['horror', 'horror'],
    ['mecha', 'mecha'],
    ['sports', 'sports']
  ];

  const match = aliases.find(([alias]) => lower.includes(alias));
  return match ? dimensions[match[1]] || null : null;
}

function traitOverlap(item = {}, profile = {}) {
  const text = itemText(item);
  const title = normalizeTitle(titleOf(item));

  return (profile.strongest || []).slice(0, 8).map((trait) => {
    const label = normalizeText(trait.label);
    const key = normalizeText(trait.key || '');
    const evidenceHit = (trait.evidence || []).some((entry) => normalizeTitle(entry) === title);
    const textHit = (label && text.includes(label)) || (key && text.includes(key));
    const score = Number(trait.score || 0);

    return {
      ...trait,
      personalHit: evidenceHit,
      textHit,
      relevance: (evidenceHit ? 36 : 0) + (textHit ? 18 : 0) + score
    };
  }).sort((a, b) => b.relevance - a.relevance).slice(0, 5);
}

function itemEvidence(item = {}) {
  const bits = [];
  const status = String(item.status || '').trim();
  const rewatches = Number(item.rewatches || 0);
  const rating = scoreOf(item);

  if (status) bits.push(`${status} in your library`);
  if (rating) bits.push(`${rating.toFixed(rating % 1 ? 1 : 0)}/10 score signal`);
  if (rewatches > 0) bits.push(`${rewatches} recorded rewatch${rewatches === 1 ? '' : 'es'}`);
  if (item.favorite) bits.push('marked as a favorite');
  if (item.episodeCount || item.episodes) bits.push(`${item.episodeCount || item.episodes} episodes of commitment`);

  return bits;
}

function evidenceLine(items = [], prefix = '• ') {
  return items.filter(Boolean).slice(0, 8).map((item) => `${prefix}${item}`).join('\n');
}

function explainDimension(dimension) {
  if (!dimension) return null;

  const score = Number(dimension.score || 0);
  const evidence = dimension.evidence || [];
  const meaning = score >= 90
    ? 'This is one of the clearest predictors in your entire profile.'
    : score >= 75
      ? 'This is a major supporting preference, especially when paired with your top traits.'
      : score >= 55
        ? 'This shows up in your library, but it is not the main engine of your taste.'
        : 'This is present, but JoeAI needs more evidence before treating it as a core preference.';

  return [
    `🧠 JoeAI Reasoning: ${dimension.label}`,
    '',
    `Affinity: ${score}%`,
    `Confidence: ${dimension.confidence || 0}%`,
    '',
    meaning,
    '',
    evidence.length ? 'Evidence JoeAI is using:' : 'I do not have much direct evidence for this yet.',
    evidence.length ? evidenceLine(evidence) : '',
    '',
    `How I use this: when recommending anime, ${dimension.label.toLowerCase()} increases confidence only when the show also overlaps with your strongest library anchors.`
  ].filter(Boolean).join('\n');
}

function answerMemorySearch(text, memory) {
  const profile = memory.profile || {};
  const lower = String(text || '').toLowerCase();

  if (/\b(what changed|recent|lately|timeline|memory feed|memories|learned)\b/i.test(lower)) {
    const total = Number(profile.stats?.total || 0);
    if (total === 0) {
      return [
        '🧠 JoeAI is ready to learn.',
        '',
        'Your Anime DNA and memory timeline are empty because there are no anime in your library yet.',
        '',
        'Add or import a few titles, then mark ratings, favorites, rewatches, and watch statuses. JoeAI will build a profile from this user’s own history—never from someone else’s library.'
      ].join('\n');
    }

    const events = (memory.eventFeed || memory.journalEntry?.events || memory.journal || []).slice(0, 8);
    if (!events.length) {
      return '🧠 JoeAI Memory is active, but I do not have many timeline events yet. Update your library or change a status and I will start recording more.';
    }

    return [
      '📖 Recent JoeAI Memories',
      '',
      ...events.map((event) => {
        const title = event.title || event.summary || event.type || 'Memory event';
        const summary = event.summary ? ` — ${event.summary}` : '';
        return `• ${event.icon || '🧠'} ${title}${summary}`;
      })
    ].join('\n');
  }

  if (/\b(milestone|achievement|achievements|viewer class)\b/i.test(lower)) {
    const stats = profile.stats || {};
    const strongest = profile.strongest || [];
    const mainTrait = strongest[0]?.label || 'Anime Explorer';
    return [
      '🏆 JoeAI Milestones',
      '',
      `• ${stats.completed || 0} anime completed`,
      `• ${stats.rewatches || 0} total rewatches recorded`,
      `• Current viewer class: ${mainTrait.includes('World') ? '🌍 World Builder' : '🍜 Anime Explorer'}`,
      '',
      `My read: ${mainTrait} is currently the identity JoeAI trusts most because it has the strongest evidence trail.`
    ].join('\n');
  }

  if (/\b(comfort anime|comfort core|anchor|rewatch|rewatches|re watched)\b/i.test(lower)) {
    const stats = profile.stats || {};
    const rewatchEvidence = Object.values(profile.dimensions || {})
      .flatMap((dimension) => dimension.evidenceDetails || [])
      .filter((entry) => Number(entry.rewatches || 0) > 0)
      .sort((a, b) => Number(b.rewatches || 0) - Number(a.rewatches || 0));

    const unique = [];
    const seen = new Set();
    for (const entry of rewatchEvidence) {
      const key = normalizeText(entry.title);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(entry);
    }

    return [
      '❤️ JoeAI Reasoning: Comfort Core',
      '',
      `JoeAI sees ${stats.rewatches || 0} total rewatches recorded.`,
      '',
      unique.length ? 'Strongest comfort anchors:' : 'I need more rewatch data before I can identify a true comfort core.',
      unique.length ? unique.slice(0, 8).map((entry) => `• ${entry.title}${entry.rewatches ? ` (${entry.rewatches}x)` : ''}`).join('\n') : '',
      '',
      'My read: rewatches matter more than simple metadata because they show what you return to when novelty is no longer the point.'
    ].filter(Boolean).join('\n');
  }

  const dimension = dimensionFromText(text, profile);
  if (dimension) return explainDimension(dimension);

  return null;
}

function answerWhyAnime(text, anime = [], catalog = [], memory) {
  if (!/\b(why|explain|reason|because|what makes)\b/i.test(text)) return null;

  const item = findAnimeByPrompt(text, anime, catalog);
  if (!item) return null;

  const profile = memory.profile || {};
  const title = titleOf(item);
  const overlap = traitOverlap(item, profile);
  const evidence = itemEvidence(item);
  const inLibrary = (anime || []).some((entry) => normalizeTitle(titleOf(entry)) === normalizeTitle(title));
  const topTraits = (profile.strongest || []).slice(0, 4);
  const isRecommendationQuestion = /\brecommend|recommended|suggest|suggested\b/i.test(text);

  const intro = isRecommendationQuestion
    ? `I would recommend ${title} because it overlaps with the strongest parts of your Anime DNA, not just because it matches a genre tag.`
    : `I think ${title} matters to your taste because it lines up with patterns JoeAI already sees in your library.`;

  const relationship = inLibrary
    ? 'This is not just a metadata match — it is part of your actual library history.'
    : 'This is a projection from your current taste model, so JoeAI treats it as a recommendation hypothesis rather than a proven favorite.';

  return [
    `🧠 JoeAI Reasoning: ${title}`,
    '',
    intro,
    relationship,
    '',
    evidence.length ? 'Personal evidence:' : 'Personal evidence:',
    evidence.length ? evidenceLine(evidence) : '• No rating, favorite, or rewatch signal yet — JoeAI is leaning on taste overlap instead.',
    '',
    overlap.length ? 'Match breakdown:' : '',
    overlap.length ? overlap.map((trait) => `• ${trait.label} — ${trait.score}%${trait.personalHit ? ' (direct evidence)' : ''}`).join('\n') : '',
    '',
    topTraits.length ? `Bottom line: your strongest current signals are ${topTraits.map((trait) => trait.label.toLowerCase()).join(', ')}. ${title} fits best when it feeds those patterns.` : '',
    '',
    isRecommendationQuestion ? 'What else I would compare it against: One Piece, Slime, Vinland Saga, Frieren, or any long-form story with political/worldbuilding payoff.' : ''
  ].filter(Boolean).join('\n');
}

function answerTasteChange(memory) {
  const profile = memory.profile || {};
  const strongest = profile.strongest || [];
  const weakest = profile.weakest || [];

  return [
    '📈 JoeAI Reasoning: How your taste is shaping up',
    '',
    'Your strongest current signals are:',
    strongest.slice(0, 5).map((item) => `• ${item.label} — ${item.score}%`).join('\n') || '• Still learning',
    '',
    weakest.length ? 'Your weaker or less-proven signals are:' : '',
    weakest.length ? weakest.slice(0, 4).map((item) => `• ${item.label} — ${item.score}%`).join('\n') : '',
    '',
    'My read: your profile currently leans toward anime that reward long-term investment — big worlds, recurring casts, power growth, and emotional payoff over quick one-off stories.',
    '',
    'The new Living Memory layer now stores daily thoughts, uncertainty signals, prediction readiness, and taste-shift events so future answers can explain what changed instead of only describing the current snapshot.'
  ].filter(Boolean).join('\n');
}

export function routeJoeAIConversation({ text = '', anime = [], catalog = [] }) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  const memory = buildJoeAIMemory(anime || [], { persist: true });

  const reflectionAnswer = answerMemoryReflection(raw, memory);
  if (reflectionAnswer) return { type: 'text', text: reflectionAnswer };

  const whyAnswer = answerWhyAnime(raw, anime, catalog, memory);
  if (whyAnswer) return { type: 'text', text: whyAnswer };

  if (/\b(how has my taste changed|taste changed|evolving|evolved|evolution)\b/i.test(lower)) {
    return { type: 'text', text: answerTasteChange(memory) };
  }

  const memoryAnswer = answerMemorySearch(raw, memory);
  if (memoryAnswer) return { type: 'text', text: memoryAnswer };

  return null;
}
