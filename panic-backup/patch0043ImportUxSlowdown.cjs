const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'src', 'pages', 'PlaceholderPages.jsx');

function fail(message) {
  console.error('❌ ' + message);
  process.exit(1);
}

function findMatchingBrace(source, openBraceIndex) {
  let depth = 0;
  let inString = null;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = openBraceIndex; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

if (!fs.existsSync(target)) {
  fail('Could not find src/pages/PlaceholderPages.jsx. Run this from the JoeAnimeDB repo root.');
}

let source = fs.readFileSync(target, 'utf8');

if (source.includes('PATCH_0043_IMPORT_UX_SLOWDOWN_APPLIED')) {
  console.log('✅ PATCH_0043 already applied. Nothing to do.');
  process.exit(0);
}

const backup = target + `.backup-before-patch0043-${Date.now()}`;
fs.writeFileSync(backup, source, 'utf8');

const marker = 'async function addAnimeToLibrary(input)';
const start = source.indexOf(marker);
if (start === -1) fail('Could not find addAnimeToLibrary(input).');
const openBrace = source.indexOf('{', start);
if (openBrace === -1) fail('Could not find addAnimeToLibrary opening brace.');
const closeBrace = findMatchingBrace(source, openBrace);
if (closeBrace === -1) fail('Could not find addAnimeToLibrary closing brace.');

const replacement = `async function addAnimeToLibrary(input) {
    // PATCH_0043_IMPORT_UX_SLOWDOWN_APPLIED
    const id = 'anime-' + animeId(input);
    const title = input?.title || 'that title';
    setAddingId(id);

    setLog((current) => [
      ...current,
      {
        who: 'bot',
        type: 'text',
        text: '🔎 Searching metadata for ' + title + '...'
      }
    ]);

    const minimumWait = new Promise((resolve) => setTimeout(resolve, 900));

    try {
      const [result] = await Promise.all([
        executeJoeAICommand({
          intent: {
            kind: 'singleAdd',
            title: input.title,
            status: input.status || 'Watching'
          },
          anime,
          catalog,
          updateAnime,
          brain
        }),
        minimumWait
      ]);

      setLog((current) => [...current, { who: 'bot', ...result }]);
    } catch (error) {
      await minimumWait;
      console.warn('JoeAI add-to-library failed:', input.title, error);

      const message = String(error?.message || error || '');
      const isJikanTimeout = /jikan\\s*504|504|gateway|timeout|time-out/i.test(message);

      setLog((current) => [
        ...current,
        {
          who: 'bot',
          type: 'text',
          text: isJikanTimeout
            ? 'Jikan timed out while looking up "' + title + '". The app is okay — the metadata service is just being slow. Try again in a minute.'
            : 'I could not add ' + title + ' yet. Error: ' + (message || 'Unknown error')
        }
      ]);
    } finally {
      setAddingId('');
    }
  }`;

source = source.slice(0, start) + replacement + source.slice(closeBrace + 1);

// Make the confirm button feel less twitchy while the import is running.
source = source.replace(
  /(<button\s+type="button"\s+className="primary")/,
  '$1\n            disabled={Boolean(addingId)}'
);

source = source.replace(
  /\{message\.confirmLabel \|\| 'Confirm'\}/,
  "{addingId ? 'Working...' : (message.confirmLabel || 'Confirm')}"
);

fs.writeFileSync(target, source, 'utf8');

console.log('✅ PATCH_0043 applied successfully.');
console.log('Backup created: ' + backup);
console.log('Next: npm run dev');
