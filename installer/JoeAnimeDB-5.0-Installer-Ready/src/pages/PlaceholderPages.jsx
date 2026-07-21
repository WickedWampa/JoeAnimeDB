import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../styles/joeanime-splash.css';
import joeAnimeSplashHero from '../assets/joeanime-splash-hero.png';
import joeAIHologramBrain from '../assets/joeai-hologram-brain.png';
import '../styles/joeai-command-center.css';
import { Poster } from '../components/Poster';
import { AnimeCard } from '../components/AnimeCard';
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

export function Assistant({ anime, catalog = [], updateAnime, initialPrompt = '', onPromptConsumed }) {
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
  const lastAutoPromptRef = useRef('');
  const conversationRef = useRef(null);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (!conversation) return;

    requestAnimationFrame(() => {
      conversation.scrollTo({
        top: conversation.scrollHeight,
        behavior: 'smooth'
      });
    });
  }, [log, pendingAction, expandedRecommendationIds]);

  useEffect(() => {
    const prompt = String(initialPrompt || '').trim();
    if (!prompt) {
      lastAutoPromptRef.current = '';
      return;
    }
    if (lastAutoPromptRef.current === prompt) return;

    lastAutoPromptRef.current = prompt;
    void ask(prompt);
    onPromptConsumed?.();
  }, [initialPrompt, onPromptConsumed]);

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
      /\b(something|show|shows|anime)\s+like\b/.test(lower) ||
      /\bsimilar\s+to\b/.test(lower) ||
      /\brecommend\s+.+\s+like\b/.test(lower) ||
      /\b(darker|dark|funny|comedy|emotional|cozy|comfort|strategy|strategic|sports|hidden gem|underrated|movie|short binge)\b/.test(lower)
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

  async function ask(promptOverride = '') {
    const q = String(promptOverride || text).trim();
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
    if (lower.includes('sword') || lower.includes('combat') || lower.includes('battle')) return '⚔️';
    if (lower.includes('demon') || lower.includes('curse') || lower.includes('horror')) return '👹';
    if (lower.includes('magic') || lower.includes('supernatural')) return '✨';
    if (lower.includes('kingdom') || lower.includes('leadership') || lower.includes('politic')) return '👑';
    if (lower.includes('world') || lower.includes('adventure') || lower.includes('expansive')) return '🌍';
    if (lower.includes('friend') || lower.includes('family') || lower.includes('community') || lower.includes('loyal')) return '🤝';
    if (lower.includes('power') || lower.includes('action')) return '💥';
    if (lower.includes('comedy') || lower.includes('fun')) return '😂';
    if (lower.includes('mystery') || lower.includes('identity')) return '🧩';
    if (lower.includes('emotional') || lower.includes('trauma') || lower.includes('drama')) return '💔';
    return '✓';
  }

  function traitCategory(tag = '') {
    const lower = String(tag).toLowerCase();

    if (
      lower.includes('combat') || lower.includes('battle') || lower.includes('power') ||
      lower.includes('action') || lower.includes('sword')
    ) return 'action';

    if (
      lower.includes('friend') || lower.includes('family') || lower.includes('loyal') ||
      lower.includes('mentor') || lower.includes('rival') || lower.includes('character')
    ) return 'character';

    if (
      lower.includes('dark') || lower.includes('emotional') || lower.includes('comedy') ||
      lower.includes('fun') || lower.includes('cozy') || lower.includes('horror') ||
      lower.includes('tone')
    ) return 'tone';

    if (
      lower.includes('world') || lower.includes('kingdom') || lower.includes('politic') ||
      lower.includes('leadership') || lower.includes('magic') || lower.includes('adventure') ||
      lower.includes('expansive') || lower.includes('setting')
    ) return 'world';

    return 'story';
  }

  function traitCategoryLabel(category = 'story') {
    return {
      action: 'Action',
      character: 'Characters',
      tone: 'Tone',
      world: 'World',
      story: 'Story'
    }[category] || 'Story';
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
      .slice(0, 7);
  }

  function recommendationSummary(item = {}, sourceTitle = 'that show') {
    const name = item.officialTitle || item.title || 'this pick';
    const tags = recommendationTags(item).slice(0, 3);

    if (item.joeAISummary) return item.joeAISummary;

    if (tags.length) {
      return `You tend to respond strongly to ${tags.map((tag) => tag.toLowerCase()).join(', ')}. ${name} carries that same core DNA as ${sourceTitle}, but still has enough of its own identity to feel fresh.`;
    }

    if (item.blurb && !/shares Curated knowledge match/i.test(item.blurb)) {
      return item.blurb;
    }

    return `${name} overlaps with the parts of ${sourceTitle} that usually land best for you, so JoeAI thinks it deserves a serious look.`;
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

  function scoreValue(item = {}) {
    const value = Number(item.joeScore ?? item.score ?? item.finalScore ?? item.rating ?? 0);
    return Number.isFinite(value) && value > 0 ? value.toFixed(1) : null;
  }

  function relationshipFacts(item = {}) {
    if (!item.owned) return [];

    const facts = [];
    const status = item.status || item.watchStatus;
    const rating = scoreValue(item);
    const rewatches = Number(item.rewatches || 0);

    if (status) facts.push({ label: 'Status', value: status });
    if (rating) facts.push({ label: 'Your rating', value: `${rating}/10` });
    if (rewatches > 0) facts.push({ label: 'Rewatches', value: `${rewatches}×` });
    if (item.favorite) facts.push({ label: 'Library signal', value: 'Favorite' });

    return facts;
  }

  function reasoningBullets(item = {}, sourceTitle = 'that show') {
    const tags = recommendationTags(item).slice(0, 4);
    const bullets = tags.map((tag) => `${traitEmoji(tag)} Shared ${tag.toLowerCase()} DNA`);

    if (item.owned) {
      const rating = scoreValue(item);
      if (rating) bullets.push(`★ You rated this ${rating}/10`);
      if (Number(item.rewatches || 0) > 0) bullets.push(`↻ You have rewatched it ${item.rewatches} time${Number(item.rewatches) === 1 ? '' : 's'}`);
    } else {
      bullets.push(`✦ New discovery outside your current library`);
    }

    if (!bullets.length) {
      bullets.push(`🧬 Strong overall overlap with ${sourceTitle}`);
    }

    return bullets.slice(0, 5);
  }

  function renderMeter(label, percent, className = '') {
    const safePercent = Math.max(0, Math.min(100, Number(percent || 0)));
    return (
      <div className={`joeaiPremiumMeter ${className}`}>
        <div className="joeaiPremiumMeterTop">
          <span>{label}</span>
          <strong>{safePercent}%</strong>
        </div>
        <div className="joeaiPremiumMeterTrack">
          <i style={{ width: `${safePercent}%` }} />
        </div>
      </div>
    );
  }

  function renderRecommendationCards(message, index) {
    const sourceTitle = sourceTitleFromMessage(message);

    return (
      <div key={index} className="chat bot joeaiRecommendations">
        <div className="joeaiRecHeader joeaiSmartRecHeader">
          <p className="joeaiRecEyebrow">🧬 Genome recommendation run</p>
          <h2>JoeAI found {message.items?.length || 0} strong matches for {sourceTitle}</h2>
          <p>
            These picks are based on shared world design, character dynamics, tone, and your personal library signals—not just genre labels.
          </p>
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
    const confidence = Math.max(0, Math.min(100, Number(item.match || 0)));
    const facts = relationshipFacts(item);
    const bullets = reasoningBullets(item, sourceTitle);

    return (
      <article className={`joeaiRecCard joeaiPremiumRecCard ${isExpanded ? 'isExpanded' : ''}`} key={id}>
        <div className="joeaiPosterWrap">
          <Poster anime={item} className="joeaiRecPoster" mode="thumb" />
          <span className="joeaiPosterMatchBadge">{confidence}%</span>
        </div>

        <div className="joeaiRecBody">
          <div className="joeaiRecTopline">
            <span className="joeaiRecRank">#{index + 1}</span>
            <span className="joeaiMatchLabel">{confidenceLabel(confidence)} Match</span>
            <span className={`joeaiOwnershipBadge ${item.owned ? 'owned' : 'discovery'}`}>
              {item.owned ? '✓ Already in Library' : '✦ New Discovery'}
            </span>
          </div>

          <h3>{name}</h3>

          <div className="joeaiRecMeta">
            {item.year && <span>{item.year}</span>}
            {item.episodes && <span>{item.episodes} eps</span>}
            {item.studio && <span>{item.studio}</span>}
            {item.communityScore && <span>MAL {item.communityScore}</span>}
          </div>

          <div className="joeaiPremiumInsight">
            <span>🧠 JoeAI Insight</span>
            <p>{recommendationSummary(item, sourceTitle)}</p>
          </div>

          {tags.length > 0 && (
            <div className="joeaiTraitCloud" aria-label="Recommendation traits">
              {tags.map((tag) => {
                const category = traitCategory(tag);
                return (
                  <span key={tag} className={`joeaiTraitChip ${category}`}>
                    <small>{traitCategoryLabel(category)}</small>
                    <b>{traitEmoji(tag)} {tag}</b>
                  </span>
                );
              })}
            </div>
          )}

          <div className={`joeaiExplainPanel ${isExpanded ? 'open' : ''}`}>
            <div className="joeaiExplainHeader">
              <div>
                <p>JoeAI Match Analysis</p>
                <h4>Why this fits your taste</h4>
              </div>
              <span>{confidenceLabel(confidence)} confidence</span>
            </div>

            <div className="joeaiMeterGrid">
              {renderMeter('JoeAI Confidence', confidence, 'confidence')}
              {renderMeter('Shared Anime DNA', dna, 'dna')}
            </div>

            <div className="joeaiReasonBullets">
              {bullets.map((bullet) => <span key={bullet}>{bullet}</span>)}
            </div>

            {facts.length > 0 && (
              <div className="joeaiLibraryRelationship">
                <p>Your relationship with this title</p>
                <div>
                  {facts.map((fact) => (
                    <span key={fact.label}>
                      <small>{fact.label}</small>
                      <strong>{fact.value}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <p className="joeaiExplainCopy">
              Because you asked about <strong>{sourceTitle}</strong>, JoeAI compared shared themes,
              character dynamics, world design, tone, and your personal library signals—not just surface genres.
            </p>

            {item.deepDive && (
              <details className="joeaiTechnicalNotes">
                <summary>Technical Genome notes</summary>
                <pre>{item.deepDive}</pre>
              </details>
            )}
          </div>

          <div className="joeaiRecActions joeaiPremiumActions">
            <button type="button" onClick={() => toggleRecommendationWhy(id)}>
              {isExpanded ? 'Hide Explanation' : '🧠 Explain Match'}
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => addAnimeToLibrary({ title: name, status: 'Watching', selectedAnime: item })}
              disabled={isAdding || !updateAnime}
            >
              {isAdding ? 'Saving...' : item.owned ? '📚 Update Library Entry' : '+ Add to Library'}
            </button>
          </div>
        </div>
      </article>
    );
  }

  const joeAIStats = useMemo(() => {
    const completed = anime.filter(
      (item) => String(item.status || '').toLowerCase() === 'completed'
    ).length;

    const rewatches = anime.reduce(
      (sum, item) => sum + Number(item.rewatches || 0),
      0
    );

    const favorites = anime.filter((item) => item.favorite);
    const episodes = anime.reduce(
      (sum, item) => sum + Number(item.episodeCount || item.episodes || 0),
      0
    );

    const genreRows = countBy(anime.flatMap((item) => item.genres || [])).slice(0, 6);
    const maxGenre = genreRows[0]?.[1] || 1;

    return {
      completed,
      rewatches,
      favorites,
      episodes,
      genreRows,
      maxGenre
    };
  }, [anime]);

  const joeAIPick = useMemo(() => {
    const libraryIds = new Set(
      anime.flatMap((item) => [
        item.malId ? `mal:${item.malId}` : '',
        item.title ? `title:${String(item.title).toLowerCase()}` : ''
      ]).filter(Boolean)
    );

    const topGenres = new Set(
      joeAIStats.genreRows.slice(0, 4).map(([name]) => String(name).toLowerCase())
    );

    const candidates = (catalog || [])
      .filter((item) => {
        const malKey = item.malId ? `mal:${item.malId}` : '';
        const titleKey = item.title ? `title:${String(item.title).toLowerCase()}` : '';
        return !(malKey && libraryIds.has(malKey)) && !(titleKey && libraryIds.has(titleKey));
      })
      .map((item) => {
        const overlap = (item.genres || []).filter((genre) =>
          topGenres.has(String(genre).toLowerCase())
        ).length;

        const community = Number(item.communityScore || item.malScore || item.score || 0);
        return {
          item,
          value: overlap * 20 + community * 4,
          confidence: Math.max(62, Math.min(98, Math.round(66 + overlap * 7 + community)))
        };
      })
      .sort((a, b) => b.value - a.value);

    return candidates[0] || null;
  }, [anime, catalog, joeAIStats.genreRows]);

  const joeAIThought = useMemo(() => {
    const topGenre = joeAIStats.genreRows[0]?.[0] || 'Adventure';
    const comfortCount = joeAIStats.favorites.length;

    if (joeAIStats.rewatches >= 8) {
      return {
        eyebrow: 'JoeAI noticed a comfort pattern',
        headline: `${topGenre} keeps pulling you back.`,
        body: `${joeAIStats.rewatches} rewatches and ${comfortCount} comfort anchors suggest you value familiar worlds and long-term attachment—not just novelty.`
      };
    }

    return {
      eyebrow: 'JoeAI found your strongest signal',
      headline: `${topGenre} is leading your Anime DNA.`,
      body: `${joeAIStats.completed} completed titles are shaping this pattern. Ratings, rewatches, favorites, and rejected picks will keep making it sharper.`
    };
  }, [joeAIStats]);

  const quickPrompts = [
    'what should I watch next?',
    'recommend something like Bleach',
    'show me a hidden gem',
    'give me a movie for tonight',
    'why do I like long adventures?',
    'what changed in my Anime DNA?'
  ];

  function runPrompt(prompt) {
    setText(prompt);
    void ask(prompt);
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
    <section className="joeAICommandCenter">
      <section className="joeAIHero">
        <div className="joeAIHeroCopy">
          <div className="joeAIHeroTitle">
            <span className="joeAIHeroIcon">✦</span>
            <div>
              <p>JoeAnimeDB Intelligence</p>
              <h1>JoeAI</h1>
            </div>
          </div>

          <span className="joeAIEyebrow">{joeAIThought.eyebrow}</span>
          <h2>{joeAIThought.headline}</h2>
          <p className="joeAIHeroBody">{joeAIThought.body}</p>

          <button
            type="button"
            className="joeAIAnalysisLink"
            onClick={() => runPrompt('explain my current Anime DNA and strongest taste patterns')}
          >
            Explain how you read my library →
          </button>
        </div>

        <div className="joeAIHeroBrain" aria-hidden="true">
          <img src={joeAIHologramBrain} alt="" />
        </div>

        <aside className="joeAIHeroStats">
          <div>
            <span>▤</span>
            <strong>{joeAIStats.episodes.toLocaleString()}</strong>
            <small>Episodes Tracked</small>
          </div>
          <div>
            <span>↻</span>
            <strong>{joeAIStats.rewatches}</strong>
            <small>Total Rewatches</small>
          </div>
          <div>
            <span>♡</span>
            <strong>{joeAIStats.favorites.length}</strong>
            <small>Comfort Anchors</small>
          </div>
        </aside>
      </section>

      <section className="joeAIOverviewGrid">
        <article className="joeAIPickCard">
          <header>
            <span>☆</span>
            <h2>JoeAI Pick of the Day</h2>
          </header>

          {joeAIPick ? (
            <div className="joeAIPickInner">
              <Poster anime={joeAIPick.item} className="joeAIPickPoster" mode="thumb" />
              <div>
                <div className="joeAIPickHeading">
                  <h3>{joeAIPick.item.officialTitle || joeAIPick.item.title}</h3>
                  <strong>{joeAIPick.confidence}% Match</strong>
                </div>

                <div className="joeAIPickTags">
                  {(joeAIPick.item.genres || []).slice(0, 4).map((genre) => (
                    <span key={genre}>{genre}</span>
                  ))}
                </div>

                <p>
                  This overlaps with the strongest genres and patterns already visible in your library.
                </p>

                <div className="joeAIPickActions">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => runPrompt(`tell me why you recommend ${joeAIPick.item.title}`)}
                  >
                    Why This?
                  </button>
                  <button
                    type="button"
                    onClick={() => runPrompt(`add ${joeAIPick.item.title} as watching`)}
                  >
                    + Watching
                  </button>
                  <button
                    type="button"
                    onClick={() => runPrompt(`recommend something else instead of ${joeAIPick.item.title}`)}
                  >
                    Another Pick
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className="joeAIEmptyCard">Add more catalog titles and JoeAI will choose a daily pick.</p>
          )}
        </article>

        <article className="joeAIDNACard">
          <header>
            <span>⌬</span>
            <h2>Your Anime DNA</h2>
          </header>

          <div className="joeAIDNARows">
            {joeAIStats.genreRows.map(([name, count]) => (
              <button
                type="button"
                key={name}
                onClick={() => runPrompt(`explain why ${name} is part of my Anime DNA`)}
              >
                <span>{name}</span>
                <i>
                  <b style={{ width: `${Math.max(8, Math.round((count / joeAIStats.maxGenre) * 100))}%` }} />
                </i>
                <strong>{Math.round((count / joeAIStats.maxGenre) * 100)}%</strong>
              </button>
            ))}
          </div>
        </article>

        <article className="joeAIActivityCard">
          <header>
            <span>◷</span>
            <h2>JoeAI Knows</h2>
          </header>

          <div className="joeAIActivityRows">
            <div><span>✓</span><strong>{joeAIStats.completed} completed</strong><small>analyzed</small></div>
            <div><span>↻</span><strong>{joeAIStats.rewatches} rewatches</strong><small>comfort signal</small></div>
            <div><span>♡</span><strong>{joeAIStats.favorites.length} favorites</strong><small>strong anchors</small></div>
            <div><span>✦</span><strong>{catalog.length} catalog titles</strong><small>available to recommend</small></div>
          </div>
        </article>
      </section>

      <section className="joeAIChatShell">
        <header className="joeAIChatHeader">
          <div>
            <span>💬</span>
            <div>
              <p>Talk to your anime brain</p>
              <h2>Ask JoeAI</h2>
            </div>
          </div>
          <small>Understands recommendations, library actions, bulk adds, ratings, and Anime DNA.</small>
        </header>

        <div className="joeAIStarterChips">
          {quickPrompts.map((prompt) => (
            <button type="button" key={prompt} onClick={() => runPrompt(prompt)}>
              {prompt}
            </button>
          ))}
        </div>

        <div ref={conversationRef} className="assistant-log joeAIConversation">
          {log.map((message, index) => renderMessage(message, index))}
        </div>

        <div className="assistant-input joeaiChatInput joeAIComposer">
          <textarea
            placeholder={'Ask JoeAI anything...\nTry: recommend something dark under 24 episodes'}
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
          <button onClick={() => ask()}>Ask JoeAI</button>
        </div>
      </section>

    </section>
  );
}

export function Analytics({ anime, setSelected, updateAnime }) {
  const [selectedFilters, setSelectedFilters] = useState({ studio: null, genre: null });
  const [studioLimit, setStudioLimit] = useState(12);
  const [genreLimit, setGenreLimit] = useState(12);
  const [resultQuery, setResultQuery] = useState('');
  const [resultSort, setResultSort] = useState('score');
  const [resultLimit, setResultLimit] = useState(24);
  const resultsRef = useRef(null);

  function normalizedName(value) {
    if (value && typeof value === 'object') {
      return String(value.name || value.title || value.label || '').trim();
    }
    return String(value || '').trim();
  }

  function uniqueNames(values = []) {
    const seen = new Set();
    return values
      .map(normalizedName)
      .filter(Boolean)
      .filter((name) => {
        const key = name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function studiosFor(item = {}) {
    const plural = [
      ...(Array.isArray(item.studios) ? item.studios : []),
      ...(Array.isArray(item.productionStudios) ? item.productionStudios : []),
      ...(Array.isArray(item.animationStudios) ? item.animationStudios : [])
    ];

    // Older entries use one `studio` string; newer metadata can carry an array.
    // Keep both paths and de-duplicate so Analytics never silently drops a studio.
    const legacyStudioNames = String(item.studio || '')
      .split(/\s+\/\s+|\s*;\s*|\s*\|\s*/)
      .map((value) => value.trim())
      .filter(Boolean);

    return uniqueNames([...plural, ...legacyStudioNames]);
  }

  function genresFor(item = {}) {
    const raw = Array.isArray(item.genres)
      ? item.genres
      : String(item.genres || '')
          .split(',')
          .map((value) => value.trim());
    return uniqueNames(raw);
  }

  const studioIndex = useMemo(() => {
    const map = new Map();
    anime.forEach((item) => {
      studiosFor(item).forEach((studio) => {
        const key = studio.toLowerCase();
        const current = map.get(key) || { name: studio, items: [] };
        current.items.push(item);
        map.set(key, current);
      });
    });
    return [...map.values()].sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  }, [anime]);

  const genreIndex = useMemo(() => {
    const map = new Map();
    anime.forEach((item) => {
      genresFor(item).forEach((genre) => {
        const key = genre.toLowerCase();
        const current = map.get(key) || { name: genre, items: [] };
        current.items.push(item);
        map.set(key, current);
      });
    });
    return [...map.values()].sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  }, [anime]);

  const studios = studioIndex.map((entry) => [entry.name, entry.items.length]);
  const genres = genreIndex.map((entry) => [entry.name, entry.items.length]);
  const rated = anime.filter((item) => Number(item.joeScore || item.score || item.finalScore || item.rating || 0) > 0);
  const favorites = anime.filter((item) => item.favorite).length;
  const rewatches = anime.reduce((sum, item) => sum + Number(item.rewatches || 0), 0);
  const averageScore = rated.length
    ? (rated.reduce((sum, item) => sum + Number(item.joeScore || item.score || item.finalScore || item.rating || 0), 0) / rated.length).toFixed(2)
    : '—';
  const topGenre = genres[0]?.[0] || 'Your taste';
  const topStudio = studios[0]?.[0] || 'Studios';
  const missingStudioCount = anime.filter((item) => studiosFor(item).length === 0).length;
  const missingGenreCount = anime.filter((item) => genresFor(item).length === 0).length;

  const liveRankMap = useMemo(() => {
    const ranked = [...anime].sort((a, b) => {
      const aScore = Number(a.joeScore ?? a.rating ?? a.predictedScore ?? 0);
      const bScore = Number(b.joeScore ?? b.rating ?? b.predictedScore ?? 0);
      if (bScore !== aScore) return bScore - aScore;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });
    return new Map(ranked.map((item, index) => [String(item.id), index + 1]));
  }, [anime]);

  const hasActiveFilters = Boolean(selectedFilters.studio || selectedFilters.genre);

  const selectedItems = useMemo(() => {
    if (!hasActiveFilters) return [];
    return anime.filter((item) => {
      const studioMatch = !selectedFilters.studio || studiosFor(item).some((name) => name.toLowerCase() === selectedFilters.studio.toLowerCase());
      const genreMatch = !selectedFilters.genre || genresFor(item).some((name) => name.toLowerCase() === selectedFilters.genre.toLowerCase());
      return studioMatch && genreMatch;
    });
  }, [anime, selectedFilters, hasActiveFilters]);

  const filteredResults = useMemo(() => {
    const query = resultQuery.trim().toLowerCase();
    const rows = selectedItems.filter((item) => !query || String(item.title || '').toLowerCase().includes(query));

    return [...rows].sort((a, b) => {
      if (resultSort === 'title') return String(a.title || '').localeCompare(String(b.title || ''));
      if (resultSort === 'year') return Number(b.year || 0) - Number(a.year || 0) || String(a.title || '').localeCompare(String(b.title || ''));
      return (liveRankMap.get(String(a.id)) || 999999) - (liveRankMap.get(String(b.id)) || 999999);
    });
  }, [selectedItems, resultQuery, resultSort, liveRankMap]);

  const insight = useMemo(() => {
    if (!hasActiveFilters) return null;
    const scores = selectedItems
      .map((item) => Number(item.joeScore || item.score || item.finalScore || item.rating || 0))
      .filter((value) => value > 0);
    const avg = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;
    const libraryScores = anime
      .map((item) => Number(item.joeScore || item.score || item.finalScore || item.rating || 0))
      .filter((value) => value > 0);
    const libraryAvg = libraryScores.length ? libraryScores.reduce((sum, value) => sum + value, 0) / libraryScores.length : null;
    const favoritesInSelection = selectedItems.filter((item) => item.favorite).length;
    const rewatchesInSelection = selectedItems.reduce((sum, item) => sum + Number(item.rewatches || 0), 0);
    return { avg, libraryAvg, favoritesInSelection, rewatchesInSelection, ratedCount: scores.length };
  }, [anime, selectedItems, hasActiveFilters]);

  function openSignal(type, name) {
    setSelectedFilters((current) => ({
      ...current,
      [type]: current[type]?.toLowerCase() === name.toLowerCase() ? null : name
    }));
    setResultQuery('');
    setResultSort('score');
    setResultLimit(24);
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function clearFilter(type) {
    setSelectedFilters((current) => ({ ...current, [type]: null }));
    setResultLimit(24);
  }

  return (
    <section className="analyticsLabPage">
      <section className="analyticsLabHero">
        <div className="analyticsLabBackdrop" aria-hidden="true" />
        <div className="analyticsLabShade" aria-hidden="true" />

        <div className="analyticsLabCopy">
          <div>
            <p className="analyticsLabEyebrow">JoeAI Research Division</p>
            <h1>Analytics</h1>
            <p className="analyticsLabLead">
              JoeAI is decoding the patterns behind your collection—studios, genres, ratings, rewatches, and the signals that define your Anime DNA.
            </p>
            <p className="analyticsLabInsight">
              <span>Analysis signal</span>
              <strong>{topGenre}</strong> leads your taste profile, while <strong>{topStudio}</strong> is your most represented studio.
            </p>
          </div>

          <div className="analyticsLabStats">
            <div><span>▤</span><strong>{anime.length}</strong><small>Titles Scanned</small></div>
            <div><span>★</span><strong>{averageScore}</strong><small>Average Score</small></div>
            <div><span>♡</span><strong>{favorites}</strong><small>Favorites</small></div>
            <div><span>↻</span><strong>{rewatches}</strong><small>Rewatches</small></div>
          </div>
        </div>
      </section>

      <section className="analyticsCoverageStrip">
        <div><strong>{studioIndex.length}</strong><span>Studios detected</span></div>
        <div><strong>{genreIndex.length}</strong><span>Genres detected</span></div>
        <div className={missingStudioCount ? 'needsAttention' : ''}><strong>{missingStudioCount}</strong><span>Titles missing studio data</span></div>
        <div className={missingGenreCount ? 'needsAttention' : ''}><strong>{missingGenreCount}</strong><span>Titles missing genre data</span></div>
      </section>

      <section className="analyticsLabGrid">
        <BarPanel
          title="Studio DNA"
          subtitle="Click a studio to open its titles below"
          data={studios}
          icon="▦"
          type="studio"
          limit={studioLimit}
          setLimit={setStudioLimit}
          onSelect={openSignal}
          activeFilters={selectedFilters}
        />
        <BarPanel
          title="Genre DNA"
          subtitle="Click a genre to open its titles below"
          data={genres}
          icon="⌬"
          type="genre"
          limit={genreLimit}
          setLimit={setGenreLimit}
          onSelect={openSignal}
          activeFilters={selectedFilters}
        />
      </section>

      <section ref={resultsRef} className={`analyticsSignalResults ${hasActiveFilters ? 'isOpen' : ''}`}>
        {hasActiveFilters ? (
          <>
            <header className="analyticsResultsHeader">
              <div>
                <p>Interactive Collection Browser</p>
                <h2>{[selectedFilters.studio, selectedFilters.genre].filter(Boolean).join(' × ')}</h2>
                <span>{selectedItems.length} matching title{selectedItems.length === 1 ? '' : 's'} in your library</span>
              </div>
              <button type="button" onClick={() => setSelectedFilters({ studio: null, genre: null })}>Clear all</button>
            </header>

            <div className="analyticsFilterChips" aria-label="Active analytics filters">
              {selectedFilters.studio && (
                <button type="button" onClick={() => clearFilter('studio')}>Studio: {selectedFilters.studio} <span>×</span></button>
              )}
              {selectedFilters.genre && (
                <button type="button" onClick={() => clearFilter('genre')}>Genre: {selectedFilters.genre} <span>×</span></button>
              )}
              {(!selectedFilters.studio || !selectedFilters.genre) && (
                <small>Click a {selectedFilters.studio ? 'genre' : 'studio'} above to stack another filter.</small>
              )}
            </div>

            {insight && (
              <aside className="analyticsJoeInsight">
                <div><span>✦</span><strong>JoeAI Insight</strong></div>
                <p>
                  This selection contains <b>{selectedItems.length}</b> title{selectedItems.length === 1 ? '' : 's'}
                  {insight.avg ? <> with an average rating of <b>{insight.avg.toFixed(2)}</b></> : ''}.
                  {insight.avg && insight.libraryAvg ? (insight.avg >= insight.libraryAvg
                    ? <> That is <b>{(insight.avg - insight.libraryAvg).toFixed(2)}</b> above your library average.</>
                    : <> That is <b>{(insight.libraryAvg - insight.avg).toFixed(2)}</b> below your library average.</>) : ''}
                  {insight.favoritesInSelection ? <> It includes <b>{insight.favoritesInSelection}</b> favorite{insight.favoritesInSelection === 1 ? '' : 's'}.</> : ''}
                  {insight.rewatchesInSelection ? <> You have logged <b>{insight.rewatchesInSelection}</b> rewatch{insight.rewatchesInSelection === 1 ? '' : 'es'} here.</> : ''}
                </p>
              </aside>
            )}

            <div className="analyticsResultsToolbar">
              <input
                type="search"
                placeholder={`Search matching titles...`}
                value={resultQuery}
                onChange={(event) => { setResultQuery(event.target.value); setResultLimit(24); }}
              />
              <select value={resultSort} onChange={(event) => setResultSort(event.target.value)}>
                <option value="score">Your Rank</option>
                <option value="title">Title A–Z</option>
                <option value="year">Newest Year</option>
              </select>
              <span>{filteredResults.length} shown</span>
            </div>

            <div className="analyticsCardGrid">
              {filteredResults.slice(0, resultLimit).map((item) => (
                <AnimeCard
                  key={item.id}
                  anime={item}
                  displayRank={liveRankMap.get(String(item.id))}
                  totalCount={anime.length}
                  setSelected={setSelected}
                  updateAnime={updateAnime}
                />
              ))}
            </div>

            {!filteredResults.length && <p className="analyticsNoResults">No titles match this filter combination.</p>}

            {resultLimit < filteredResults.length && (
              <button className="analyticsShowMoreCards" type="button" onClick={() => setResultLimit((current) => current + 24)}>
                Show 24 more
              </button>
            )}
          </>
        ) : (
          <div className="analyticsResultsEmpty">
            <span>⌁</span>
            <h2>Explore your Anime DNA</h2>
            <p>Click a studio or genre above. Then click the other column to stack filters and narrow the cards without leaving Analytics.</p>
          </div>
        )}
      </section>
    </section>
  );
}

function BarPanel({ title, subtitle, data, icon, type, limit, setLimit, onSelect, activeFilters }) {
  const max = data[0]?.[1] || 1;
  const visibleData = data.slice(0, limit);
  const showingAll = limit >= data.length;

  return (
    <article className="analyticsDataPanel">
      <header>
        <span>{icon}</span>
        <div>
          <p>JoeAI Analysis</p>
          <h2>{title}</h2>
          <small>{subtitle}</small>
        </div>
      </header>

      <div className="analyticsDataRows">
        {visibleData.map(([name, count], index) => {
          const isActive = activeFilters?.[type]?.toLowerCase() === name.toLowerCase();
          return (
            <button
              type="button"
              className={`analyticsDataRow ${isActive ? 'active' : ''}`}
              key={name}
              onClick={() => onSelect(type, name)}
            >
              <span className="analyticsDataRank">{String(index + 1).padStart(2, '0')}</span>
              <strong title={name}>{name}</strong>
              <span className="analyticsDataBar"><i style={{ width: `${Math.max(5, (count / max) * 100)}%` }} /></span>
              <b>{count}</b>
              <em>View titles →</em>
            </button>
          );
        })}
        {!data.length && <p className="analyticsEmpty">Add more anime metadata to reveal this signal.</p>}
      </div>

      {data.length > 12 && (
        <button
          type="button"
          className="analyticsPanelToggle"
          onClick={() => setLimit(showingAll ? 12 : data.length)}
        >
          {showingAll ? 'Show top 12' : `Show all ${data.length}`}
        </button>
      )}
    </article>
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
  resetNewUserMode,
  onOpenIntegrity
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

      <section className="settingsIntegrityCard">
        <div>
          <p className="eyebrow">JoeAI Library Maintenance</p>
          <h2>🛠 Library Integrity</h2>
          <p>Scan for duplicate seasons and incomplete metadata, then safely merge or repair affected titles.</p>
        </div>
        <button type="button" onClick={onOpenIntegrity}>Open Integrity Scan</button>
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
