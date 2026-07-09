import { findGenomeCardByTitle } from './genome/genomeRegistry';
export function normalizeStatus(value = '') {
  const lower = String(value).toLowerCase();

  if (/\b(completed|complete|finished|watched|done)\b/.test(lower)) return 'Completed';
  if (/\b(watching|started|current|currently)\b/.test(lower)) return 'Watching';
  if (/\b(plan|planned|later|ptw)\b/.test(lower)) return 'Plan to Watch';
  if (/\b(hold|paused)\b/.test(lower)) return 'On Hold';
  if (/\b(drop|dropped)\b/.test(lower)) return 'Dropped';

  return 'Watching';
}

const STATUS_WORDS = '(completed|complete|watched|finished|done|watching|planned|plan to watch|dropped|on hold|hold|paused)';

function stripCommandWords(value = '') {
  return String(value)
    .trim()
    .replace(/^(please\s+)?/i, '')
    .replace(/^(joeai\s+)?/i, '')
    .replace(/^(bulk\s+add|add\s+list|import\s+list|add|import|mark|set|put)\s+/i, '')
    .replace(/^(these|this|the following|list)\s*/i, '')
    .replace(/^(i\s+am|i'm|im)\s+/i, '')
    .replace(/^(i\s+)?(finished|completed|complete|watched|started)\s+/i, '')
    .replace(/\s+to\s+(my\s+)?library$/i, '')
    .trim();
}

function stripStatusWords(value = '') {
  return String(value)
    .trim()
    .replace(new RegExp(`^as\\s+${STATUS_WORDS}\\s+`, 'i'), '')
    .replace(new RegExp(`^${STATUS_WORDS}\\s+`, 'i'), '')
    .replace(new RegExp(`\\s+as\\s+${STATUS_WORDS}$`, 'i'), '')
    .replace(new RegExp(`\\s+${STATUS_WORDS}$`, 'i'), '')
    .trim();
}

function removeExplicitBulkPrefix(raw = '') {
  let body = String(raw).trim();

  // Important: only treat a colon as the command separator when it appears
  // before the first comma/newline. This prevents anime titles like
  // "Cyberpunk: Edgerunners" and "Fate/stay night: UBW" from deleting
  // everything before the title colon.
  const firstColon = body.indexOf(':');
  const firstComma = body.indexOf(',');
  const firstNewline = body.search(/\r?\n/);
  const colonIsCommandSeparator =
    firstColon !== -1 &&
    (firstComma === -1 || firstColon < firstComma) &&
    (firstNewline === -1 || firstColon < firstNewline);

  if (colonIsCommandSeparator) {
    body = body.slice(firstColon + 1);
  }

  body = stripCommandWords(body);
  body = stripStatusWords(body);

  return body;
}

function parseTitles(value = '') {
  return [...new Set(
    String(value)
      .split(/\r?\n|,/)
      .map((line) => line.trim())
      .map((line) => line.replace(/^[-*•]\s*/, '').trim())
      .map(stripStatusWords)
      .filter(Boolean)
  )];
}



// PATCH_0038_ONE_BRAIN_ROUTER
// Known titles should always use the Genome/Gold recommendation path.
// This prevents bare lookups like "slime" from falling into the older short-answer path
// while "recommend slime" correctly uses the rich Gold card.
function cleanKnownTitleQueryForGenome(value = '') {
  return String(value || '')
    .trim()
    .replace(/[?!.,]+$/g, '')
    .replace(/^\s*(please\s+)?(recommend|tell me about|what is|what's|whats|who is|should i watch|why should i watch|is|about)\s+/i, '')
    .replace(/^\s*(anime|show|series)\s+/i, '')
    .replace(/\s+(anime|show|series)\s*$/i, '')
    .trim();
}

function isKnownGenomeTitleQuery(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return false;

  const cleaned = cleanKnownTitleQueryForGenome(raw);
  if (!cleaned || cleaned.length < 3) return false;

  // Avoid turning ordinary broad moods into title lookups.
  const broadWords = new Set([
    'action', 'adventure', 'fantasy', 'isekai', 'romance', 'comedy', 'horror',
    'sports', 'mecha', 'sci fi', 'sci-fi', 'dark', 'funny', 'sad', 'new anime'
  ]);
  if (broadWords.has(cleaned.toLowerCase())) return false;

  return Boolean(findGenomeCardByTitle(cleaned) || findGenomeCardByTitle(raw));
}

export function parseJoeAIIntent(input = '') {
  const raw = String(input).trim();
  if (!raw) return { kind: 'empty' };

  const lower = raw.toLowerCase();
  const status = normalizeStatus(raw);

  const memoryPrompt =
    /\b(what do you know about me|analyze my taste|analyse my taste|taste profile|joeai memory|anime taste|my taste|taste memory|what have you learned about me)\b/i.test(raw);

  if (memoryPrompt) {
    return { kind: 'memory', text: raw };
  }

  // Highest-priority reasoning requests must NOT fall through to title/genome lookup.
  // Examples: "why do I like Bleach", "why did you recommend Kingdom",
  // "explain worldbuilding". These belong to the conversation/reasoning engine.
  const reasoningPrompt =
    /^(why|explain|reason|reasons|how did you decide|how do you know|why did you recommend|why do i like|why should i watch)\b/i.test(raw) ||
    /\b(why did you recommend|why do i like|why do you think|explain my|explain the|explain worldbuilding|reasoning|match breakdown)\b/i.test(raw);

  if (reasoningPrompt) {
    return { kind: 'question', text: raw, priority: 'reasoning' };
  }

  // Similarity/title-like requests are handled by the recommendation router.
  // Keep them as questions so routeJoeAIRecommendation() can decide whether this is
  // a "similar to X" request, a known Genome title lookup, or normal fallback.
  const similarityPrompt = /\b(like|similar to|something like|anime like|show like|shows like|show me something like)\b/i.test(raw);

  if (similarityPrompt) {
    return { kind: 'question', text: raw };
  }


  const generateGenomeMatch = raw.match(/^(generate|create|make)\s+(?:a\s+)?genome(?:\s+card)?\s+(?:for\s+)?(.+)$/i);
  if (generateGenomeMatch?.[2]) {
    return {
      kind: 'generateGenome',
      title: generateGenomeMatch[2].trim()
    };
  }

  if (lower.includes('help') || lower.includes('what can you do')) {
    return { kind: 'help' };
  }

  if (lower.includes('library status') || lower.includes('stats') || lower.includes('how many')) {
    return { kind: 'stats' };
  }

  if (lower.includes('what am i watching') || lower.includes('currently watching')) {
    return { kind: 'watchingList' };
  }

  // SPRINT6_MOOD_RECOMMENDATION_WORDS
  // These are recommendation intents even when the user does not say "recommend" or "watch".
  const moodRecommendationWords = [
    'funny',
    'comedy',
    'hilarious',
    'make me laugh',
    'comforting',
    'comfort',
    'cozy',
    'relaxing',
    'chill',
    'wholesome',
    'feel good',
    'mind games',
    'psychological',
    'genius',
    'manipulation',
    'strategy',
    'thriller',
    'sad',
    'depressing',
    'make me cry',
    'cry',
    'emotional',
    'tearjerker',
    'heartbreaking',
    'cyberpunk',
    'sci fi',
    'sci-fi',
    'ai',
    'robots',
    'dark',
    'violent',
    'brutal',
    'gory',
    'gritty',
    'masterpiece',
    'classic',
    'peak',
    'banger',
    'underrated',
    'sports',
    'competition',
    'mastery',
    'training',
    'underdog',
    'rivalry',
    'horror',
    'scary',
    'creepy',
    'romcom',
    'rom/com',
    'rom com',
    'rom-com',
    'slice of life',
    'sol',
    'mecha'
  ];

  if (moodRecommendationWords.some((word) => lower.includes(word))) {
    return { kind: 'recommendation' };
  }

  const explicitBulk =
    /^(add these|import these|bulk add|add list|import list)\b/i.test(raw);

  const commandLike =
    /^(add|import|bulk add|add list|import list|mark|set|put|i finished|i completed|i watched|i started|finished|completed|watched|started)\b/i.test(raw);

  const hasListSeparator = raw.includes(',') || /\r?\n/.test(raw);

  if (explicitBulk || commandLike || hasListSeparator) {
    let body = removeExplicitBulkPrefix(raw);

    const titles = parseTitles(body);

    if (titles.length > 1) {
      return {
        kind: 'bulkAdd',
        titles,
        status
      };
    }

    if (titles.length === 1 && commandLike) {
      return {
        kind: 'singleAdd',
        title: titles[0],
        status
      };
    }
  }

  if (lower.includes('recommend') || lower.includes('next') || lower.includes('watch') || lower.includes('new anime')) {
    return { kind: 'recommendation' };
  }

  return { kind: 'question', text: raw };
}
