import { findGenomeCardByTitle } from './genome/genomeRegistry';
import { parseJoeAITeaching } from './intelligence/joeAIIntelligence';
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

  // A colon is a command separator only when everything before it is the
  // command itself. In "add Fullmetal Alchemist: Brotherhood, Attack on Titan"
  // the colon belongs to the title and must be preserved.
  const firstColon = body.indexOf(':');
  const beforeColon = firstColon === -1 ? '' : body.slice(0, firstColon).trim();
  const colonIsCommandSeparator =
    firstColon !== -1 &&
    /^(?:please\s+)?(?:joeai\s+)?(?:add these|import these|bulk add|add list|import list|add|import)$/i.test(beforeColon);

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

function parseLibraryCommand(raw = '', status = 'Watching') {
  const explicitBulk =
    /^(?:please\s+)?(?:joeai\s+)?(add these|import these|bulk add|add list|import list)\b/i.test(raw);

  const commandLike =
    /^(?:please\s+)?(?:joeai\s+)?(add|import|bulk add|add list|import list|mark|set|put|i finished|i completed|i watched|i started|finished|completed|watched|started)\b/i.test(raw);

  // A comma by itself is not enough to mutate the library. Requiring an
  // action word prevents questions such as "compare Bleach, Naruto, and One
  // Piece" from becoming accidental imports.
  if (!explicitBulk && !commandLike) return null;

  const titles = parseTitles(removeExplicitBulkPrefix(raw));

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

  return null;
}

function containsMoodPhrase(value = '', phrase = '') {
  const escaped = String(phrase)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(value);
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
  const teaching = parseJoeAITeaching(raw);

  if (teaching) {
    return { kind: 'teaching', teaching, text: raw };
  }

  // Library mutations must be resolved before recommendation/mood routing.
  // Long anime lists naturally contain words such as "AI", "dark", or
  // "classic"; those title fragments must never turn an explicit add command
  // into a recommendation request.
  const libraryCommand = parseLibraryCommand(raw, status);
  if (libraryCommand) return libraryCommand;

  // Broad taste questions must be analyzed as personal patterns before any
  // title/recommendation lookup sees words such as "adventures" as a show name.
  // Examples: "why do I like long adventures?", "why am I drawn to dark fantasy?"
  const tastePatternPatterns = [
    /^(?:please\s+)?why\s+do\s+i\s+like\s+(.+?)[?.!]*$/i,
    /^(?:please\s+)?why\s+am\s+i\s+(?:drawn|attracted)\s+to\s+(.+?)[?.!]*$/i,
    /^(?:please\s+)?explain\s+why\s+i\s+like\s+(.+?)[?.!]*$/i,
    /^(?:please\s+)?what\s+makes\s+me\s+like\s+(.+?)[?.!]*$/i
  ];

  for (const pattern of tastePatternPatterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      return { kind: 'tastePattern', pattern: match[1].trim(), text: raw };
    }
  }

  // Genre DNA explanations are explicit analysis requests, not recommendations.
  // Keep the captured genre dynamic so this works for every user's genre list.
  const genreDNAPatterns = [
    /^(?:please\s+)?explain(?:\s+why)?\s+(.+?)\s+(?:is|appears|shows up)\s+(?:a\s+)?part\s+of\s+my\s+(?:anime\s+)?dna[?.!]*$/i,
    /^why\s+is\s+(.+?)\s+(?:a\s+)?part\s+of\s+my\s+(?:anime\s+)?dna[?.!]*$/i,
    /^(?:please\s+)?explain\s+my\s+(.+?)\s+(?:anime\s+)?dna[?.!]*$/i,
    /^(?:please\s+)?explain\s+the\s+(.+?)\s+signal\s+in\s+my\s+(?:anime\s+)?dna[?.!]*$/i
  ];

  for (const pattern of genreDNAPatterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      return { kind: 'genreDNA', genre: match[1].trim(), text: raw };
    }
  }

  // Recommendation explanations must be routed as reasoning questions before
  // the broad recommendation matcher sees the word "recommend". This powers
  // Pick of the Day's Why This? button and natural prompts such as
  // "why did you recommend Frieren?" without generating a fresh pick list.
  const recommendationExplanationPatterns = [
    /^(?:please\s+)?(?:tell\s+me\s+)?why\s+you\s+(?:recommend|recommended|suggest|suggested)\s+(.+?)[?.!]*$/i,
    /^(?:please\s+)?(?:tell\s+me\s+)?why\s+(?:did|do|would)\s+you\s+(?:recommend|suggest)\s+(.+?)[?.!]*$/i,
    /^(?:please\s+)?explain\s+why\s+you\s+(?:recommended|recommend|suggested|suggest)\s+(.+?)[?.!]*$/i,
    /^(?:please\s+)?why\s+(?:this|that)\s+(?:pick|recommendation)[?.!]*$/i
  ];

  for (const pattern of recommendationExplanationPatterns) {
    const match = raw.match(pattern);
    if (!match) continue;

    return {
      kind: 'recommendationExplanation',
      title: match[1]?.trim() || '',
      text: raw
    };
  }

  const memoryPrompt =
    /\b(what do you know about me|analyze my taste|analyse my taste|taste profile|joeai memory|anime taste|my taste|taste memory|what have you learned about me|what have you learned|what did you learn|what changed recently|what surprised you most|daily thought|prediction accuracy|least certain|strongest signals|how has my taste changed|when did you learn|when did you realize)\b/i.test(raw);

  if (memoryPrompt) {
    return { kind: 'memory', text: raw };
  }

  const hasSimilarityWording =
    /\b(similar to|something like|anime like|show like|shows like|show me something like)\b/i.test(raw);

  // An exact known title wins before broad recommendation wording. This keeps
  // "recommend One Piece" on its direct Genome answer while
  // "recommend something like One Piece" still produces explained picks.
  if (!hasSimilarityWording && isKnownGenomeTitleQuery(raw)) {
    return {
      kind: 'question',
      text: raw,
      knownTitle: cleanKnownTitleQueryForGenome(raw)
    };
  }

  // Explicit recommendation requests own broad and similarity searches.
  const explicitRecommendationPrompt =
    /\b(recommend|suggest|find|give me|show me|what should i watch|watch next|something to watch|hidden gem|surprise me|next anime)\b/i.test(raw);

  if (explicitRecommendationPrompt) {
    return { kind: 'recommendation', text: raw };
  }

  // Direct similarity wording is a recommendation request even when the user
  // omits the word "recommend". Questions such as "would I like X?" remain
  // normal questions because a bare "like" is intentionally not enough here.
  const similarityPrompt = hasSimilarityWording;

  if (similarityPrompt) {
    return { kind: 'recommendation', text: raw };
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

  if (moodRecommendationWords.some((word) => containsMoodPhrase(lower, word))) {
    return { kind: 'recommendation' };
  }

  if (lower.includes('recommend') || lower.includes('next') || lower.includes('watch') || lower.includes('new anime')) {
    return { kind: 'recommendation' };
  }

  return { kind: 'question', text: raw };
}
