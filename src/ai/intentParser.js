export function normalizeStatus(value = '') {
  const lower = String(value).toLowerCase();

  if (/\b(completed|complete|finished|watched|done)\b/.test(lower)) return 'Completed';
  if (/\b(watching|started|current|currently)\b/.test(lower)) return 'Watching';
  if (/\b(plan|planned|later|ptw)\b/.test(lower)) return 'Plan to Watch';
  if (/\b(hold|paused)\b/.test(lower)) return 'On Hold';
  if (/\b(drop|dropped)\b/.test(lower)) return 'Dropped';

  return 'Watching';
}

function stripCommandWords(value = '') {
  return String(value)
    .trim()
    .replace(/^(please\s+)?/i, '')
    .replace(/^(joeai\s+)?/i, '')
    .replace(/^(add|import|bulk add|add list|import list|mark|set|put)\s+/i, '')
    .replace(/^(these|this|the following|list)\s*/i, '')
    .replace(/^(i\s+am|i'm|im)\s+/i, '')
    .replace(/^(i\s+)?(finished|completed|watched|started)\s+/i, '')
    .replace(/\s+to\s+(my\s+)?library$/i, '')
    .trim();
}

function stripStatusWords(value = '') {
  return String(value)
    .trim()
    .replace(/^as\s+(completed|complete|watched|finished|watching|planned|plan to watch|dropped|on hold)\s+/i, '')
    .replace(/\s+as\s+(completed|complete|watched|finished|watching|planned|plan to watch|dropped|on hold)$/i, '')
    .replace(/\s+(completed|complete|watched|finished|watching|planned|dropped)$/i, '')
    .trim();
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

  const looksLikeImport =
    /^(add|import|bulk add|add list|import list|mark|set|put|i finished|i completed|i watched|i started|finished|completed|watched|started)\b/i.test(raw) ||
    raw.includes(',') ||
    /\r?\n/.test(raw);

  if (looksLikeImport) {
    const colonBody = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw;
    let body = stripCommandWords(colonBody);
    body = stripStatusWords(body);

    const titles = parseTitles(body);

    if (titles.length > 1) {
      return {
        kind: 'bulkAdd',
        titles,
        status
      };
    }

    if (titles.length === 1) {
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
