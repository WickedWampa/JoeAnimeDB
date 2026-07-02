const fs = require('fs');

function replaceAssistantComponent() {
  const file = 'src/pages/PlaceholderPages.jsx';
  let text = fs.readFileSync(file, 'utf8');

  const start = text.indexOf('export function Assistant');
  const end = text.indexOf('export function Analytics');

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Could not locate Assistant component boundaries.');
  }

  const nextAssistant = String.raw`export function Assistant({ anime, catalog = [] }) {
  const brain = useMemo(() => createAnimeBrain(anime, catalog), [anime, catalog]);
  const [log, setLog] = useState([
    {
      who: 'bot',
      text: 'Anime DNA is online. Ask me about your top genres, studios, average score, rewatches, recommendations, catalog status, or a random pick.'
    }
  ]);
  const [text, setText] = useState('');

  function isRecommendationQuestion(value) {
    const lower = String(value).toLowerCase();
    return lower.includes('recommend') || lower.includes('next') || lower.includes('watch') || lower.includes('new anime');
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
  console.log('Replaced Assistant with recommendation card UI.');
}

function importCss() {
  const file = 'src/App.jsx';
  const importLine = "import './styles/joeai-cards.css';";
  let text = fs.readFileSync(file, 'utf8');

  if (!text.includes(importLine)) {
    text = importLine + '\n' + text;
    console.log('Added joeai-cards.css import.');
  }

  if (text.includes('<Assistant anime={anime} />')) {
    text = text.replaceAll('<Assistant anime={anime} />', '<Assistant anime={anime} catalog={catalog} />');
    console.log('Ensured Assistant receives catalog.');
  }

  fs.writeFileSync(file, text);
}

replaceAssistantComponent();
importCss();
