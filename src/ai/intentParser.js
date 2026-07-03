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

export function parseJoeAIIntent(input = '') {
  const raw = String(input).trim();
  if (!raw) return { kind: 'empty' };

  const lower = raw.toLowerCase();
  const status = normalizeStatus(raw);

  if (lower.includes('help') || lower.includes('what can you do')) {
    return { kind: 'help' };
  }

  if (lower.includes('library status') || lower.includes('stats') || lower.includes('how many')) {
    return { kind: 'stats' };
  }

  if (lower.includes('what am i watching') || lower.includes('currently watching')) {
    return { kind: 'watchingList' };
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
