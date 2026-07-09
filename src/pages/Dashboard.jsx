import React from 'react';
import '../styles/joeai-home-v3.css';
import { Poster } from '../components/Poster';
import { countBy } from '../utils/animeUtils';

function normalizeStatus(status = '') {
  return String(status || '').toLowerCase().replace(/\s+/g, '');
}

function titleOf(item = {}) {
  return item.officialTitle || item.title || 'Unknown title';
}

function myScore(item = {}) {
  const value = Number(item.joeScore ?? item.score ?? item.finalScore ?? item.rating ?? 0);
  return Number.isFinite(value) && value > 0 ? value.toFixed(1) : '—';
}

function initials(title = '') {
  return String(title || 'AN')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function pct(value = 0, max = 1) {
  if (!max) return 0;
  return Math.max(4, Math.min(100, Math.round((Number(value || 0) / Number(max || 1)) * 100)));
}

function MiniPoster({ anime, className = '' }) {
  if (!anime) return <div className={`homeV3Poster ${className}`}>?</div>;
  return (
    <div className={`homeV3Poster ${className}`}>
      <Poster anime={anime} mode="thumb" />
      <span>{initials(titleOf(anime))}</span>
    </div>
  );
}

function StatPill({ icon, value, label }) {
  return (
    <div className="homeV3StatPill">
      <span className="homeV3StatIcon">{icon}</span>
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
  );
}

function Panel({ className = '', icon, title, action, onAction, children }) {
  return (
    <section className={`homeV3Panel ${className}`}>
      <div className="homeV3PanelHeader">
        <h2>{icon && <span>{icon}</span>}{title}</h2>
        {action && <button type="button" onClick={onAction}>{action}</button>}
      </div>
      {children}
    </section>
  );
}

function SignalRow({ label, value, max }) {
  return (
    <button type="button" className="homeV3SignalRow">
      <span>{label}</span>
      <div className="homeV3SignalBar"><i style={{ width: `${pct(value, max)}%` }} /></div>
      <strong>{value}</strong>
    </button>
  );
}

function MiniAnimeRow({ anime, setSelected }) {
  return (
    <button className="homeV3MiniAnime" type="button" onClick={() => setSelected?.(anime)}>
      <MiniPoster anime={anime} />
      <span>
        <strong>{titleOf(anime)}</strong>
        <small>{anime.status || 'Ready'} · ★ {myScore(anime)}</small>
      </span>
    </button>
  );
}

function AnchorCard({ anime, setSelected }) {
  return (
    <button className="homeV3Anchor" type="button" onClick={() => setSelected?.(anime)}>
      <MiniPoster anime={anime} />
      <span>
        <strong>{titleOf(anime)}</strong>
        <small>{Number(anime.rewatches || 0) > 0 ? `${anime.rewatches}x rewatch` : 'favorite'}</small>
      </span>
    </button>
  );
}

function PromptButton({ text, setView }) {
  return (
    <button className="homeV3Prompt" type="button" onClick={() => setView?.('assistant')}>
      <span>{text}</span>
      <b>›</b>
    </button>
  );
}

export function StatStrip({ stats, anime }) {
  const completed = anime.filter((item) => normalizeStatus(item.status) === 'completed').length;
  const watching = anime.filter((item) => normalizeStatus(item.status) === 'watching').length;
  const rewatches = anime.reduce((sum, item) => sum + Number(item.rewatches || 0), 0);

  return (
    <section className="homeV3StatsInline">
      <StatPill icon="▤" value={stats?.total ?? anime.length} label="Anime" />
      <StatPill icon="✓" value={completed} label="Completed" />
      <StatPill icon="↻" value={rewatches} label="Rewatches" />
      <StatPill icon="★" value={stats?.avg ?? '—'} label="Average" />
      <StatPill icon="▶" value={watching} label="Watching" />
    </section>
  );
}

export function Dashboard({ anime = [], stats = {}, setSelected, updateAnime, setView }) {
  const completed = anime.filter((item) => normalizeStatus(item.status) === 'completed').length;
  const watching = anime.filter((item) => normalizeStatus(item.status) === 'watching');
  const rewatches = anime.reduce((sum, item) => sum + Number(item.rewatches || 0), 0);
  const favorites = anime.filter((item) => Boolean(item.favorite));
  const anchors = [...anime]
    .filter((item) => Number(item.rewatches || 0) > 0 || item.favorite)
    .sort((a, b) => Number(b.rewatches || 0) - Number(a.rewatches || 0) || Number(b.joeScore || 0) - Number(a.joeScore || 0))
    .slice(0, 4);

  const ranked = [...anime]
    .sort((a, b) => Number(a.finalRank || 99999) - Number(b.finalRank || 99999));

  const tonight = watching[0] || ranked.find((item) => normalizeStatus(item.status) !== 'completed') || ranked[0];
  const topSignalRows = countBy(anime.flatMap((item) => item.genres || [])).slice(0, 5);
  const studioRows = countBy(anime.map((item) => item.studio)).slice(0, 4);
  const topMax = topSignalRows[0]?.[1] || 1;
  const studioMax = studioRows[0]?.[1] || 1;
  const topSignal = topSignalRows[0]?.[0] || 'Worldbuilding';

  const statAvg = stats?.avg ?? (() => {
    const rated = anime.filter((item) => Number(item.joeScore || item.score || item.finalScore || item.rating || 0) > 0);
    if (!rated.length) return '—';
    return (rated.reduce((sum, item) => sum + Number(item.joeScore || item.score || item.finalScore || item.rating || 0), 0) / rated.length).toFixed(2);
  })();

  return (
    <section className="homeV3">
      <section className="homeV3Hero">
        <div className="homeV3HeroShade" />
        <div className="homeV3HeroFx" aria-hidden="true">
          <span className="fx fx1" />
          <span className="fx fx2" />
          <span className="fx fx3" />
          <span className="fx fx4" />
          <span className="fx fx5" />
          <span className="fx fx6" />
        </div>
        <div className="homeV3HeroCopy">
          <p className="homeV3Eyebrow">Welcome back,</p>
          <h1>Joe.</h1>
          <p className="homeV3Lead">
            JoeAI analyzed your library and found new recommendation patterns.
          </p>
          <div className="homeV3HeroActions">
            <button type="button" className="primary" onClick={() => setView?.('assistant')}>🧠 Ask JoeAI</button>
            <button type="button" onClick={() => setView?.('library')}>📖 Open Library</button>
          </div>
        </div>

        <div className="homeV3HeroStats">
          <StatPill icon="▤" value={stats?.total ?? anime.length} label="Anime" />
          <StatPill icon="✓" value={completed} label="Completed" />
          <StatPill icon="↻" value={rewatches} label="Rewatches" />
          <StatPill icon="★" value={statAvg} label="Average" />
        </div>
      </section>

      <section className="homeV3Grid">
        <Panel className="homeV3Thought" icon="🧠" title="JoeAI Thought" action="Ask" onAction={() => setView?.('assistant')}>
          <div className="homeV3ThoughtInner">
            <div>
              <p><strong>{topSignal}</strong> is leading your Anime DNA today.</p>
              <p className="homeV3ThoughtSub">Ask JoeAI to explain the full pattern.</p>
            </div>
            <div className="homeV3BrainPulse" aria-hidden="true">🧠</div>
          </div>
        </Panel>

        <Panel className="homeV3QuickAsk" icon="⚡" title="Quick Ask" action="Open" onAction={() => setView?.('assistant')}>
          <div className="homeV3PromptList">
            <PromptButton text="recommend something like Slime" setView={setView} />
            <PromptButton text="what should I watch next?" setView={setView} />
            <PromptButton text="why do I like Bleach?" setView={setView} />
            <PromptButton text="what changed recently?" setView={setView} />
          </div>
        </Panel>

        <Panel className="homeV3DNA" icon="🧬" title="Anime DNA" action="Stats" onAction={() => setView?.('analytics')}>
          <div className="homeV3SignalRows">
            {topSignalRows.length ? topSignalRows.map(([name, count]) => (
              <SignalRow key={name} label={name} value={count} max={topMax} />
            )) : <p className="homeV3Empty">Add more anime to build your Anime DNA.</p>}
          </div>
        </Panel>

        <Panel className="homeV3Comfort" icon="❤️" title="Comfort Anchors" action="Favorites" onAction={() => setView?.('favorites')}>
          <div className="homeV3AnchorGrid">
            {(anchors.length ? anchors : favorites.slice(0, 4)).map((item) => (
              <AnchorCard key={item.id || item.title} anime={item} setSelected={setSelected} />
            ))}
            {!anchors.length && !favorites.length && <p className="homeV3Empty">Mark favorites or rewatches to teach JoeAI your comfort core.</p>}
          </div>
        </Panel>

        <Panel className="homeV3Studio" icon="🎬" title="Studio DNA" action="Explore" onAction={() => setView?.('analytics')}>
          <div className="homeV3StudioRows">
            {studioRows.length ? studioRows.map(([name, count]) => (
              <button key={name} type="button" className="homeV3StudioRow">
                <span>{name}</span>
                <strong>{count}</strong>
                <i style={{ width: `${pct(count, studioMax)}%` }} />
              </button>
            )) : <p className="homeV3Empty">Studio patterns will appear after metadata sync.</p>}
          </div>
        </Panel>

        <Panel className="homeV3Seed" icon="⭐" title="Tonight's Recommendation" action="Get Rec" onAction={() => setView?.('assistant')}>
          {tonight ? (
            <div className="homeV3SeedCard">
              <MiniPoster anime={tonight} className="large" />
              <div>
                <h3>{titleOf(tonight)}</h3>
                <p><strong>78% Match</strong></p>
                <div className="homeV3SeedTags">
                  {(tonight.genres || ['Action', 'Adventure']).slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
                </div>
                <small>You loved the journey, the momentum, and the emotional payoff. This one should hit nearby notes.</small>
              </div>
              <div className="homeV3SeedActions">
                <button type="button" onClick={() => setView?.('assistant')}>Why this?</button>
                <button type="button" className="primary" onClick={() => setSelected?.(tonight)}>Open</button>
              </div>
            </div>
          ) : <p className="homeV3Empty">Add a few titles and JoeAI will pick something for tonight.</p>}
        </Panel>

        <Panel className="homeV3Continue" icon="▶" title="Continue Watching" action="Library" onAction={() => setView?.('library')}>
          <div className="homeV3MiniList">
            {watching.slice(0, 3).map((item) => <MiniAnimeRow key={item.id || item.title} anime={item} setSelected={setSelected} />)}
            {!watching.length && <p className="homeV3Empty">Nothing marked Watching yet.</p>}
          </div>
        </Panel>

        <Panel className="homeV3Learning" icon="📈" title="Recently Learned" action="View All" onAction={() => setView?.('assistant')}>
          <div className="homeV3LearningGrid">
            <div><span>↗</span><strong>{topSignal}</strong><small>strongest current signal</small></div>
            <div><span>↻</span><strong>{rewatches}</strong><small>rewatches reinforcing comfort</small></div>
            <div><span>▣</span><strong>{studioRows[0]?.[0] || 'Studio DNA'}</strong><small>top studio pattern</small></div>
            <div><span>✓</span><strong>{completed}</strong><small>completed anime analyzed</small></div>
          </div>
        </Panel>
      </section>
    </section>
  );
}
