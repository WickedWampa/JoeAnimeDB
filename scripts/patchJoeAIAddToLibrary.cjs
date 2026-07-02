const fs = require('fs');

function replaceAssistantComponent() {
  const file = 'src/pages/PlaceholderPages.jsx';
  let text = fs.readFileSync(file, 'utf8');

  if (!text.includes("import { fetchMetadata } from '../services/metadata';")) {
    text = text.replace(
      "import { createAnimeBrain } from '../engine/animeBrain';",
      "import { createAnimeBrain } from '../engine/animeBrain'; import { fetchMetadata } from '../services/metadata';"
    );
  }

  const start = text.indexOf('export function Assistant');
  const end = text.indexOf('export function Analytics');

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Could not locate Assistant component boundaries.');
  }

  const nextAssistant = String.raw`export function Assistant({ anime, catalog = [], updateAnime }) {
  const brain = useMemo(() => createAnimeBrain(anime, catalog), [anime, catalog]);
  const [log, setLog] = useState([
    {
      who: 'bot',
      text: 'Anime DNA is online. Ask me about your top genres, studios, average score, rewatches, recommendations, catalog status, or a random pick.'
    }
  ]);
  const [text, setText] = useState('');
  const [addingId, setAddingId] = useState('');

  function isRecommendationQuestion(value) {
    const lower = String(value).toLowerCase();
    return lower.includes('recommend') || lower.includes('next') || lower.includes('watch') || lower.includes('new anime');
  }

  function animeId(item) {
    return String(item?.malId || item?.id || item?.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  async function addRecommendationToLibrary(item) {
    if (!updateAnime || !item?.title) return;

    const id = 'anime-' + animeId(item);
    setAddingId(id);

    try {
      const draft = {
        ...item,
        id,
        status: 'Watching',
        favorite: false,
        rewatches: 0,
        finalRank: anime.length + 1,
        joeScore: item.joeScore || '',
        notes: item.notes || 'Added from JoeAI recommendation.',
        addedFrom: 'JoeAI'
      };

      const enriched = await fetchMetadata(draft);
      await updateAnime(enriched);

      setLog((current) => [
        ...current,
        {
          who: 'bot',
          type: 'text',
          text: 'Added ' + item.title + ' to your library and fetched its metadata. Your Anime DNA is already getting smarter.'
        }
      ]);
    } catch (error) {
      console.warn('JoeAI add-to-library failed:', item.title, error);

      try {
        await updateAnime({
          ...item,
          id,
          status: 'Watching',
          favorite: false,
          rewatches: 0,
          finalRank: anime.length + 1,
          notes: item.notes || 'Added from JoeAI recommendation.',
          addedFrom: 'JoeAI'
        });

        setLog((current) => [
          ...current,
          {
            who: 'bot',
            type: 'text',
            text: 'Added ' + item.title + ' to your library. Metadata fetch failed, but Update Database can repair it later.'
          }
        ]);
      } catch (saveError) {
        console.warn('JoeAI save failed:', item.title, saveError);
        setLog((current) => [
          ...current,
          {
            who: 'bot',
            type: 'text',
            text: 'I could not add ' + item.title + ' yet. Check the console and we will fix the save path.'
          }
        ]);
      }
    } finally {
      setAddingId('');
    }
  }

  function ask() {
    const q = text.trim();
    if (!q) return;

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

      setLog((current) => [...current, { who: 'user', text: q }, { who: 'bot', ...answer }]);
      setText('');
      return;
    }

    const answer = brain.answer(q);
    setLog((current) => [...current, { who: 'user', text: q }, { who: 'bot', type: 'text', text: answer }]);
    setText('');
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
            <button type="button" onClick={() => addRecommendationToLibrary(item)} disabled={isAdding || !updateAnime}>
              {isAdding ? 'Adding...' : '+ Add to Library'}
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

      <div className="assistant-input">
        <input
          placeholder="Ask about your Anime DNA..."
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && ask()}
        />
        <button onClick={ask}>Ask</button>
      </div>
    </section>
  );
}

`;

  text = text.slice(0, start) + nextAssistant + text.slice(end);
  fs.writeFileSync(file, text);
  console.log('Updated Assistant with Add to Library + metadata fetch.');
}

function patchApp() {
  const file = 'src/App.jsx';
  let text = fs.readFileSync(file, 'utf8');

  if (text.includes('<Assistant anime={anime} catalog={catalog} />')) {
    text = text.replaceAll(
      '<Assistant anime={anime} catalog={catalog} />',
      '<Assistant anime={anime} catalog={catalog} updateAnime={handleUpdateAnime} />'
    );
  } else if (text.includes('<Assistant anime={anime} />')) {
    text = text.replaceAll(
      '<Assistant anime={anime} />',
      '<Assistant anime={anime} catalog={catalog} updateAnime={handleUpdateAnime} />'
    );
  }

  fs.writeFileSync(file, text);
  console.log('App now passes updateAnime into Assistant.');
}

replaceAssistantComponent();
patchApp();
