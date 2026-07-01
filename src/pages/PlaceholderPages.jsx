import React, { useMemo, useState } from 'react';
import { Poster } from '../components/Poster';
import { score, countBy } from '../utils/animeUtils';
import { exportBackup, resetData } from '../services/storage';
import { createAnimeBrain } from '../engine/animeBrain';

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

export function Assistant({ anime }) {
  const brain = useMemo(() => createAnimeBrain(anime), [anime]);
  const [log, setLog] = useState([{ who: 'bot', text: 'Anime DNA is online. Ask me about your top genres, studios, average score, rewatches, recommendations, or a random pick.' }]);
  const [text, setText] = useState('');

  function ask() {
    const q = text.trim();
    if (!q) return;
    const answer = brain.answer(q);
    setLog((current) => [...current, { who: 'user', text: q }, { who: 'bot', text: answer }]);
    setText('');
  }

  return (
    <section className="assistant">
      <div className="chatLog">
        {log.map((m, i) => <div key={i} className={m.who}>{m.text}</div>)}
      </div>
      <div className="chatInput">
        <input value={text} placeholder="Ask about your Anime DNA..." onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()} />
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
