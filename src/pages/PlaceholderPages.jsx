import React, { useMemo, useState } from 'react';
import { Poster } from '../components/Poster';
import { score, countBy } from '../utils/animeUtils';
import { exportBackup, resetData } from '../services/storage';
import { createAnimeBrain } from '../engine/animeBrain'; import { fetchMetadata } from '../services/metadata'; import { importAnimeByTitle, mergeAnimeMetadata } from '../services/animeImporter';

export function Universe({ anime, setQuery, setView }) {
  const studios = countBy(anime.map((item) => item.studio)).slice(0, 10);
  const genres = countBy(anime.flatMap((item) => item.genres || [])).slice(0, 10);
  const jump = (term) => {
    setQuery(term);
    setView('library');
  };

  return (
    <section className="grid2">
      <div className="universeCore">
        <h1>Joe</h1>
        <p>{anime.length} anime connected by studios, genres, rankings, and rewatches.</p>
      </div>
      <div className="panel">
        <h2>Studios</h2>
        {studios.map(([name, count]) => <button className="branch" key={name} onClick={() => jump(name)}>{name}<span>{count}</span></button>)}
      </div>
      <div className="panel">
        <h2>Genres</h2>
        {genres.map(([name, count]) => <button className="branch" key={name} onClick={() => jump(name)}>{name}<span>{count}</span></button>)}
      </div>
    </section>
  );
}

export function Assistant({ anime, catalog = [], updateAnime }) {
  const brain = useMemo(() => createAnimeBrain(anime, catalog), [anime, catalog]);
  const [log, setLog] = useState([
    {
      who: 'bot',
      type: 'text',
      text: 'Anime DNA is online. Ask me for recommendations, catalog status, or say: add World Trigger as completed.'
    }
  ]);
  const [text, setText] = useState('');
  const [addingId, setAddingId] = useState('');

  function titleKey(title = '') {
    return String(title).toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function animeId(item) {
    return String(item?.malId || item?.id || item?.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  function parseAddCommand(value) {
    const raw = String(value).trim();
    const lower = raw.toLowerCase();

    if (!lower.startsWith('add ')) return null;

    let title = raw.replace(/^add\s+/i, '').trim();
    let status = 'Watching';

    const statusPatterns = [
      { regex: /\s+as\s+completed$/i, status: 'Completed' },
      { regex: /\s+as\s+watched$/i, status: 'Completed' },
      { regex: /\s+as\s+watching$/i, status: 'Watching' },
      { regex: /\s+as\s+planned$/i, status: 'Plan to Watch' },
      { regex: /\s+to\s+library$/i, status: 'Watching' },
      { regex: /\s+to\s+my\s+library$/i, status: 'Watching' }
    ];

    for (const pattern of statusPatterns) {
      if (pattern.regex.test(title)) {
        title = title.replace(pattern.regex, '').trim();
        status = pattern.status;
        break;
      }
    }

    if (!title) return null;

    return { title, status };
  }

  function findCatalogTitle(title) {
    const wanted = titleKey(title);
    return catalog.find((item) => titleKey(item.title) === wanted)
      || catalog.find((item) => titleKey(item.title).includes(wanted) || wanted.includes(titleKey(item.title)))
      || null;
  }

  async function addAnimeToLibrary(input) {
    if (!updateAnime || !input?.title) return;

    const catalogMatch = findCatalogTitle(input.title);
    const base = catalogMatch || { title: input.title };
    const id = 'anime-' + animeId(base);
    setAddingId(id);

    try {
      const draft = {
        ...base,
        id,
        status: input.status || 'Watching',
        favorite: false,
        rewatches: 0,
        finalRank: anime.length + 1,
        joeScore: base.joeScore || '',
        notes: base.notes || 'Added from JoeAI.',
        addedFrom: 'JoeAI'
      };

      const enriched = await fetchMetadata(draft);
      await updateAnime(enriched);

      setLog((current) => [
        ...current,
        {
          who: 'bot',
          type: 'text',
          text: 'Added ' + (enriched.officialTitle || enriched.title) + ' to your library as ' + draft.status + ' and fetched metadata.'
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

  function isRecommendationQuestion(value) {
    const lower = String(value).toLowerCase();
    return lower.includes('recommend') || lower.includes('next') || lower.includes('watch') || lower.includes('new anime');
  }

  async function ask() {
    const q = text.trim();
    if (!q) return;

    const addCommand = parseAddCommand(q);
    if (addCommand) {
      setLog((current) => [...current, { who: 'user', type: 'text', text: q }]);
      setText('');
      await addAnimeToLibrary(addCommand);
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

      setLog((current) => [...current, { who: 'user', type: 'text', text: q }, { who: 'bot', ...answer }]);
      setText('');
      return;
    }

    const answer = brain.answer(q);
    setLog((current) => [...current, { who: 'user', type: 'text', text: q }, { who: 'bot', type: 'text', text: answer }]);
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

      <div className="assistant-input">
        <input
          placeholder="Ask JoeAI... try: add World Trigger as completed"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && ask()}
        />
        <button onClick={ask}>Ask</button>
      </div>
    </section>
  );
}

export function Analytics({ anime }) {
  const studios = countBy(anime.map((item) => item.studio)).slice(0, 12);
  const genres = countBy(anime.flatMap((item) => item.genres || [])).slice(0, 12);
  return (
    <section className="grid2">
      <BarPanel title="Studios" data={studios} />
      <BarPanel title="Genres" data={genres} />
    </section>
  );
}

function BarPanel({ title, data }) {
  const max = data[0]?.[1] || 1;
  return (
    <div className="panel">
      <h2>{title}</h2>
      {data.map(([name, count]) => (
        <div className="barRow" key={name}>
          <strong>{name}</strong>
          <div className="bar"><div style={{ width: `${(count / max) * 100}%` }} /></div>
          <span>{count}</span>
        </div>
      ))}
    </div>
  );
}

export function Timeline({ anime, setSelected }) {
  const top = [...anime].sort((a, b) => Number(a.finalRank) - Number(b.finalRank)).slice(0, 18);
  return (
    <section className="panel">
      <h2>Timeline</h2>
      <div className="timelineCards">
        {top.map((item) => (
          <button className="timelineItem" key={item.id} onClick={() => setSelected(item)}>
            <Poster anime={item} className="thumb" />
            <strong>{item.title}</strong>
            <span>#{item.finalRank}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function BleachShrine({ anime, setSelected }) {
  const bleach = anime.find((item) => item.title === 'Bleach');
  const tybw = anime.find((item) => item.title === 'Bleach TYBW');
  return (
    <section className="shrine">
      <h1>BLEACH</h1>
      <p>GOAT status. Arcs, captains, openings, fights, and TYBW tracker live here.</p>
      <div className="shrineStats">
        <div><strong>#{bleach?.finalRank || 1}</strong><span>All-time</span></div>
        <div><strong>{bleach?.rewatches || 5}x</strong><span>Rewatches</span></div>
        <div><strong>{score(tybw || {}).toFixed(1)}</strong><span>TYBW</span></div>
      </div>
      <button onClick={() => bleach && setSelected(bleach)}>Open Bleach</button>
    </section>
  );
}

export function SettingsPage({ data, syncMetadata }) {
  return (
    <section className="panel">
      <h2>Settings</h2>
      <p>Backups, metadata sync, and database tools.</p>
      <div className="settingsActions">
        <button onClick={() => exportBackup(data)}>Export Backup</button>
        <button onClick={syncMetadata}>Update Database</button>
        <button onClick={resetData}>Reset Local Data</button>
      </div>
    </section>
  );
}
