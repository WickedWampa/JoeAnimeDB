import React, { useMemo, useState } from 'react';
import '../styles/joeanime-splash.css';
import joeAnimeSplashHero from '../assets/joeanime-splash-hero.png';
import { Poster } from '../components/Poster';
import { score, countBy } from '../utils/animeUtils';
import { exportBackup, resetData } from '../services/storage';
import { createAnimeBrain } from '../engine/animeBrain'; import { fetchMetadata } from '../services/metadata'; import { maybeKnowledgeFirstRecommendation } from '../ai/knowledgeFirstRecommender'; import { parseJoeAIIntent } from '../ai/intentParser'; import { executeJoeAICommand } from '../ai/commandExecutor'; import { routeJoeAIRecommendation } from '../ai/joeAIRecommendationRouter';
import { buildTonightsWatch } from '../ai/tonightsWatch'; import { importAnimeByTitle, mergeAnimeMetadata } from '../services/animeImporter';

export function Universe({ anime, setQuery, setView }) {
  const total = anime.length;
  const completed = anime.filter((item) => String(item.status || '').toLowerCase() === 'completed').length;
  const watching = anime.filter((item) => String(item.status || '').toLowerCase() === 'watching').length;
  const rewatches = anime.reduce((sum, item) => sum + Number(item.rewatches || 0), 0);
  const rated = anime.filter((item) => Number(item.joeScore || item.score || item.finalScore || item.rating || 0) > 0);
  const averageScore = rated.length
    ? (rated.reduce((sum, item) => sum + Number(item.joeScore || item.score || item.finalScore || item.rating || 0), 0) / rated.length).toFixed(2)
    : '—';

  const studios = countBy(anime.map((item) => item.studio)).slice(0, 5);
  const genres = countBy(anime.flatMap((item) => item.genres || [])).slice(0, 5);
  const favorites = anime.filter((item) => item.favorite).slice(0, 4);
  const anchors = [...anime]
    .filter((item) => Number(item.rewatches || 0) > 0 || item.favorite)
    .sort((a, b) => Number(b.rewatches || 0) - Number(a.rewatches || 0))
    .slice(0, 4);

  const jump = (term) => {
    setQuery?.(term);
    setView?.('library');
  };

  const go = (view) => setView?.(view);

  return (
    <section className="joeSplashPage">
      <div className="joeSplashGlow one" />
      <div className="joeSplashGlow two" />

      <section className="joeSplashHeroCard">
        <div className="joeSplashCopy">
          <div className="joeSplashBrand">
            <span className="joeSplashLogo">🍜</span>
            <div>
              <p className="joeSplashEyebrow">JoeAnimeDB</p>
              <h1>Your anime library. Powered by JoeAI.</h1>
            </div>
          </div>

          <h2>Track what you’ve watched. Understand <span>why</span> you loved it.</h2>
          <p className="joeSplashLead">
            JoeAI reads your library, Anime DNA, rewatches, ratings, and Genome signals to help you discover what to watch next.
          </p>

          <div className="joeSplashActions">
            <button type="button" className="primary" onClick={() => go('assistant')}>Ask JoeAI</button>
            <button type="button" onClick={() => go('library')}>Open Library</button>
            <button type="button" onClick={() => go('taste-profile')}>Anime DNA</button>
          </div>
        </div>

        <div className="joeSplashVisual">
          <img src={joeAnimeSplashHero} alt="JoeAnimeDB splash artwork" />
          <div className="joeSplashStatusCard">
            <strong>JoeAI Status</strong>
            <span>● Learning from your library</span>
          </div>
        </div>
      </section>

      <section className="joeSplashStats">
        <div><strong>{total}</strong><span>Total Anime</span></div>
        <div><strong>{completed}</strong><span>Completed</span></div>
        <div><strong>{watching}</strong><span>Watching</span></div>
        <div><strong>{rewatches}</strong><span>Rewatches</span></div>
        <div><strong>{averageScore}</strong><span>Average Score</span></div>
      </section>

      <section className="joeSplashGrid">
        <article className="joeSplashPanel featured">
          <div className="joeSplashPanelHeader">
            <h3>🧠 JoeAI Thought</h3>
            <button type="button" onClick={() => go('memory-timeline')}>Memory</button>
          </div>
          <p>
            Your strongest signals are forming around long-term attachment, worldbuilding, and comfort anchors. JoeAI will get sharper as you rate, rewatch, drop, and accept recommendations.
          </p>
        </article>

        <article className="joeSplashPanel">
          <div className="joeSplashPanelHeader">
            <h3>🎯 Quick Start</h3>
            <button type="button" onClick={() => go('assistant')}>Ask</button>
          </div>
          <div className="joeSplashPromptList">
            {[
              'recommend something like Slime',
              'what should I watch next?',
              'why do I like Bleach?',
              'what changed recently?'
            ].map((prompt) => (
              <button type="button" key={prompt} onClick={() => go('assistant')}>{prompt}</button>
            ))}
          </div>
        </article>

        <article className="joeSplashPanel">
          <div className="joeSplashPanelHeader">
            <h3>❤️ Comfort Anchors</h3>
            <button type="button" onClick={() => go('taste-profile')}>DNA</button>
          </div>
          <div className="joeSplashChipList">
            {(anchors.length ? anchors : favorites).map((item) => (
              <button type="button" key={item.id || item.title} onClick={() => jump(item.title)}>
                {item.title}{Number(item.rewatches || 0) > 0 ? ` · ${item.rewatches}x` : ''}
              </button>
            ))}
            {!anchors.length && !favorites.length && <span>No anchors yet — mark favorites or rewatches to teach JoeAI.</span>}
          </div>
        </article>

        <article className="joeSplashPanel">
          <div className="joeSplashPanelHeader">
            <h3>📊 Top Signals</h3>
            <button type="button" onClick={() => go('analytics')}>Stats</button>
          </div>
          <div className="joeSplashSignalRows">
            {genres.map(([name, count]) => (
              <button type="button" key={name} onClick={() => jump(name)}>
                <span>{name}</span><strong>{count}</strong>
              </button>
            ))}
          </div>
        </article>

        <article className="joeSplashPanel">
          <div className="joeSplashPanelHeader">
            <h3>🎬 Studio DNA</h3>
            <button type="button" onClick={() => go('analytics')}>Explore</button>
          </div>
          <div className="joeSplashSignalRows">
            {studios.map(([name, count]) => (
              <button type="button" key={name} onClick={() => jump(name)}>
                <span>{name}</span><strong>{count}</strong>
              </button>
            ))}
          </div>
        </article>
      </section>
    </section>
  );
}

export function Assistant({ anime, catalog = [], updateAnime }) {
  const brain = useMemo(() => createAnimeBrain(anime, catalog), [anime, catalog]);
  const [log, setLog] = useState([
    {
      who: 'bot',
      type: 'text',
      text: 'JoeAI is wicked smaht now. Ask what I can do, tell me what you finished, bulk add titles, or ask for recommendations.'
    }
  ]);
  const [text, setText] = useState('');
  const [addingId, setAddingId] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [expandedRecommendationIds, setExpandedRecommendationIds] = useState({});

  function animeId(item) {
    return String(item?.malId || item?.id || item?.title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
  }

  function parseStatus(value = '') {
    const lower = String(value).toLowerCase();
    if (lower.includes('completed') || lower.includes('finished') || lower.includes('watched')) return 'Completed';
    if (lower.includes('plan')) return 'Plan to Watch';
    if (lower.includes('hold')) return 'On Hold';
    if (lower.includes('dropped')) return 'Dropped';
    return 'Watching';
  }

  function parseSingleAdd(value = '') {
    const raw = String(value).trim();

    // Lists belong to bulk import, not single-title add.
    if (raw.includes(',') || /\r?\n/.test(raw)) return null;

    const patterns = [
      /^add\s+(.+?)(?:\s+as\s+(completed|watched|watching|planned|plan to watch|dropped|on hold))?$/i,
      /^i(?:'| a)?m watching\s+(.+)$/i,
      /^i started\s+(.+)$/i,
      /^started\s+(.+)$/i,
      /^i finished\s+(.+)$/i,
      /^finished\s+(.+)$/i,
      /^i completed\s+(.+)$/i,
      /^completed\s+(.+)$/i,
      /^mark\s+(.+?)\s+as\s+(completed|watched|watching|planned|plan to watch|dropped|on hold)$/i
    ];

    for (const pattern of patterns) {
      const match = raw.match(pattern);
      if (!match?.[1]) continue;

      const title = match[1]
        .replace(/\s+as\s+(completed|watched|watching|planned|plan to watch|dropped|on hold)$/i, '')
        .replace(/\s+to\s+(?:my\s+)?library$/i, '')
        .trim();

      if (title) return { title, status: parseStatus(raw) };
    }

    return null;
  }

  function parseBulkAdd(value = '') {
    const raw = String(value).trim();
    const lower = raw.toLowerCase();
    const status = parseStatus(raw);

    let body = raw;

    const explicitBulk =
      lower.startsWith('add these') ||
      lower.startsWith('import these') ||
      lower.startsWith('bulk add') ||
      lower.startsWith('add list') ||
      lower.startsWith('import list');

    if (explicitBulk) {
      body = raw.includes(':')
        ? raw.slice(raw.indexOf(':') + 1)
        : raw.replace(/^(add these|import these|bulk add|add list|import list)/i, '');
    } else {
      // Natural bulk commands:
      // "add Bleach, One Piece, Initial D as completed"
      // "mark Bleach, Naruto as completed"
      // "I finished Bleach, Naruto, One Piece"
      body = raw
        .replace(/^(add|import|mark|i finished|finished|i completed|completed|i watched|watched)\s+/i, '')
        .replace(/\s+as\s+(completed|watched|watching|planned|plan to watch|dropped|on hold)$/i, '')
        .replace(/\s+to\s+(?:my\s+)?library$/i, '');
    }

    const hasListSeparator = body.includes(',') || /\r?\n/.test(body);
    if (!explicitBulk && !hasListSeparator) return null;

    const titles = [...new Set(
      body
        .split(/\r?\n|,/)
        .map((line) => line.trim())
        .map((line) => line.replace(/^[-*•]\s*/, '').trim())
        .filter(Boolean)
    )];

    return titles.length > 1 ? { titles, status } : null;
  }

  function helpAnswer() {
    return {
      type: 'helpCard',
      title: '🍜 JoeAI Guide',
      subtitle: 'I can manage your library, explain your Anime DNA, recommend shows with reasons, and remember how your taste evolves.',
      sections: [
        {
          icon: '🎯',
          title: 'Recommendations',
          items: [
            'recommend something like Slime',
            'recommend something like Bleach',
            'recommend something darker',
            'what should I watch next?',
            'surprise me'
          ]
        },
        {
          icon: '🧬',
          title: 'Anime DNA',
          items: [
            'explain my Anime DNA',
            'explain worldbuilding',
            'why do I like Bleach?',
            'how has my taste changed?',
            'prediction accuracy'
          ]
        },
        {
          icon: '🧠',
          title: 'JoeAI Memory',
          items: [
            'what did you learn?',
            'what changed recently?',
            'what surprised you most?',
            'when did you learn worldbuilding?',
            'daily thought'
          ]
        },
        {
          icon: '📚',
          title: 'Library',
          items: [
            'I finished Frieren',
            'I am watching Magi',
            'add Bleach as completed',
            'add these as completed: Bleach, Naruto, One Piece',
            'what am I watching?'
          ]
        },
        {
          icon: '📊',
          title: 'Stats',
          items: [
            'library stats',
            'top genres',
            'top studios',
            'top rated anime',
            'show me unrated anime'
          ]
        },
        {
          icon: '🎲',
          title: 'No idea what to ask?',
          items: [
            'what are your strongest signals?',
            'what are you least certain about?',
            'recommend a hidden gem',
            'compare Slime and Overlord',
            'predict my next favorite anime'
          ]
        }
      ],
      footer: 'Click any prompt to load it, then hit Ask — or just type naturally. JoeAI will route it.'
    };
  }

  function libraryStatsAnswer() {
    const completed = anime.filter((item) => String(item.status).toLowerCase() === 'completed').length;
    const watching = anime.filter((item) => String(item.status).toLowerCase() === 'watching').length;
    const favorites = anime.filter((item) => item.favorite).length;

    return [
      '🍜 Library status:',
      '',
      `• ${anime.length} titles total`,
      `• ${completed} completed`,
      `• ${watching} currently watching`,
      `• ${favorites} favorites`,
      `• ${catalog.length} catalog titles for recommendations`
    ].join('\n');
  }

  function currentlyWatchingAnswer() {
    const watching = anime
      .filter((item) => String(item.status).toLowerCase() === 'watching')
      .slice(0, 12);

    if (!watching.length) {
      return 'Nothing is marked Watching right now. Say “I am watching Magi” and I will add/update it.';
    }

    return [
      'You are currently watching:',
      '',
      ...watching.map((item) => `• ${item.title}${item.episodeCount ? ` (${item.episodeCount} eps)` : ''}`)
    ].join('\n');
  }

  function isRecommendationQuestion(value) {
    const lower = String(value).toLowerCase();
    return lower.includes('recommend') || lower.includes('next') || lower.includes('watch') || lower.includes('new anime');
  }

  function shouldUseRecommendationRouter(value = '') {
    const lower = String(value).toLowerCase();

    // Title-similarity and mood/theme requests belong to the card router.
    // Generic requests like "what should I watch next" should NOT go through
    // the Genome title lookup path, because that is what caused the Space Dandy fallback.
    return (
      /(something|show|shows|anime)\s+like/.test(lower) ||
      /similar\s+to/.test(lower) ||
      /recommend\s+.+\s+like/.test(lower) ||
      /(darker|dark|funny|comedy|emotional|cozy|comfort|strategy|strategic|sports|hidden gem|underrated|movie|short binge)/.test(lower)
    );
  }

  function appendBotResult(result) {
    if (!result) return;

    if (typeof result === 'string') {
      setLog((current) => [...current, { who: 'bot', type: 'text', text: result }]);
      return;
    }

    setLog((current) => [...current, { who: 'bot', ...result }]);
  }

  function toggleRecommendationWhy(id) {
    setExpandedRecommendationIds((current) => ({
      ...current,
      [id]: !current[id]
    }));
  }


  async function addAnimeToLibrary(input) {
    const id = 'anime-' + animeId(input);
    setAddingId(id);

    try {
      const result = await executeJoeAICommand({
        intent: {
          kind: 'singleAdd',
          title: input.title,
          status: input.status || 'Watching',
          selectedAnime: input.selectedAnime
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

  async function executeBulkAddFromChat(command) {
    setLog((current) => [
      ...current,
      {
        who: 'bot',
        type: 'text',
        text: `Starting bulk import for ${command.titles.length} title(s)...`
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

  async function ask() {
    const q = text.trim();
    if (!q) return;

    setLog((current) => [...current, { who: 'user', type: 'text', text: q }]);
    setText('');

    const intent = parseJoeAIIntent(q);


    if (intent.kind === 'generateGenome') {
      const result = await executeJoeAICommand({
        intent,
        anime,
        catalog,
        updateAnime,
        brain
      });
      setLog((current) => [...current, { who: 'bot', ...result }]);
      return;
    }

    if (intent.kind === 'help') {
      appendBotResult(helpAnswer());
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
          text: `I found ${intent.titles.length} title(s). I will add them as ${intent.status}, skip duplicates, and fetch metadata only when needed. Import these?`,
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
          text: `I will add or update “${intent.title}” as ${intent.status}. Metadata will only be fetched if needed. Continue?`,
          confirmLabel: 'Do It',
          action
        }
      ]);
      return;
    }

    if (intent.kind === 'recommendation') {
      // Specific recommendation prompts go to the rich card router.
      // Generic prompts like "what should I watch next" stay on the normal
      // recommendation engine so they do not get swallowed by Genome title lookup.
      if (shouldUseRecommendationRouter(q)) {
        const smartAnswer = routeJoeAIRecommendation(q, anime, catalog);

        if (smartAnswer) {
          appendBotResult(smartAnswer);
          return;
        }
      }

      const result = await executeJoeAICommand({
        intent,
        anime,
        catalog,
        updateAnime,
        brain
      });

      appendBotResult(result);
      return;
    }

    // For normal questions, let the conversation/reasoning/memory engine answer first.
    // Only use the Genome title lookup as a fallback for direct title lookups like "Slime".
    const routedQuestion = await executeJoeAICommand({
      intent: { kind: 'question', text: q },
      anime,
      catalog,
      updateAnime,
      brain
    });

    if (routedQuestion?.type !== 'text' || !String(routedQuestion?.text || '').startsWith('Try asking about your Anime DNA')) {
      appendBotResult(routedQuestion);
      return;
    }

    const smartAnswer = routeJoeAIRecommendation(q, anime, catalog);
    if (smartAnswer) {
      appendBotResult(smartAnswer);
      return;
    }

    appendBotResult(routedQuestion);
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

  function renderHelpCard(message, index) {
    return (
      <div key={index} className="chat bot joeaiHelpCard">
        <div className="joeaiHelpHero">
          <h2>{message.title}</h2>
          <p>{message.subtitle}</p>
        </div>

        <div className="joeaiHelpGrid">
          {(message.sections || []).map((section) => (
            <section key={section.title} className="joeaiHelpSection">
              <h3><span>{section.icon}</span>{section.title}</h3>
              <div>
                {(section.items || []).map((item) => (
                  <button
                    type="button"
                    key={item}
                    onClick={() => setText(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        {message.footer && <p className="joeaiHelpFooter">{message.footer}</p>}
      </div>
    );
  }

  function renderConfirmAction(message, index) {
    const action = message.action;

    return (
      <div key={index} className="chat bot joeaiConfirmCard">
        <div className="joeaiConfirmHeader">
          <h2>{message.title}</h2>
          <p>{message.text}</p>
        </div>

        {action?.kind === 'bulkAdd' && (
          <div className="joeaiConfirmList">
            {action.titles.map((title) => (
              <span key={title}>✓ {title}</span>
            ))}
          </div>
        )}

        <div className="joeaiConfirmActions">
          <button
            type="button"
            onClick={() => {
              setPendingAction(null);
              setLog((current) => [...current, { who: 'bot', type: 'text', text: 'Canceled. No changes made.' }]);
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            className="primary"
            onClick={async () => {
              if (!pendingAction) return;
              const nextAction = pendingAction;
              setPendingAction(null);

              if (nextAction.kind === 'bulkAdd') {
                await executeBulkAddFromChat(nextAction);
              }

              if (nextAction.kind === 'singleAdd') {
                await addAnimeToLibrary(nextAction);
              }
            }}
          >
            {message.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    );
  }

  function renderBulkResult(message, index) {
    return (
      <div key={index} className="chat bot joeaiBulkResult">
        <div className="joeaiBulkHeader">
          <h2>{message.title}</h2>
          <div className="joeaiBulkStats">
            <span>Added: {message.added?.length || 0}</span>
            <span>Already in Library: {message.skipped?.length || 0}</span>
            <span>Failed: {message.failed?.length || 0}</span>
          </div>
        </div>

        {message.added?.length > 0 && (
          <section className="joeaiBulkSection">
            <h3>Added</h3>
            {message.added.map((title) => (
              <div className="joeaiBulkRow added" key={title}>
                <span>✓</span>
                <strong>{title}</strong>
              </div>
            ))}
          </section>
        )}

        {message.skipped?.length > 0 && (
          <section className="joeaiBulkSection">
            <h3>Already in Library</h3>
            {message.skipped.map((title) => (
              <div className="joeaiBulkRow skipped" key={title}>
                <span>↪</span>
                <strong>{title}</strong>
              </div>
            ))}
          </section>
        )}

        {message.failed?.length > 0 && (
          <section className="joeaiBulkSection">
            <h3>Needs Attention</h3>
            {message.failed.map((title) => (
              <div className="joeaiBulkRow failed" key={title}>
                <span>!</span>
                <strong>{title}</strong>
              </div>
            ))}
          </section>
        )}
      </div>
    );
  }

  function renderCandidateSelection(message, index) {
    return (
      <div key={index} className="chat bot joeaiRecommendations">
        <div className="joeaiRecHeader">
          <h2>{message.title}</h2>
          <p>{message.text}</p>
        </div>
        <div className="joeaiRecGrid">
          {(message.candidates || []).map((item) => {
            const displayTitle = item.officialTitle || item.title;
            return (
              <article className="joeaiRecCard" key={item.id || displayTitle}>
                <Poster anime={item} className="joeaiRecPoster" mode="thumb" />
                <div className="joeaiRecBody">
                  <div className="joeaiRecTopline">
                    {item.matchScore && <span className="joeaiMatchBadge">{item.matchScore}%</span>}
                    <span className="joeaiMatchLabel">{item.matchReason || 'Possible match'}</span>
                    {item.candidateSource && (
                      <span className="joeaiMatchLabel">{item.candidateSource === 'local' ? 'In Library' : 'Remote'}</span>
                    )}
                  </div>
                  <h3>{displayTitle}</h3>
                  <div className="joeaiRecMeta">
                    {item.year && <span>{item.year}</span>}
                    {item.episodes && <span>{item.episodes} eps</span>}
                    {item.episodeCount && !item.episodes && <span>{item.episodeCount} eps</span>}
                    {item.studio && <span>{item.studio}</span>}
                    {item.status && <span>{item.status}</span>}
                    {item.candidateSource === 'remote' && <span>not in library yet</span>}
                  </div>
                  <div className="joeaiRecActions">
                    <button
                      type="button"
                      onClick={() => addAnimeToLibrary({
                        title: displayTitle,
                        status: message.status || 'Watching',
                        selectedAnime: item
                      })}
                      disabled={addingId === 'anime-' + animeId(item) || !updateAnime}
                    >
                      Use This One
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    );
  }


  function sourceTitleFromMessage(message = {}) {
    const titleText = String(message.title || '');
    const match = titleText.match(/because you like\s+(.+)$/i);
    return match?.[1]?.trim() || 'that show';
  }

  function cleanTraitLabel(value = '') {
    return String(value || '')
      .replace(/^Curated knowledge match$/i, 'Curated Match')
      .replace(/gold standard audience-fantasy profile/i, 'Gold Genome Match')
      .replace(/^same subdomain:\s*/i, '')
      .replace(/^shared themes:\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function traitEmoji(tag = '') {
    const lower = String(tag).toLowerCase();
    if (lower.includes('sword') || lower.includes('combat')) return '⚔️';
    if (lower.includes('demon') || lower.includes('curse') || lower.includes('horror')) return '👹';
    if (lower.includes('magic') || lower.includes('supernatural')) return '✨';
    if (lower.includes('kingdom') || lower.includes('leadership') || lower.includes('politic')) return '👑';
    if (lower.includes('world') || lower.includes('adventure')) return '🌍';
    if (lower.includes('friend') || lower.includes('family') || lower.includes('community')) return '🤝';
    if (lower.includes('power') || lower.includes('action')) return '💥';
    if (lower.includes('comedy') || lower.includes('fun')) return '😂';
    if (lower.includes('mystery') || lower.includes('identity')) return '🧩';
    if (lower.includes('emotional') || lower.includes('trauma') || lower.includes('drama')) return '💔';
    return '✓';
  }

  function recommendationTags(item = {}) {
    const raw = [
      ...(item.tags || []),
      ...(item.reasons || [])
    ];

    const seen = new Set();
    return raw
      .map(cleanTraitLabel)
      .filter(Boolean)
      .filter((tag) => !/^curated match$/i.test(tag) || raw.length <= 2)
      .filter((tag) => {
        const key = tag.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5);
  }

  function recommendationSummary(item = {}, sourceTitle = 'that show') {
    const name = item.officialTitle || item.title || 'this pick';
    const tags = recommendationTags(item).slice(0, 3);

    if (item.joeAISummary) return item.joeAISummary;

    if (tags.length) {
      return `If what you liked about ${sourceTitle} was ${tags.map((tag) => tag.toLowerCase()).join(', ')}, ${name} looks like a strong follow-up without feeling like a copy.`;
    }

    if (item.blurb && !/shares Curated knowledge match/i.test(item.blurb)) {
      return item.blurb;
    }

    return `${name} has enough shared DNA with ${sourceTitle} that JoeAI thinks it is worth a serious look.`;
  }

  function parsePercentFromDeepDive(text = '', label = 'DNA score') {
    const haystack = String(text || '');
    const needle = String(label || '').toLowerCase();
    const line = haystack
      .split(/\r?\n/)
      .find((entry) => entry.toLowerCase().includes(needle));

    const match = line?.match(/([0-9]+)%/);
    return match ? Number(match[1]) : null;
  }

  function dnaPercent(item = {}) {
    if (Number.isFinite(Number(item.dnaScore))) return Math.round(Number(item.dnaScore) * 100);
    if (Number.isFinite(Number(item.dna))) return Math.round(Number(item.dna) * 100);
    const parsed = parsePercentFromDeepDive(item.deepDive, 'DNA score');
    if (parsed !== null) return parsed;
    return Math.max(0, Math.min(100, Number(item.match || 0)));
  }

  function confidenceLabel(match = 0) {
    const score = Number(match || 0);
    if (score >= 95) return 'Very High';
    if (score >= 88) return 'Strong';
    if (score >= 78) return 'Good';
    return 'Exploratory';
  }

  function renderDnaMeter(percent) {
    const safePercent = Math.max(0, Math.min(100, Number(percent || 0)));
    return (
      <div className="joeaiReasonList">
        <strong>🧬 DNA Match</strong>
        <div style={{ width: '100%', height: 10, borderRadius: 999, background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
          <div style={{ width: `${safePercent}%`, height: '100%', borderRadius: 999, background: 'currentColor' }} />
        </div>
        <span>{safePercent}% shared Anime DNA</span>
      </div>
    );
  }

  function renderRecommendationCards(message, index) {
    const sourceTitle = sourceTitleFromMessage(message);

    return (
      <div key={index} className="chat bot joeaiRecommendations">
        <div className="joeaiRecHeader">
          <h2>{message.title}</h2>
          {message.subtitle && <p>{message.subtitle}</p>}
        </div>

        {message.items?.some((item) => item.bucket === 'library') && (
          <section className="joeaiBulkSection">
            <h3>Already in your library</h3>
            <div className="joeaiRecGrid">
              {message.items.filter((item) => item.bucket === 'library').map((item, itemIndex) => renderCompactRecommendationCard(item, itemIndex, sourceTitle))}
            </div>
          </section>
        )}

        {message.items?.some((item) => item.bucket !== 'library') && (
          <section className="joeaiBulkSection">
            <h3>New discoveries</h3>
            <div className="joeaiRecGrid">
              {message.items.filter((item) => item.bucket !== 'library').map((item, itemIndex) => renderCompactRecommendationCard(item, itemIndex, sourceTitle))}
            </div>
          </section>
        )}

        {message.fullAnalysis && (
          <details className="joeaiReasonList">
            <summary>Full Genome analysis</summary>
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{message.fullAnalysis}</pre>
          </details>
        )}
      </div>
    );
  }

  function renderCompactRecommendationCard(item, index, sourceTitle = 'that show') {
    const id = String(item.id || item.title || index);
    const isExpanded = Boolean(expandedRecommendationIds[id]);
    const isAdding = addingId === 'anime-' + animeId(item);
    const name = item.officialTitle || item.title;
    const tags = recommendationTags(item);
    const dna = dnaPercent(item);

    return (
      <article className="joeaiRecCard" key={id}>
        <Poster anime={item} className="joeaiRecPoster" mode="thumb" />
        <div className="joeaiRecBody">
          <div className="joeaiRecTopline">
            <span className="joeaiRecRank">#{index + 1}</span>
            <span className="joeaiMatchBadge">{item.match}%</span>
            <span className="joeaiMatchLabel">{confidenceLabel(item.match)} Match</span>
            <span className="joeaiMatchLabel">{item.owned ? 'In Library' : 'Discovery'}</span>
          </div>

          <h3>{name}</h3>

          <div className="joeaiRecMeta">
            {item.year && <span>{item.year}</span>}
            {item.episodes && <span>{item.episodes} eps</span>}
            {item.studio && <span>{item.studio}</span>}
            {item.communityScore && <span>MAL {item.communityScore}</span>}
          </div>

          <p><strong>🍜 JoeAI says:</strong> {recommendationSummary(item, sourceTitle)}</p>

          {tags.length > 0 && (
            <div className="joeaiRecMeta" aria-label="Recommendation traits">
              {tags.map((tag) => <span key={tag}>{traitEmoji(tag)} {tag}</span>)}
            </div>
          )}

          {isExpanded && (
            <div className="joeaiReasonList">
              <strong>🧠 Why JoeAI picked this</strong>
              {renderDnaMeter(dna)}
              <div className="joeaiRecMeta">
                <span>Confidence: {confidenceLabel(item.match)}</span>
                {item.owned && <span>Already in your library</span>}
                {!item.owned && <span>New discovery</span>}
              </div>
              {tags.length > 0 && (
                <div className="joeaiRecMeta">
                  {tags.map((tag) => <span key={tag + '-why'}>{traitEmoji(tag)} {tag}</span>)}
                </div>
              )}
              <p>Because you asked about <strong>{sourceTitle}</strong>, JoeAI looked for shows with overlapping anime DNA, matching themes, and enough differences to still feel fresh.</p>
              {item.deepDive && (
                <details>
                  <summary>Technical notes</summary>
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{item.deepDive}</pre>
                </details>
              )}
            </div>
          )}

          <div className="joeaiRecActions">
            <button type="button" onClick={() => toggleRecommendationWhy(id)}>
              {isExpanded ? 'Hide Why' : 'Why?'}
            </button>
            <button type="button" onClick={() => addAnimeToLibrary({ title: name, status: 'Watching', selectedAnime: item })} disabled={isAdding || !updateAnime}>
              {isAdding ? 'Adding...' : item.owned ? 'Update Status' : '+ Add'}
            </button>
          </div>
        </div>
      </article>
    );
  }

  function renderMessage(message, index) {
    if (message.type === 'helpCard') {
      return renderHelpCard(message, index);
    }

    if (message.type === 'confirmAction') {
      return renderConfirmAction(message, index);
    }

    if (message.type === 'bulkResult') {
      return renderBulkResult(message, index);
    }

    if (message.type === 'candidateSelection') {
      return renderCandidateSelection(message, index);
    }

    if (message.type === 'recommendationCards') {
      return renderRecommendationCards(message, index);
    }

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
          placeholder={'Ask JoeAI... try: add Frieren as completed\nOr: add these as completed: Bleach, Naruto, One Piece'}
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

export function SettingsPage({
  data,
  syncMetadata,
  stats,
  newUserMode,
  enableNewUserMode,
  exitNewUserMode,
  resetNewUserMode
}) {
  const [genomeUpdateStatus, setGenomeUpdateStatus] = React.useState('');

  async function updateDatabaseWithGenomes() {
    setGenomeUpdateStatus('Updating database metadata...');

    try {
      await syncMetadata?.();

      if (window.JoeAnimeDB?.generateMissingGenomesForLibrary) {
        setGenomeUpdateStatus('Generating missing Genome cards...');

        const result = await window.JoeAnimeDB.generateMissingGenomesForLibrary(data?.anime || data || [], {
          limit: 0
        });

        if (result?.ok) {
          setGenomeUpdateStatus('Database updated and missing Genome cards generated. Restart/refresh if new cards do not appear immediately.');
        } else {
          setGenomeUpdateStatus('Database updated, but Genome generation failed: ' + (result?.error || 'Unknown error'));
        }
      } else {
        setGenomeUpdateStatus('Database updated. Genome bridge is not available yet.');
      }
    } catch (error) {
      setGenomeUpdateStatus('Update failed: ' + (error?.message || String(error)));
    }
  }

  return (
    <section className="panel">
      <h2>Settings</h2>
      <p>Backups, metadata sync, and database tools.</p>

      <section className="newUserModePanel">
        <div>
          <p className="eyebrow">Onboarding / Testing</p>
          <h2>🧪 New User Mode</h2>
          <p>Try imports, JoeAI commands, bulk add, and recommendations without touching your real SQLite database.</p>
          <strong>Status: {newUserMode ? 'ON — temporary library active' : 'OFF — real library active'}</strong>
        </div>

        <div className="newUserModeActions">
          {!newUserMode ? (
            <button type="button" onClick={enableNewUserMode}>Enter New User Mode</button>
          ) : (
            <>
              <button type="button" onClick={resetNewUserMode}>Reset Demo Library</button>
              <button type="button" onClick={exitNewUserMode}>Exit To Real Library</button>
            </>
          )}
        </div>
      </section>

      {genomeUpdateStatus && <p className="settingsStatus">{genomeUpdateStatus}</p>}
      <div className="settingsActions">
        <button onClick={() => exportBackup(data)}>Export Backup</button>
        <button onClick={updateDatabaseWithGenomes}>Update Database + Genomes</button>
        <button onClick={resetData}>Reset Local Data</button>
      </div>
    </section>
  );
}
