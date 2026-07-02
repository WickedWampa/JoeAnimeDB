const fs = require('fs');

const file = 'src/pages/PlaceholderPages.jsx';
let text = fs.readFileSync(file, 'utf8');

if (!text.includes("import { parseJoeAIIntent } from '../ai/intentParser';")) {
  text = text.replace(
    "import { fetchMetadata } from '../services/metadata';",
    "import { fetchMetadata } from '../services/metadata'; import { parseJoeAIIntent } from '../ai/intentParser';"
  );
}

// Replace the body of ask() with parser-driven logic.
const start = text.indexOf('  async function ask() {');
const end = text.indexOf('\n  function renderRecommendationCard', start);

if (start === -1 || end === -1 || end <= start) {
  throw new Error('Could not find ask() function boundaries.');
}

const newAsk = `  async function ask() {
    const q = text.trim();
    if (!q) return;

    setLog((current) => [...current, { who: 'user', type: 'text', text: q }]);
    setText('');

    const intent = parseJoeAIIntent(q);

    if (intent.kind === 'help') {
      setLog((current) => [...current, { who: 'bot', type: 'text', text: helpAnswer() }]);
      return;
    }

    if (intent.kind === 'stats') {
      setLog((current) => [...current, { who: 'bot', type: 'text', text: libraryStatsAnswer() }]);
      return;
    }

    if (intent.kind === 'watchingList') {
      setLog((current) => [...current, { who: 'bot', type: 'text', text: currentlyWatchingAnswer() }]);
      return;
    }

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

    if (intent.kind === 'recommendation') {
      const picks = brain.recommendations(5);
      const answer = picks.length
        ? {
            type: 'recommendations',
            title: '🍜 JoeAI Recommendations',
            subtitle: 'Based on your Anime DNA, these unseen catalog picks look strongest.',
            items: picks
          }
        : {
            type: 'text',
            text: brain.answer(q)
          };

      setLog((current) => [...current, { who: 'bot', ...answer }]);
      return;
    }

    const answer = brain.answer(q);
    setLog((current) => [...current, { who: 'bot', type: 'text', text: answer }]);
  }
`;

text = text.slice(0, start) + newAsk + text.slice(end);

fs.writeFileSync(file, text);
console.log('JoeAI now uses dedicated intent parser.');
