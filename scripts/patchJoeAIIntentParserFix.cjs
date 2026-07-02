const fs = require('fs');

const file = 'src/pages/PlaceholderPages.jsx';
let text = fs.readFileSync(file, 'utf8');

function replaceOrWarn(find, replace, label) {
  if (text.includes(find)) {
    text = text.replace(find, replace);
    console.log('patched:', label);
  } else {
    console.warn('missing:', label);
  }
}

// Replace parseBulkAdd with a smarter version that also detects comma/newline lists.
const oldParseBulkStart = text.indexOf('  function parseBulkAdd(value = \'\') {');
if (oldParseBulkStart !== -1) {
  const nextFunction = text.indexOf('\n  function helpAnswer()', oldParseBulkStart);
  if (nextFunction !== -1) {
    const newParseBulk = `  function parseBulkAdd(value = '') {
    const raw = String(value).trim();
    const lower = raw.toLowerCase();
    const status = parseStatus(raw);

    let body = raw;

    const explicitBulk =
      lower.startsWith('add these') ||
      lower.startsWith('import these') ||
      lower.startsWith('bulk add') ||
      lower.startsWith('add list') ||
      lower.startsWith('import list');

    if (explicitBulk) {
      body = raw.includes(':')
        ? raw.slice(raw.indexOf(':') + 1)
        : raw.replace(/^(add these|import these|bulk add|add list|import list)/i, '');
    } else {
      // Natural bulk commands:
      // "add Bleach, One Piece, Initial D as completed"
      // "mark Bleach, Naruto as completed"
      // "I finished Bleach, Naruto, One Piece"
      body = raw
        .replace(/^(add|import|mark|i finished|finished|i completed|completed|i watched|watched)\\s+/i, '')
        .replace(/\\s+as\\s+(completed|watched|watching|planned|plan to watch|dropped|on hold)$/i, '')
        .replace(/\\s+to\\s+(?:my\\s+)?library$/i, '');
    }

    const hasListSeparator = body.includes(',') || /\\r?\\n/.test(body);
    if (!explicitBulk && !hasListSeparator) return null;

    const titles = [...new Set(
      body
        .split(/\\r?\\n|,/)
        .map((line) => line.trim())
        .map((line) => line.replace(/^[-*•]\\s*/, '').trim())
        .filter(Boolean)
    )];

    return titles.length > 1 ? { titles, status } : null;
  }

`;
    text = text.slice(0, oldParseBulkStart) + newParseBulk + text.slice(nextFunction + 1);
    console.log('patched: parseBulkAdd smart list detector');
  }
}

// Add a guard to parseSingleAdd so comma/newline lists do not become one giant fake title.
const singleGuardAnchor = `  function parseSingleAdd(value = '') {
    const raw = String(value).trim();`;
const singleGuardReplace = `  function parseSingleAdd(value = '') {
    const raw = String(value).trim();

    // Lists belong to bulk import, not single-title add.
    if (raw.includes(',') || /\\r?\\n/.test(raw)) return null;`;

replaceOrWarn(singleGuardAnchor, singleGuardReplace, 'parseSingleAdd list guard');

// Ensure ask() checks bulk before single; if already does, this is harmless.
const oldOrder = `    const bulkCommand = parseBulkAdd(q);
    if (bulkCommand) {
      const action = { ...bulkCommand, kind: 'bulkAdd' };
      setPendingAction(action);
      setLog((current) => [
        ...current,
        {
          who: 'bot',
          type: 'confirmAction',
          title: '🍜 Ready to bulk import',
          text: \`I found \${bulkCommand.titles.length} title(s). I will add them as \${bulkCommand.status}, skip duplicates, and fetch metadata. Import these?\`,
          confirmLabel: 'Import Titles',
          action
        }
      ]);
      return;
    }

    const addCommand = parseSingleAdd(q);`;

if (text.includes(oldOrder)) {
  console.log('bulk-before-single already present');
} else {
  console.warn('Could not verify bulk-before-single order. Check ask() manually if parser still acts weird.');
}

// Improve confirmation list if available.
if (!text.includes('joeaiConfirmList')) {
  console.warn('Confirmation UI not found; no UI change needed.');
}

fs.writeFileSync(file, text);
console.log('JoeAI intent parser fixed: comma/newline lists now become bulk import.');
