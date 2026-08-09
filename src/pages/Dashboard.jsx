import React, { useState } from 'react';
import '../styles/joeai-home-v3.css';
import '../styles/joeai-home-v3-guide.css';
import { Poster } from '../components/Poster';
import { countBy } from '../utils/animeUtils';
import joeAIHologramBrain from '../assets/joeai-hologram-brain.png';
import '../styles/joeai-brain-hologram.css';

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

function HomeEmptyState({ title, body, action, onAction }) {
  return (
    <div className="homeV3EmptyState">
      <strong>{title}</strong>
      <p>{body}</p>
      {action && (
        <button type="button" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}

function SignalRow({ label, value, max, onClick }) {
  return (
    <button
      type="button"
      className="homeV3SignalRow"
      onClick={onClick}
      title={`Open ${value} ${label} title${Number(value) === 1 ? '' : 's'}`}
      aria-label={`Open ${value} ${label} titles`}
    >
      <span>{label}</span>
      <div className="homeV3SignalBar">
        <i style={{ '--signal-width': `${pct(value, max)}%` }} />
      </div>
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
  const rewatches = Number(anime.rewatches || 0);
  const rating = myScore(anime);

  return (
    <button
      className="homeV3Anchor"
      type="button"
      onClick={() => setSelected?.(anime)}
      title={`Open ${titleOf(anime)}`}
    >
      <MiniPoster anime={anime} />
      <span className="homeV3AnchorCopy">
        <strong>{titleOf(anime)}</strong>
        <small>{rewatches > 0 ? `${rewatches}x rewatch` : 'favorite'}</small>
        <span className="homeV3AnchorReveal">
          <b>★ {rating}</b>
          {rewatches > 0 && <b>↻ {rewatches}</b>}
        </span>
      </span>
    </button>
  );
}

function PromptButton({ text, onAsk }) {
  return (
    <button className="homeV3Prompt" type="button" onClick={() => onAsk?.(text)}>
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

export function Dashboard({
  anime = [],
  stats = {},
  setSelected,
  updateAnime,
  setView,
  onQuickAsk,
  onOpenFilter,
  displayName = 'Anime Fan'
}) {
  const [showJoeAIGuide, setShowJoeAIGuide] = useState(false);

  function sendQuickAsk(prompt) {
    const cleanPrompt = String(prompt || '').trim();
    if (!cleanPrompt) return;

    // Persist the prompt before navigating so JoeAI can consume it even when
    // the parent view router does not currently pass onQuickAsk through.
    try {
      localStorage.setItem('joeanime-pending-joeai-prompt', cleanPrompt);
    } catch (error) {
      console.warn('Could not store JoeAI Quick Ask prompt:', error);
    }

    onQuickAsk?.(cleanPrompt);
    setView?.('assistant');
  }
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

  const topStudio = studioRows[0]?.[0] || 'your favorite studios';
  const topStudioCount = studioRows[0]?.[1] || 0;
  const anchorCount = anchors.length || favorites.length;

  const heroState =
    completed === 0
      ? {
          eyebrow: 'Welcome,',
          headline: "Let's build your Anime DNA.",
          body: 'JoeAI learns from every anime you complete, rate, favorite, and rewatch. Add your first titles to unlock personalized recommendations.',
          primaryLabel: '✨ Add Anime',
          primaryAction: () => setView?.('library'),
          secondaryLabel: '🤖 Meet JoeAI',
          secondaryAction: () => setView?.('assistant')
        }
      : completed < 25
        ? {
            eyebrow: 'Welcome back,',
            headline: 'Your Anime DNA is taking shape.',
            body: 'JoeAI is beginning to recognize the genres, studios, and storytelling patterns that define your taste.',
            primaryLabel: '🧠 Ask JoeAI',
            primaryAction: () => setView?.('assistant'),
            secondaryLabel: '📖 Open Library',
            secondaryAction: () => setView?.('library')
          }
        : {
            eyebrow: 'Welcome back,',
            headline: 'JoeAI analyzed your library and found new recommendation patterns.',
            body: '',
            primaryLabel: '🧠 Ask JoeAI',
            primaryAction: () => setView?.('assistant'),
            secondaryLabel: '📖 Open Library',
            secondaryAction: () => setView?.('library')
          };

  const joeAIInsight = (() => {
    if (rewatches >= 10 && anchorCount >= 3) {
      return {
        eyebrow: 'JoeAI noticed a comfort pattern',
        headline: `${topSignal} keeps pulling you back.`,
        body: `${rewatches} rewatches and ${anchorCount} comfort anchors suggest you value familiar worlds and long-term attachment—not just novelty.`
      };
    }

    if (topStudioCount >= 5) {
      return {
        eyebrow: 'JoeAI found a studio pattern',
        headline: `${topStudio} is shaping your taste.`,
        body: `${topStudioCount} titles from the same studio is enough to form a visible creative pattern across your library.`
      };
    }

    return {
      eyebrow: 'JoeAI found a taste signal',
      headline: `${topSignal} is leading your Anime DNA.`,
      body: `${completed} completed titles are reinforcing this pattern, and it will get sharper as you rate, rewatch, and reject recommendations.`
    };
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
          <p className="homeV3Eyebrow">{heroState.eyebrow}</p>
          <h1>{displayName}.</h1>
          <p className="homeV3Lead">{heroState.headline}</p>
          {heroState.body && <p className="homeV3HeroBody">{heroState.body}</p>}
          <div className="homeV3HeroActions">
            <button type="button" className="primary" onClick={heroState.primaryAction}>
              {heroState.primaryLabel}
            </button>
            <button type="button" onClick={heroState.secondaryAction}>
              {heroState.secondaryLabel}
            </button>
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
        <Panel
          className={`homeV3Thought ${showJoeAIGuide ? 'isGuideOpen' : ''}`}
          icon="🧠"
          title="JoeAI Thought"
          action={showJoeAIGuide ? "Close" : "How It Works"}
          onAction={() => setShowJoeAIGuide((current) => !current)}
        >
          <button
            type="button"
            className="homeV3ThoughtInner"
            onClick={() => setShowJoeAIGuide((current) => !current)}
            aria-expanded={showJoeAIGuide}
            aria-label={showJoeAIGuide ? "Close the JoeAI guide" : "Open the JoeAI guide"}
          >
            <div className="homeV3ThoughtCopy">
              <span>{showJoeAIGuide ? 'How JoeAI works' : joeAIInsight.eyebrow}</span>
              <h3>{showJoeAIGuide ? 'Your library teaches JoeAI what matters to you.' : joeAIInsight.headline}</h3>
              <p>
                {showJoeAIGuide
                  ? 'JoeAI combines your ratings, rewatches, favorites, watch status, genres, studios, and Genome traits to explain your taste and rank recommendations.'
                  : joeAIInsight.body}
              </p>
              <small>{showJoeAIGuide ? 'Click again to close ↑' : 'Click to see how JoeAI analyzes your library →'}</small>
            </div>
            <div className="homeV3BrainPulse homeV3BrainHologram" aria-hidden="true">
              <img src={joeAIHologramBrain} alt="" />
            </div>
          </button>

          {showJoeAIGuide && (
            <div className="homeV3JoeAIGuide">
              <div>
                <span>1</span>
                <strong>Reads your signals</strong>
                <small>Ratings, rewatches, favorites, status, studios, genres, and notes.</small>
              </div>
              <div>
                <span>2</span>
                <strong>Builds your Anime DNA</strong>
                <small>Finds recurring themes, character dynamics, worlds, tone, and comfort patterns.</small>
              </div>
              <div>
                <span>3</span>
                <strong>Explains recommendations</strong>
                <small>Matches unseen titles to the parts of anime you repeatedly respond to.</small>
              </div>
              <div>
                <span>4</span>
                <strong>Learns from your choices</strong>
                <small>Every rating, rewatch, favorite, and rejected pick makes future results sharper.</small>
              </div>
              <button type="button" onClick={() => setView?.('assistant')}>
                Open JoeAI
              </button>
            </div>
          )}
        </Panel>

        <Panel className="homeV3QuickAsk" icon="⚡" title="Quick Ask" action="Open" onAction={() => setView?.('assistant')}>
          <div className="homeV3PromptList">
            <PromptButton text="recommend something like Slime" onAsk={sendQuickAsk} />
            <PromptButton text="what should I watch next?" onAsk={sendQuickAsk} />
            <PromptButton text="why do I like Bleach?" onAsk={sendQuickAsk} />
            <PromptButton text="what changed recently?" onAsk={sendQuickAsk} />
          </div>
        </Panel>

        <Panel className="homeV3DNA" icon="🧬" title="Anime DNA" action="Stats" onAction={() => setView?.('analytics')}>
          <div className="homeV3SignalRows">
            {topSignalRows.length ? topSignalRows.map(([name, count]) => (
              <SignalRow key={name} label={name} value={count} max={topMax} onClick={() => onOpenFilter?.("genre", name)} />
            )) : (
              <HomeEmptyState
                title="Your DNA is waiting"
                body="Add or import a few titles so JoeAI can begin finding your strongest taste signals."
                action="Add Anime"
                onAction={() => setView?.('library')}
              />
            )}
          </div>
        </Panel>

        <Panel className="homeV3Comfort" icon="❤️" title="Comfort Anchors" action="Favorites" onAction={() => setView?.('favorites')}>
          <div className="homeV3AnchorGrid">
            {(anchors.length ? anchors : favorites.slice(0, 4)).map((item) => (
              <AnchorCard key={item.id || item.title} anime={item} setSelected={setSelected} />
            ))}
            {!anchors.length && !favorites.length && (
              <HomeEmptyState
                title="No comfort anchors yet"
                body="Favorite or rewatch a title to teach JoeAI which worlds you keep returning to."
                action="Open Library"
                onAction={() => setView?.('library')}
              />
            )}
          </div>
        </Panel>

        <Panel className="homeV3Studio" icon="🎬" title="Studio DNA" action="Explore" onAction={() => setView?.('analytics')}>
          <div className="homeV3StudioRows">
            {studioRows.length ? studioRows.map(([name, count]) => (
              <button
                key={name}
                type="button"
                className="homeV3StudioRow"
                onClick={() => onOpenFilter?.("studio", name)}
                title={`Open ${count} title${Number(count) === 1 ? '' : 's'} from ${name}`}
                aria-label={`Open ${count} titles from ${name}`}
              >
                <span>{name}</span>
                <strong>{count}</strong>
                <i style={{ '--studio-width': `${pct(count, studioMax)}%` }} />
              </button>
            )) : (
              <HomeEmptyState
                title="No studio pattern yet"
                body="Studio trends will appear as your library grows and its metadata is completed."
                action="Open Library"
                onAction={() => setView?.('library')}
              />
            )}
          </div>
        </Panel>

        <Panel className="homeV3Seed" icon="⭐" title="Tonight's Recommendation" action="Get Rec" onAction={() => sendQuickAsk('what should I watch next?')}>
          {tonight ? (
            <div className="homeV3SeedCard homeV3FeaturedRecommendation">
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
                <button type="button" onClick={() => sendQuickAsk(`why did you recommend ${titleOf(tonight)}?`)}>Why this?</button>
                <button type="button" className="primary" onClick={() => setSelected?.(tonight)}>Open</button>
              </div>
            </div>
          ) : (
            <HomeEmptyState
              title="JoeAI needs a few signals"
              body="Add some anime and ratings, then JoeAI can choose a meaningful recommendation for tonight."
              action="Add Anime"
              onAction={() => setView?.('library')}
            />
          )}
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
