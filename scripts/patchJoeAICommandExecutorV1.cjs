const fs = require('fs');

const file = 'src/pages/PlaceholderPages.jsx';
let text = fs.readFileSync(file, 'utf8');

if (!text.includes("import { executeJoeAICommand } from '../ai/commandExecutor';")) {
  text = text.replace(
    "import { parseJoeAIIntent } from '../ai/intentParser';",
    "import { parseJoeAIIntent } from '../ai/intentParser'; import { executeJoeAICommand } from '../ai/commandExecutor';"
  );
}

function findBlock(startNeedle, nextNeedle) {
  const start = text.indexOf(startNeedle);
  if (start === -1) return null;
  const end = text.indexOf(nextNeedle, start);
  if (end === -1 || end <= start) return null;
  return { start, end };
}

// Replace addAnimeToLibrary with executor wrapper.
const addBlock = findBlock('  async function addAnimeToLibrary(input) {', '\n  async function executeBulkAddFromChat');
if (addBlock) {
  const replacement = `  async function addAnimeToLibrary(input) {
    const id = 'anime-' + animeId(input);
    setAddingId(id);

    try {
      const result = await executeJoeAICommand({
        intent: {
          kind: 'singleAdd',
          title: input.title,
          status: input.status || 'Watching'
        },
        anime,
        catalog,
        updateAnime,
        brain
      });

      setLog((current) => [...current, { who: 'bot', ...result }]);
    } catch (error) {
      console.warn('JoeAI add-to-library failed:', input.title, error);
      setLog((current) => [
        ...current,
        {
          who: 'bot',
          type: 'text',
          text: 'I could not add ' + input.title + ' yet. Check the console and we will fix the save path.'
        }
      ]);
    } finally {
      setAddingId('');
    }
  }

`;
  text = text.slice(0, addBlock.start) + replacement + text.slice(addBlock.end + 1);
  console.log('Replaced addAnimeToLibrary with commandExecutor wrapper.');
} else {
  console.warn('Could not find addAnimeToLibrary block.');
}

// Replace executeBulkAddFromChat with executor wrapper.
const bulkBlock = findBlock('  async function executeBulkAddFromChat(command) {', '\n  async function ask()');
if (bulkBlock) {
  const replacement = `  async function executeBulkAddFromChat(command) {
    setLog((current) => [
      ...current,
      {
        who: 'bot',
        type: 'text',
        text: \`Starting bulk import for \${command.titles.length} title(s)...\`
      }
    ]);

    const result = await executeJoeAICommand({
      intent: {
        kind: 'bulkAdd',
        titles: command.titles,
        status: command.status || 'Watching'
      },
      anime,
      catalog,
      updateAnime,
      brain
    });

    setLog((current) => [...current, { who: 'bot', ...result }]);
  }

`;
  text = text.slice(0, bulkBlock.start) + replacement + text.slice(bulkBlock.end + 1);
  console.log('Replaced executeBulkAddFromChat with commandExecutor wrapper.');
} else {
  console.warn('Could not find executeBulkAddFromChat block.');
}

// Simplify ask() if it still contains parser-driven logic. This keeps confirmation UI intact.
const askBlock = findBlock('  async function ask() {', '\n  function renderRecommendationCard');
if (askBlock) {
  const replacement = `  async function ask() {
    const q = text.trim();
    if (!q) return;

    setLog((current) => [...current, { who: 'user', type: 'text', text: q }]);
    setText('');

    const intent = parseJoeAIIntent(q);

    if (intent.kind === 'bulkAdd') {
      const action = { titles: intent.titles, status: intent.status, kind: 'bulkAdd' };
      setPendingAction(action);
      setLog((current) => [
        ...current,
        {
          who: 'bot',
          type: 'confirmAction',
          title: '🍜 Ready to bulk import',
          text: \`I found \${intent.titles.length} title(s). I will add them as \${intent.status}, skip duplicates, and fetch metadata. Import these?\`,
          confirmLabel: 'Import Titles',
          action
        }
      ]);
      return;
    }

    if (intent.kind === 'singleAdd') {
      const action = { title: intent.title, status: intent.status, kind: 'singleAdd' };
      setPendingAction(action);
      setLog((current) => [
        ...current,
        {
          who: 'bot',
          type: 'confirmAction',
          title: '🍜 Ready to update your library',
          text: \`I will add or update “\${intent.title}” as \${intent.status} and fetch metadata. Continue?\`,
          confirmLabel: 'Do It',
          action
        }
      ]);
      return;
    }

    const result = await executeJoeAICommand({
      intent,
      anime,
      catalog,
      updateAnime,
      brain
    });

    setLog((current) => [...current, { who: 'bot', ...result }]);
  }

`;
  text = text.slice(0, askBlock.start) + replacement + text.slice(askBlock.end + 1);
  console.log('Replaced ask() with commandExecutor path for non-mutating commands.');
} else {
  console.warn('Could not find ask() block.');
}

fs.writeFileSync(file, text);
console.log('JoeAI commandExecutor module wired.');
