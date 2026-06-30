import React, { useState } from 'react';
import { Poster } from '../components/Poster';
import { score, countBy } from '../utils/animeUtils';
import { exportBackup, resetData } from '../services/storage';

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
  const [log, setLog] = useState([{ who: 'bot', text: 'Ask me what to watch next, your top studio, or for a random pick.' }]);
  const [text, setText] = useState('');

  function ask() {
    const q = text.trim();
    if (!q) return;
    const lower = q.toLowerCase();
    let answer = 'Try asking for a recommendation, top studio, watch time, or random anime.';
    if (lower.includes('recommend') || lower.includes('next')) {
      const picks = anime.filter((a) => Number(a.finalRank) > 20 && score(a) >= 8.6).slice(0, 5);
      answer = `Try ${picks.map((p) => p.title).join(', ')}.`;
    } else if (lower.includes('studio')) {
      const top = countBy(anime.map((a) => a.studio))[0];
      answer = `Your most represented studio is ${top[0]} with ${top[1]} titles.`;
    } else if (lower.includes('random')) {
      const pick = anime[Math.floor(Math.random() * anime.length)];
      answer = `Random pick: ${pick.title}, rank #${pick.finalRank}, Joe score ${score(pick).toFixed(1)}.`;
    } else if (lower.includes('bleach')) {
      answer = 'Bleach is GOAT. Shrine status: mandatory.';
    }
    setLog([...log, { who: 'user', text: q }, { who: 'bot', text: answer }]);
    setText('');
  }

  return (
    <section className="assistant">
      <div className="chatLog">
        {log.map((m, i) => <div key={i} className={m.who}>{m.text}</div>)}
      </div>
      <div className="chatInput">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()} />
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
