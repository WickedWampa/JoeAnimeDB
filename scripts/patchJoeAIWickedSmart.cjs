const fs = require('fs');

const file = 'src/pages/PlaceholderPages.jsx';
let text = fs.readFileSync(file, 'utf8');

const start = text.indexOf('export function Assistant');
const end = text.indexOf('export function Analytics');

if (start === -1 || end === -1 || end <= start) {
  throw new Error('Could not find Assistant component boundaries.');
}

const assistant = String.raw`export function Assistant({ anime, catalog = [], updateAnime }) {
  const brain = useMemo(() => createAnimeBrain(anime, catalog), [anime, catalog]);
  const [log, setLog] = useState([
    {
      who: 'bot',
      type: 'text',
      text: 'JoeAI is online. I can recommend anime, explain your Anime DNA, add titles, bulk import lists, and answer questions about your library.'
    }
  ]);
  const [text, setText] = useState('');
  const [addingId, setAddingId] = useState('');

  function animeId(item) {
    return String(item?.malId || item?.id || item?.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  function isRecommendationQuestion(value) {
    const lower = String(value).toLowerCase();
    return lower.includes('recommend') || lower.includes('next') || lower.includes('watch') || lower.includes('new anime');
  }

  function parseStatus(value = '') {
    const lower = String(value).toLowerCase();

    if (lower.includes('completed') || lower.includes('finished') || lower.includes('watched')) return 'Completed';
    if (lower.includes('plan') || lower.includes('planned')) return 'Plan to Watch';
    if (lower.includes('hold')) return 'On Hold';
    if (lower.includes('dropped')) return 'Dropped';
    return 'Watching';
  }

  function parseTitleFromNaturalCommand(value = '') {
    const raw = String(value).trim();
    const lower = raw.toLowerCase();
    const status = parseStatus(raw);

    const patterns = [
      /^add\s+(.+?)(?:\s+as\s+(?:completed|watched|watching|planned|plan to watch|dropped|on hold))?$/i,
      /^i(?:'| a)?m watching\s+(.+)$/i,
      /^i started\s+(.+)$/i,
      /^started\s+(.+)$/i,
      /^i finished\s+(.+)$/i,
      /^finished\s+(.+)$/i,
      /^i completed\s+(.+)$/i,
      /^completed\s+(.+)$/i,
      /^mark\s+(.+?)\s+as\s+(?:completed|watched|watching|planned|plan to watch|dropped|on hold)$/i
    ];

    for (const pattern of patterns) {
      const match = raw.match(pattern);
      if (match?.[1]) {
        let title = match[1].trim();
        title = title.replace(/\s+as\s+(completed|watched|watching|planned|plan to watch|dropped|on hold)$/i, '').trim();
        title = title.replace(/\s+to\s+(?:my\s+)?library$/i, '').trim();
        if (title) return { title, status };
      }
    }

    return null;
  }

  function parseBulkCommand(value = '') {
    const raw = String(value).trim();
    const lower = raw.toLowerCase();

    const startsBulk =
      lower.startsWith('add these') ||
      lower.startsWith('import these') ||
      lower.startsWith('bulk add') ||
      lower.startsWith('add list') ||
      lower.startsWith('import list');

    if (!startsBulk) return null;

    const status = parseStatus(raw);
    const afterColon = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw.replace(/^(add these|import these|bulk add|add list|import list)/i, '');
    const titles = afterColon
      .split(/\r?\n|,/)
      .map((line) => line.trim())
      .filter(Boolean);

    return titles.length ? { titles: [...new Set(titles)], status } : null;
  }

  function libraryStatsAnswer() {
    const total = anime.length;
    const completed = anime.filter((item) => String(item.status).toLowerCase() === 'completed').length;
    const watching = anime.filter((item) => String(item.status).toLowerCase() === 'watching').length;
    const favorites = anime.filter((item) => item.favorite).length;
    const catalogTotal = catalog.length;

    return [
      '🍜 Library status:',
      '',
      `• ${total} titles in your library`,
      `• ${completed} completed`,
      `• ${watching} currently watching`,
      `• ${favorites} favorites`,
      `• ${catalogTotal} catalog titles available for recommendations`
    ].join('\n');
  }

  function currentlyWatchingAnswer() {
    const watching = anime
      .filter((item) => String(item.status).toLowerCase() === 'watching')
      .slice(0, 12);

    if (!watching.length) return 'Nothing is marked Watching right now. Tell me “I’m watching Magi” and I’ll add it.';

    return [
      'You are currently watching:',
      '',
      ...watching.map((item) => `• ${item.title}${item.episodeCount ? ` (${item.episodeCount} eps)` : ''}`)
    ].join('\n');
  }

  function helpAnswer() {
    return [
      '🍜 JoeAI command examples:',
      '',
      '• what should I watch next?',
      '• explain my Anime DNA',
      '• what are my top genres?',
      '• what studio do I watch most?',
      '• what am I watching?',
      '• add Frieren as completed',
      '• I’m watching Magi',
      '• I finished World Trigger',
      '• add these as completed: Bleach, Naruto, One Piece',
      '',
      'I can add titles, fetch metadata, skip duplicates, update existing entries, and recommend anime from your catalog.'
    ].join('\n');
  }

  async function addAnimeToLibrary(input) {
    if (!updateAnime || !input?.title) return;

    const id = 'anime-' + animeId(input);
    setAddingId(id);

    try {
      const result = await importAnimeByTitle({
        title: input.title,
        status: input.status || 'Watching',
        library: anime
      });

      if (result.duplicate) {
        const merged = mergeAnimeMetadata(
          result.duplicate,
          result.candidate,
          input.status || result.duplicate.status
        );

        await updateAnime(merged);

        setLog((current) => [
          ...current,
          {
            who: 'bot',
            type: 'text',
            text: 'Updated existing entry: ' + result.duplicate.title + ' → ' + (merged.officialTitle || merged.title) + '. No duplicate added.'
          }
        ]);
        return;
      }

      const nextAnime = {
        ...result.candidate,
        finalRank: anime.length + 1,
        addedFrom: 'JoeAI'
      };

      await updateAnime(nextAnime);

      setLog((current) => [
        ...current,
        {
          who: 'bot',
          type: 'text',
          text: 'Added ' + (nextAnime.officialTitle || nextAnime.title) + ' to your library as ' + nextAnime.status + ' and fetched metadata.'
        }
      ]);
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

  async function bulkAddFromChat(command) {
    const added = [];
    const skipped = [];
    const failed = [];

    let liveLibrary = [...anime];

    for (const title of command.titles) {
      try {
        const result = await importAnimeByTitle({
          title,
          status: command.status,
          library: liveLibrary
        });

        if (result.duplicate) {
          skipped.push(`${title} → already in library as ${result.duplicate.title}`);
          continue;
        }

        const nextAnime = {
          ...result.candidate,
          finalRank: liveLibrary.length + 1,
          addedFrom: 'JoeAI bulk import'
        };

        const saved = await updateAnime(nextAnime);
        liveLibrary = saved.anime || [...liveLibrary, nextAnime];
        added.push(nextAnime.title);
      } catch (error) {
        console.warn('JoeAI bulk add failed:', title, error);
        failed.push(title);
      }

      await new Promise((resolve) => setTimeout(resolve, 750));
    }

    const answer = [
      '🍜 Bulk import complete.',
      '',
      `Added: ${added.length}`,
      `Skipped duplicates: ${skipped.length}`,
      `Failed: ${failed.length}`,
      '',
      added.length ? 'Added:\n' + added.map((title) => `✓ ${title}`).join('\n') : '',
      skipped.length ? '\nSkipped:\n' + skipped.map((title) => `• ${title}`).join('\n') : '',
      failed.length ? '\nFailed:\n' + failed.map((title) => `✗ ${title}`).join('\n') : ''
    ].filter(Boolean).join('\n');

    setLog((current) => [...current, { who: 'bot', type: 'text', text: answer }]);
  }

  async function ask() {
    const q = text.trim();
    if (!q) return;

    setLog((current) => [...current, { who: 'user', type: 'text', text: q }]);
    setText('');

    const bulkCommand = parseBulkCommand(q);
    if (bulkCommand) {
      await bulkAddFromChat(bulkCommand);
      return;
    }

    const addCommand = parseTitleFromNaturalCommand(q);
    if (addCommand) {
      await addAnimeToLibrary(addCommand);
      return;
    }

    const lower = q.toLowerCase();

    if (lower.includes('help') || lower.includes('what can you do')) {
      setLog((current) => [...current, { who: 'bot', type: 'text', text: helpAnswer() }]);
      return;
    }

    if (lower.includes('library status') || lower.includes('stats') || lower.includes('how many')) {
      setLog((current) => [...current, { who: 'bot', type: 'text', text: libraryStatsAnswer() }]);
      return;
    }

    if (lower.includes('what am i watching') || lower.includes('currently watching')) {
      setLog((current) => [...current, { who: 'bot', type: 'text', text: currentlyWatchingAnswer() }]);
      return;
    }

    if (isRecommendationQuestion(q)) {
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

  function renderRecommendationCard(item, index) {
    const id = 'anime-' + animeId(item);
    const isAdding = addingId === id;

    return (
      <article className="joeaiRecCard" key={item.title + '-' + index}>
        <Poster anime={item} className="joeaiRecPoster" mode="thumb" />
        <div className="joeaiRecBody">
          <div className="joeaiRecTopline">
            <span className="joeaiRecRank">#{index + 1}</span>
            <span className="joeaiMatchBadge">{item.match}%</span>
            <span className="joeaiMatchLabel">{item.matchLabel || 'Match'}</span>
          </div>

          <h3>{item.title}</h3>

          <div className="joeaiRecMeta">
            {item.year && <span>{item.year}</span>}
            {item.episodes && <span>{item.episodes} eps</span>}
            {item.studio && <span>{item.studio}</span>}
            {!item.metadataReady && <span>metadata pending</span>}
          </div>

          {item.reasons?.length > 0 && (
            <div className="joeaiReasonList">
              <strong>Why JoeAI picked it</strong>
              {item.reasons.map((reason) => (
                <span key={reason}>✓ {reason}</span>
              ))}
            </div>
          )}

          <div className="joeaiRecActions">
            <button type="button" onClick={() => addAnimeToLibrary({ title: item.title, status: 'Watching' })} disabled={isAdding || !updateAnime}>
              {isAdding ? 'Adding...' : '+ Add to Library'}
            </button>
            <button type="button" onClick={() => addAnimeToLibrary({ title: item.title, status: 'Completed' })} disabled={isAdding || !updateAnime}>
              Mark Completed
            </button>
          </div>
        </div>
      </article>
    );
  }

  function renderMessage(message, index) {
    if (message.type === 'recommendations') {
      return (
        <div key={index} className="chat bot joeaiRecommendations">
          <div className="joeaiRecHeader">
            <h2>{message.title}</h2>
            <p>{message.subtitle}</p>
          </div>
          <div className="joeaiRecGrid">
            {message.items.map((item, itemIndex) => renderRecommendationCard(item, itemIndex))}
          </div>
        </div>
      );
    }

    return (
      <div key={index} className={'chat ' + message.who}>
        {message.text}
      </div>
    );
  }

  return (
    <section className="panel assistant-page">
      <div className="assistant-log">
        {log.map((message, index) => renderMessage(message, index))}
      </div>

      <div className="assistant-input joeaiChatInput">
        <textarea
          placeholder={'Ask JoeAI... try: add Frieren as completed\\nOr: add these as completed: Bleach, Naruto, One Piece'}
          value={text}
          rows={2}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              ask();
            }
          }}
        />
        <button onClick={ask}>Ask</button>
      </div>
    </section>
  );
}

`;

text = text.slice(0, start) + assistant + text.slice(end);
fs.writeFileSync(file, text);

console.log('JoeAI upgraded with natural chat commands, bulk import chat, stats, watching list, and textarea input.');
