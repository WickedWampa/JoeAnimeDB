import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../styles/joeanime-splash.css';
import joeAnimeSplashHero from '../assets/joeanime-splash-hero.png';
import joeAIHologramBrain from '../assets/joeai-hologram-brain.png';
import '../styles/joeai-command-center.css';
import '../styles/settings-art.css';
import { Poster } from '../components/Poster';
import { AnimeCard } from '../components/AnimeCard';
import { score, countBy } from '../utils/animeUtils';
import {
  exportBackup,
  exportLibraryList,
  exportRankedLibraryList,
  exportLibraryCsv,
  resetData
} from '../services/storage';
import { createAnimeBrain } from '../engine/animeBrain'; import { fetchMetadata } from '../services/metadata'; import { maybeKnowledgeFirstRecommendation } from '../ai/knowledgeFirstRecommender'; import { parseJoeAIIntent } from '../ai/intentParser'; import { executeJoeAICommand } from '../ai/commandExecutor'; import { routeJoeAIRecommendation } from '../ai/joeAIRecommendationRouter';
import { buildTonightsWatch } from '../ai/tonightsWatch'; import { importAnimeByTitle, mergeAnimeMetadata, searchAnimeCandidates } from '../services/animeImporter';
import { fetchWikidataRepair, needsWikidataRepair } from '../services/wikidataRepair';
import { getAnimeStudios, getAnimeTasteSignals } from '../utils/metadataAdapters';

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
    let storedPrompt = '';

    try {
      storedPrompt = String(
        localStorage.getItem('joeanime-pending-joeai-prompt') || ''
      ).trim();
    } catch (error) {
      console.warn('Could not read JoeAI Quick Ask prompt:', error);
    }

    const prompt = String(initialPrompt || storedPrompt || '').trim();

    if (!prompt) {
      lastAutoPromptRef.current = '';
      return;
    }

    if (lastAutoPromptRef.current === prompt) return;

    lastAutoPromptRef.current = prompt;

    try {
      localStorage.removeItem('joeanime-pending-joeai-prompt');
    } catch (error) {
      console.warn('Could not clear JoeAI Quick Ask prompt:', error);
    }

    void ask(prompt);
    onPromptConsumed?.();
  }, [initialPrompt, onPromptConsumed]);

  useEffect(() => {
    function handlePendingPrompt(event) {
      if (event.key !== 'joeanime-pending-joeai-prompt') return;

      const prompt = String(event.newValue || '').trim();
      if (!prompt || lastAutoPromptRef.current === prompt) return;

      lastAutoPromptRef.current = prompt;

      try {
        localStorage.removeItem('joeanime-pending-joeai-prompt');
      } catch (error) {
        console.warn('Could not clear JoeAI Quick Ask prompt:', error);
      }

      void ask(prompt);
    }

    window.addEventListener('storage', handlePendingPrompt);
    return () => window.removeEventListener('storage', handlePendingPrompt);
  }, []);

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
  const [coverageReview, setCoverageReview] = useState(null);
  const resultsRef = useRef(null);
  const coverageReviewRef = useRef(null);

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
  const missingStudioTitles = useMemo(
    () => anime.filter((item) => studiosFor(item).length === 0),
    [anime]
  );
  const missingGenreTitles = useMemo(
    () => anime.filter((item) => genresFor(item).length === 0),
    [anime]
  );
  const missingStudioCount = missingStudioTitles.length;
  const missingGenreCount = missingGenreTitles.length;

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

  function openCoverageReview(type) {
    const count = type === 'studio' ? missingStudioCount : missingGenreCount;
    if (!count) return;

    setCoverageReview((current) => current === type ? null : type);

    requestAnimationFrame(() => {
      coverageReviewRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    });
  }

  const coverageReviewItems =
    coverageReview === 'studio'
      ? missingStudioTitles
      : coverageReview === 'genre'
        ? missingGenreTitles
        : [];

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

        <button
          type="button"
          className={`${missingStudioCount ? 'needsAttention' : ''} ${coverageReview === 'studio' ? 'isActive' : ''}`}
          onClick={() => openCoverageReview('studio')}
          disabled={!missingStudioCount}
          aria-expanded={coverageReview === 'studio'}
        >
          <strong>{missingStudioCount}</strong>
          <span>Titles missing studio data</span>
          <small>{missingStudioCount ? 'View titles →' : 'Complete'}</small>
        </button>

        <button
          type="button"
          className={`${missingGenreCount ? 'needsAttention' : ''} ${coverageReview === 'genre' ? 'isActive' : ''}`}
          onClick={() => openCoverageReview('genre')}
          disabled={!missingGenreCount}
          aria-expanded={coverageReview === 'genre'}
        >
          <strong>{missingGenreCount}</strong>
          <span>Titles missing genre data</span>
          <small>{missingGenreCount ? 'View titles →' : 'Complete'}</small>
        </button>
      </section>

      <section
        ref={coverageReviewRef}
        className={`analyticsCoverageReview ${coverageReview ? 'isOpen' : ''}`}
      >
        {coverageReview ? (
          <>
            <header>
              <div>
                <p>Metadata Coverage Report</p>
                <h2>{coverageReview === 'studio' ? 'Missing Studio Data' : 'Missing Genre Data'}</h2>
                <span>{coverageReviewItems.length} title{coverageReviewItems.length === 1 ? '' : 's'} still need metadata.</span>
              </div>
              <button type="button" onClick={() => setCoverageReview(null)}>Close</button>
            </header>

            <div className="analyticsCoverageReviewList">
              {coverageReviewItems.map((item, index) => (
                <button
                  type="button"
                  key={item.id || item.title || index}
                  onClick={() => setSelected?.(item)}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{item.officialTitle || item.title}</strong>
                    <small>
                      {[
                        item.year || '',
                        item.type || '',
                        Number(item.episodeCount || item.episodes || 0)
                          ? `${Number(item.episodeCount || item.episodes)} eps`
                          : ''
                      ].filter(Boolean).join(' · ') || 'No additional metadata'}
                    </small>
                  </div>
                  <b>Open details →</b>
                </button>
              ))}
            </div>
          </>
        ) : null}
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
  updateAnime,
  syncMetadata,
  stats,
  onOpenIntegrity,
  onOpenMetadataHealth
}) {
  const [genomeUpdateStatus, setGenomeUpdateStatus] = React.useState('');
  const [metadataRepairStatus, setMetadataRepairStatus] = React.useState('');
  const [metadataRepairProgress, setMetadataRepairProgress] = React.useState(null);
  const [metadataRepairSummary, setMetadataRepairSummary] = React.useState(null);
  const [libraryImportStatus, setLibraryImportStatus] = React.useState('');
  const [libraryImportProgress, setLibraryImportProgress] = React.useState(null);
  const [libraryImportSummary, setLibraryImportSummary] = React.useState(() => {
    try {
      const saved = localStorage.getItem('joeanime-library-import-review-v1');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const libraryImportInputRef = React.useRef(null);

  function saveLibraryImportSummary(summary) {
    setLibraryImportSummary(summary);

    try {
      if (summary?.failed?.length || summary?.added?.length || summary?.skipped?.length) {
        localStorage.setItem(
          'joeanime-library-import-review-v1',
          JSON.stringify(summary)
        );
      } else {
        localStorage.removeItem('joeanime-library-import-review-v1');
      }
    } catch (error) {
      console.warn('Could not persist library import review.', error);
    }
  }

  function clearLibraryImportReview() {
    saveLibraryImportSummary(null);
    setLibraryImportStatus('');

    try {
      localStorage.removeItem('joeanime-library-import-review-v1');
    } catch (error) {
      console.warn('Could not clear library import review.', error);
    }
  }

  function parseCsvLine(line = '') {
    const values = [];
    let current = '';
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];

      if (character === '"') {
        if (quoted && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (character === ',' && !quoted) {
        values.push(current.trim());
        current = '';
      } else {
        current += character;
      }
    }

    values.push(current.trim());
    return values;
  }

  const LIBRARY_IMPORT_TITLE_ALIASES = new Map([
    ['re zero starting life in another world', 'Re:ZERO -Starting Life in Another World-'],
    ['tsukimichi moonlit fantasy', 'TSUKIMICHI -Moonlit Fantasy-'],
    ['solo leveling season 2 arise from the shadow', 'Solo Leveling Season 2: Arise from the Shadow'],
    ['that time i got reincarnated as a slime the movie scarlet bond', 'That Time I Got Reincarnated as a Slime: The Movie - Scarlet Bond'],
    ['demon slayer kimetsu no yaiba', 'Demon Slayer: Kimetsu no Yaiba']
  ]);

  function importTitleKey(value = '') {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[’‘]/g, "'")
      .replace(/[^a-z0-9]+/gi, ' ')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function normalizeLibraryImportTitle(value = '') {
    const clean = String(value || '')
      .replace(/[‐‑‒–—―]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();

    return LIBRARY_IMPORT_TITLE_ALIASES.get(importTitleKey(clean)) || clean;
  }

  function importedTitleMatchesLibraryItem(requestedTitle = '', item = {}) {
    const wanted = importTitleKey(requestedTitle);
    if (!wanted) return false;

    const titles = [
      item.title,
      item.officialTitle,
      item.englishTitle,
      item.canonicalTitle,
      ...(Array.isArray(item.titleSynonyms) ? item.titleSynonyms : [])
    ]
      .map(importTitleKey)
      .filter(Boolean);

    return titles.includes(wanted);
  }

  function normalizeImportedStatus(value = '') {
    const normalized = String(value || '').trim().toLowerCase();

    if (normalized.includes('complete') || normalized.includes('watched') || normalized.includes('finished')) {
      return 'Completed';
    }
    if (normalized.includes('watching') || normalized.includes('current')) return 'Watching';
    if (normalized.includes('hold')) return 'On Hold';
    if (normalized.includes('drop')) return 'Dropped';
    if (normalized.includes('plan')) return 'Plan to Watch';

    return 'Completed';
  }

  function cleanImportedTitle(value = '') {
    return String(value || '')
      .replace(/^\uFEFF/, '')
      .replace(/^\s*\d+\s*[.)-]\s*/, '')
      .replace(/^\s*[-*•]\s*/, '')
      .replace(/\s*\|\s*Score:.*$/i, '')
      .trim();
  }

  function parseLibraryImport(text = '', filename = '') {
    const raw = String(text || '').replace(/\r/g, '');
    const isCsv =
      String(filename || '').toLowerCase().endsWith('.csv') ||
      /^\s*"?title"?\s*,/i.test(raw);

    const rows = [];

    if (isCsv) {
      const lines = raw.split('\n').filter((line) => line.trim());
      if (!lines.length) return rows;

      const headers = parseCsvLine(lines[0]).map((header) =>
        String(header || '').trim().toLowerCase()
      );
      const titleIndex = Math.max(0, headers.findIndex((header) => header === 'title'));
      const statusIndex = headers.findIndex((header) => header === 'status');
      const scoreIndex = headers.findIndex((header) => header === 'score');

      lines.slice(1).forEach((line) => {
        const columns = parseCsvLine(line);
        const title = cleanImportedTitle(columns[titleIndex]);

        if (!title) return;

        rows.push({
          title: normalizeLibraryImportTitle(title),
          requestedTitle: title,
          status: normalizeImportedStatus(
            statusIndex >= 0 ? columns[statusIndex] : 'Completed'
          ),
          score:
            scoreIndex >= 0 && Number.isFinite(Number(columns[scoreIndex]))
              ? Number(columns[scoreIndex])
              : undefined
        });
      });
    } else {
      raw.split('\n').forEach((line) => {
        const trimmed = line.trim();

        if (
          !trimmed ||
          /^JoeAnimeDB /i.test(trimmed) ||
          /^Exported:/i.test(trimmed) ||
          /^Total titles:/i.test(trimmed)
        ) {
          return;
        }

        const statusMatch = trimmed.match(/\|\s*Status:\s*([^|]+)\s*$/i);
        const scoreMatch = trimmed.match(/\|\s*Score:\s*([^|]+)(?:\||$)/i);
        const title = cleanImportedTitle(trimmed);

        if (!title) return;

        const parsedScore = Number(scoreMatch?.[1]);

        rows.push({
          title: normalizeLibraryImportTitle(title),
          requestedTitle: title,
          status: normalizeImportedStatus(statusMatch?.[1] || 'Completed'),
          score: Number.isFinite(parsedScore) ? parsedScore : undefined
        });
      });
    }

    const seen = new Set();

    return rows.filter((row) => {
      const key = row.title.toLowerCase().replace(/[^a-z0-9]+/g, '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function importLibraryRows(rows = []) {
    if (!rows.length || !updateAnime) return;

    const confirmed = window.confirm(
      `Import ${rows.length} title${rows.length === 1 ? '' : 's'} into JoeAnimeDB? Existing titles will be skipped.`
    );

    if (!confirmed) return;

    setLibraryImportSummary(null);
    setLibraryImportStatus(`Starting import of ${rows.length} titles...`);

    let liveLibrary = [...(data?.anime || [])];
    const added = [];
    const addedIds = new Set();
    const skipped = [];
    const failed = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];

      setLibraryImportProgress({
        processed: index + 1,
        total: rows.length,
        title: row.title
      });
      setLibraryImportStatus(
        `Importing ${index + 1}/${rows.length}: ${row.title}`
      );

      try {
        const result = await importAnimeByTitle({
          title: row.requestedTitle || row.title,
          normalizedTitle: row.title,
          status: row.status || 'Completed',
          library: liveLibrary
        });

        if (result.duplicate) {
          const exactDuplicate = importedTitleMatchesLibraryItem(
            row.requestedTitle || row.title,
            result.duplicate
          );

          if (exactDuplicate) {
            skipped.push({
              requested: row.requestedTitle || row.title,
              matched: result.duplicate.officialTitle || result.duplicate.title,
              exact: true
            });
            continue;
          }

          const candidates = [
            ...(result.results || []),
            result.candidate
          ].filter(Boolean);

          failed.push({
            title: row.requestedTitle || row.title,
            normalizedTitle: row.title,
            status: row.status || 'Completed',
            score: row.score,
            reason:
              `Possible duplicate collision: importer matched this to “${result.duplicate.officialTitle || result.duplicate.title}”. Please confirm the correct season/title.`,
            candidates
          });
          continue;
        }

        const candidate = result.candidate;
        if (!candidate) {
          failed.push({
            title: row.requestedTitle || row.title,
            normalizedTitle: row.title,
            status: row.status || 'Completed',
            score: row.score,
            reason: 'No import candidate was returned.',
            candidates: result.results || []
          });
          continue;
        }

        const next = {
          ...candidate,
          id: candidate.id,
          title: candidate.title || row.title,
          status: row.status || candidate.status || 'Completed',
          joeScore:
            row.score !== undefined
              ? row.score
              : candidate.joeScore,
          favorite: Boolean(candidate.favorite),
          rewatches: Number(candidate.rewatches || 0),
          finalRank: liveLibrary.length + 1,
          notes:
            candidate.notes ||
            'Imported from a shared JoeAnimeDB library list.'
        };

        const saved = await updateAnime(next);
        liveLibrary = saved?.anime || [...liveLibrary, next];
        added.push(next.title);
        addedIds.add(String(next.id));
      } catch (error) {
        console.warn('Library list import failed:', row.title, error);

        let candidates = [];

        try {
          candidates = await searchAnimeCandidates(row.title, { limit: 5 });
        } catch (candidateError) {
          console.warn('Could not load review candidates:', row.title, candidateError);
        }

        failed.push({
          title: row.title,
          status: row.status || 'Completed',
          score: row.score,
          reason: error?.message || String(error),
          candidates
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 40));
    }

    // Run the exact same Wikidata repair used by the Workshop after every title
    // has been saved. Waiting until the full library exists is important because
    // local franchise inheritance can now use seasons imported later in the file.
    const postImportTargets = liveLibrary.filter((item) =>
      addedIds.has(String(item.id)) && needsWikidataRepair(item)
    );

    const autoRepaired = [];
    const autoUnresolved = [];

    for (let index = 0; index < postImportTargets.length; index += 1) {
      const item = postImportTargets[index];
      const displayTitle = item.officialTitle || item.title;

      setLibraryImportProgress({
        processed: index + 1,
        total: postImportTargets.length,
        title: displayTitle
      });
      setLibraryImportStatus(
        `Final metadata pass ${index + 1}/${postImportTargets.length}: ${displayTitle}`
      );

      try {
        const result = await fetchWikidataRepair(item, liveLibrary);
        const patch = result.patch || {};
        const repairedFields = [];

        if (patch.studio || patch.productionStudios?.length) repairedFields.push('studio');
        if (patch.genres?.length) repairedFields.push('genres');
        if (patch.year) repairedFields.push('year');
        if (patch.episodeCount || patch.episodes) repairedFields.push('episodes');

        if (!repairedFields.length) {
          autoUnresolved.push({
            title: displayTitle,
            reason: 'Matched metadata did not contain the remaining fields.'
          });
        } else {
          const completed = {
            ...item,
            ...patch,
            id: item.id,
            title: item.title,
            officialTitle: item.officialTitle || item.title,

            // Never replace artwork or user-owned values during automatic repair.
            cover: item.cover,
            poster: item.poster,
            image: item.image,
            posterImage: item.posterImage,
            coverImage: item.coverImage,
            joeScore: item.joeScore,
            score: item.score,
            favorite: item.favorite,
            rewatches: item.rewatches,
            notes: item.notes,
            status: item.status,

            metadataNeedsReview: false,
            metadataReviewReason: '',
            metadataNeedsRefresh: false,
            syncStatus: {
              ...(item.syncStatus || {}),
              dirty: false,
              importerFinalRepair: true,
              lastMetadataSync: new Date().toISOString()
            }
          };

          const saved = await updateAnime(completed);
          liveLibrary = saved?.anime || liveLibrary.map((row) =>
            String(row.id) === String(completed.id) ? completed : row
          );

          autoRepaired.push({
            title: displayTitle,
            fields: repairedFields,
            matchedTitle: result.matchedTitle,
            confidence: result.confidence
          });
        }
      } catch (error) {
        autoUnresolved.push({
          title: displayTitle,
          reason: error?.message || String(error),
          candidates: error?.candidates || []
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 180));
    }

    setLibraryImportProgress(null);
    saveLibraryImportSummary({
      added,
      skipped,
      failed,
      autoRepaired,
      autoUnresolved
    });
    setLibraryImportStatus(
      `Import finished — ${added.length} added, ${autoRepaired.length} automatically completed, ${skipped.length} already present, ${failed.length} failed.`
    );
  }

  async function importReviewedLibraryCandidate(failedItem, candidate) {
    if (!candidate || !updateAnime) return;

    setLibraryImportStatus(`Adding reviewed match: ${candidate.officialTitle || candidate.title}...`);

    try {
      const currentLibrary = data?.anime || [];
      const existing = currentLibrary.find((item) => {
        const left = String(item.officialTitle || item.title || '').toLowerCase();
        const right = String(candidate.officialTitle || candidate.title || '').toLowerCase();
        return left === right || (item.kitsuId && candidate.kitsuId && item.kitsuId === candidate.kitsuId);
      });

      if (existing) {
        const nextSummary = {
          ...libraryImportSummary,
          failed: (libraryImportSummary?.failed || []).filter((item) => item.title !== failedItem.title),
          skipped: [
            ...(libraryImportSummary?.skipped || []),
            { requested: failedItem.title, matched: existing.title }
          ]
        };
        saveLibraryImportSummary(nextSummary);
        setLibraryImportStatus(`${existing.title} is already in the library.`);
        return;
      }

      const next = {
        ...candidate,
        id: candidate.id || candidate.kitsuId || `import-${Date.now()}`,
        title: candidate.title || candidate.officialTitle || failedItem.title,
        officialTitle: candidate.officialTitle || candidate.title || failedItem.title,
        status: failedItem.status || 'Completed',
        joeScore:
          failedItem.score !== undefined
            ? failedItem.score
            : candidate.joeScore,
        favorite: Boolean(candidate.favorite),
        rewatches: Number(candidate.rewatches || 0),
        finalRank: currentLibrary.length + 1,
        notes: 'Imported after manual review from a shared JoeAnimeDB list.'
      };

      await updateAnime(next);

      const nextSummary = {
        ...libraryImportSummary,
        added: [...(libraryImportSummary?.added || []), next.title],
        failed: (libraryImportSummary?.failed || []).filter((item) => item.title !== failedItem.title)
      };
      saveLibraryImportSummary(nextSummary);

      setLibraryImportStatus(`Added ${next.title} from Needs Review.`);
    } catch (error) {
      setLibraryImportStatus(
        `Could not add reviewed title: ${error?.message || String(error)}`
      );
    }
  }

  async function copyFailedLibraryTitles() {
    const failed = libraryImportSummary?.failed || [];
    if (!failed.length) return;

    const text = failed.map((item) => item.title).join('\\n');

    try {
      await navigator.clipboard.writeText(text);
      setLibraryImportStatus(`Copied ${failed.length} failed title${failed.length === 1 ? '' : 's'} to the clipboard.`);
    } catch {
      setLibraryImportStatus('Could not copy failed titles to the clipboard.');
    }
  }

  async function handleLibraryImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    try {
      setLibraryImportStatus(`Reading ${file.name}...`);
      const text = await file.text();
      const rows = parseLibraryImport(text, file.name);

      if (!rows.length) {
        setLibraryImportStatus(
          'No anime titles were found. Use a JoeAnimeDB TXT or CSV export.'
        );
        return;
      }

      await importLibraryRows(rows);
    } catch (error) {
      setLibraryImportStatus(
        `Could not import file: ${error?.message || String(error)}`
      );
    }
  }

  async function completeMissingMetadata() {
    if (!updateAnime || metadataRepairProgress) return;

    const targets = (data?.anime || []).filter(needsWikidataRepair);

    if (!targets.length) {
      setMetadataRepairStatus('Metadata health is complete for all supported fields.');
      setMetadataRepairSummary({
        scanned: 0,
        repaired: [],
        unresolved: [],
        fields: {}
      });
      return;
    }

    const confirmed = window.confirm(
      `Complete missing metadata for ${targets.length} title${targets.length === 1 ? '' : 's'}?\n\nExisting metadata and all Kitsu artwork will be preserved.`
    );

    if (!confirmed) return;

    const beforeMissingStudio = targets.filter(
      (item) => getAnimeStudios(item).length === 0
    ).length;
    const beforeMissingGenre = targets.filter(
      (item) => getAnimeTasteSignals(item).length === 0
    ).length;

    const repaired = [];
    const unresolved = [];
    const fieldTotals = {
      studio: 0,
      genres: 0,
      year: 0,
      episodes: 0
    };

    setMetadataRepairSummary(null);
    setMetadataRepairStatus(`Scanning ${targets.length} titles for missing metadata...`);

    for (let index = 0; index < targets.length; index += 1) {
      const item = targets[index];

      setMetadataRepairProgress({
        processed: index + 1,
        total: targets.length,
        title: item.officialTitle || item.title
      });

      setMetadataRepairStatus(
        `Metadata repair ${index + 1}/${targets.length}: ${item.officialTitle || item.title}`
      );

      try {
        const result = await fetchWikidataRepair(item, animeRows);
        const patch = result.patch || {};

        const repairedFields = [];
        if (patch.studio || patch.productionStudios?.length) repairedFields.push('studio');
        if (patch.genres?.length) repairedFields.push('genres');
        if (patch.year) repairedFields.push('year');
        if (patch.episodeCount || patch.episodes) repairedFields.push('episodes');

        if (!repairedFields.length) {
          unresolved.push({
            title: item.officialTitle || item.title,
            reason: 'A confident title match was found, but Wikidata did not contain the missing fields.'
          });
        } else {
          repairedFields.forEach((field) => {
            fieldTotals[field] += 1;
          });

          await updateAnime({
            ...item,
            ...patch,
            id: item.id,
            title: item.title,
            officialTitle: item.officialTitle || item.title,

            // Artwork is always retained from the existing Kitsu/local record.
            cover: item.cover,
            poster: item.poster,
            image: item.image,
            posterImage: item.posterImage,
            coverImage: item.coverImage,

            syncStatus: {
              ...(item.syncStatus || {}),
              dirty: false,
              wikidataManualRepair: true,
              lastMetadataSync: new Date().toISOString()
            }
          });

          repaired.push({
            title: item.officialTitle || item.title,
            matchedTitle: result.matchedTitle,
            matchedQuery: result.matchedQuery,
            confidence: result.confidence,
            source: result.patch?.metadataRepairSource || 'wikidata-smart-resolver',
            fields: repairedFields
          });
        }
      } catch (error) {
        unresolved.push({
          title: item.officialTitle || item.title,
          reason: error?.message || String(error),
          candidates: error?.candidates || []
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 180));
    }

    setMetadataRepairProgress(null);
    setMetadataRepairSummary({
      scanned: targets.length,
      repaired,
      unresolved,
      fields: fieldTotals,
      beforeMissingStudio,
      beforeMissingGenre
    });

    setMetadataRepairStatus(
      `Metadata repair finished — ${repaired.length} titles improved and ${unresolved.length} still need review.`
    );
  }

  async function updateDatabaseWithGenomes() {
    setGenomeUpdateStatus('Updating metadata, recommendation catalog, and Genome coverage...');

    try {
      await syncMetadata?.();
      setGenomeUpdateStatus('Database update finished.');
    } catch (error) {
      setGenomeUpdateStatus('Update failed: ' + (error?.message || String(error)));
    }
  }

  const animeRows = Array.isArray(data?.anime) ? data.anime : [];
  const animeCount = animeRows.length;
  const missingStudioCount = animeRows.filter(
    (item) => getAnimeStudios(item).length === 0
  ).length;
  const missingGenreCount = animeRows.filter(
    (item) => getAnimeTasteSignals(item).length === 0
  ).length;
  const metadataRepairCount = animeRows.filter(needsWikidataRepair).length;
  const metadataHealthyCount = Math.max(0, animeCount - metadataRepairCount);
  const metadataHealthPercent = animeCount
    ? Math.round((metadataHealthyCount / animeCount) * 100)
    : 100;

  return (
    <section className="panel settingsPage">
      <div className="settingsPageHeader">
        <p className="settingsWorkshopEyebrow">JoeAnimeDB Control Center</p>
        <h2>Workshop</h2>
        <p>Export, repair, and maintain your anime library from one place.</p>
      </div>

      <section className="settingsWorkshopSummary" aria-label="Workshop summary">
        <div>
          <strong>{animeCount}</strong>
          <span>Library Titles</span>
        </div>
        <div>
          <strong>{stats?.catalogTotal ?? data?.catalog?.length ?? 0}</strong>
          <span>Catalog Titles</span>
        </div>
        <div>
          <strong>{stats?.databaseEngine || data?.engine || 'Local'}</strong>
          <span>Database Engine</span>
        </div>
      </section>

      {genomeUpdateStatus && (
        <p className="settingsStatus">{genomeUpdateStatus}</p>
      )}

      {metadataRepairStatus && (
        <p className="settingsStatus settingsMetadataRepairStatus">
          {metadataRepairStatus}
        </p>
      )}

      {libraryImportSummary?.failed?.length ? (
        <section className="settingsImportReviewBanner">
          <div>
            <strong>{libraryImportSummary.failed.length}</strong>
            <span>titles still need review from the last import</span>
          </div>
          <a href="#library-import-needs-review">Review them now</a>
        </section>
      ) : null}

      <div className="settingsWorkshopGrid">
        <section className="settingsWorkshopCard library">
          <header>
            <span className="settingsWorkshopIcon">📚</span>
            <div>
              <p>Share &amp; Move</p>
              <h2>Library</h2>
            </div>
          </header>

          <p className="settingsWorkshopDescription">
            Back up the full database or export clean lists that are easy to share.
          </p>

          <div className="settingsWorkshopActions">
            <button type="button" onClick={() => exportBackup(data)}>
              <span>📦</span>
              <strong>Export Full Backup</strong>
              <small>Complete JoeAnimeDB JSON backup</small>
            </button>

            <button type="button" onClick={() => exportLibraryList(data)}>
              <span>📄</span>
              <strong>Export Library List</strong>
              <small>Alphabetical plain-text title list</small>
            </button>

            <button type="button" onClick={() => exportRankedLibraryList(data)}>
              <span>⭐</span>
              <strong>Export Ranked List</strong>
              <small>Titles with score and watch status</small>
            </button>

            <button type="button" onClick={() => exportLibraryCsv(data)}>
              <span>📊</span>
              <strong>Export CSV</strong>
              <small>Spreadsheet-ready library data</small>
            </button>

            <input
              ref={libraryImportInputRef}
              className="settingsImportInput"
              type="file"
              accept=".txt,.csv,text/plain,text/csv"
              onChange={handleLibraryImportFile}
            />

            <button
              type="button"
              onClick={() => libraryImportInputRef.current?.click()}
              disabled={!updateAnime || Boolean(libraryImportProgress)}
            >
              <span>📥</span>
              <strong>
                {libraryImportProgress
                  ? `Importing ${libraryImportProgress.processed}/${libraryImportProgress.total}`
                  : 'Import Library List'}
              </strong>
              <small>
                {libraryImportProgress?.title || 'Load a JoeAnimeDB TXT or CSV export'}
              </small>
            </button>
          </div>
        </section>

        <section className="settingsWorkshopCard database">
          <header>
            <span className="settingsWorkshopIcon">🧬</span>
            <div>
              <p>Repair &amp; Refresh</p>
              <h2>Database</h2>
            </div>
          </header>

          <section className="settingsMetadataHealth">
            <div className="settingsMetadataHealthTop">
              <div>
                <p>Metadata Health</p>
                <strong>{metadataHealthPercent}%</strong>
              </div>
              <span>{metadataRepairCount} repair{metadataRepairCount === 1 ? '' : 's'} remaining</span>
            </div>
            <div className="settingsMetadataHealthTrack">
              <i style={{ width: `${metadataHealthPercent}%` }} />
            </div>
            <div className="settingsMetadataHealthFacts">
              <span><strong>{missingStudioCount}</strong> missing studio</span>
              <span><strong>{missingGenreCount}</strong> missing genre</span>
              <span><strong>{metadataHealthyCount}</strong> healthy titles</span>
            </div>
          </section>

          <p className="settingsWorkshopDescription">
            Refresh metadata, rebuild Genome coverage, and inspect unresolved records.
          </p>

          <div className="settingsWorkshopActions">
            <button type="button" onClick={updateDatabaseWithGenomes}>
              <span>🔄</span>
              <strong>Update Database + Genomes</strong>
              <small>Refresh Kitsu metadata and rebuild local intelligence</small>
              <b className="settingsActionBadge">Kitsu</b>
            </button>

            <button type="button" onClick={onOpenIntegrity}>
              <span>🛠</span>
              <strong>Open Integrity Scan</strong>
              <small>Find duplicates and incomplete records</small>
            </button>

            <button
              type="button"
              onClick={completeMissingMetadata}
              disabled={!updateAnime || Boolean(metadataRepairProgress) || !metadataRepairCount}
            >
              <span>✨</span>
              <strong>
                {metadataRepairProgress
                  ? `Repairing ${metadataRepairProgress.processed}/${metadataRepairProgress.total}`
                  : 'Complete Missing Metadata'}
              </strong>
              <small>
                {metadataRepairProgress?.title || 'Smart title resolver → Wikidata → unresolved report'}
              </small>
              <b className="settingsActionBadge warning">
                {metadataRepairCount ? `${metadataRepairCount} remaining` : 'Complete'}
              </b>
            </button>

            <button type="button" onClick={onOpenMetadataHealth}>
              <span>📋</span>
              <strong>Metadata Health Report</strong>
              <small>Review every title still missing studio or genre data</small>
              <b className="settingsActionBadge">
                {missingStudioCount + missingGenreCount} flags
              </b>
            </button>
          </div>
        </section>

        <section className="settingsWorkshopCard system">
          <header>
            <span className="settingsWorkshopIcon">⚙️</span>
            <div>
              <p>Application</p>
              <h2>System</h2>
            </div>
          </header>

          <p className="settingsWorkshopDescription">
            Application-level tools and destructive maintenance controls.
          </p>

          <div className="settingsWorkshopActions">
            <button type="button" disabled title="Open Data Folder is coming soon">
              <span>🗂</span>
              <strong>Open Data Folder</strong>
              <small>Coming soon</small>
            </button>

            <button type="button" disabled title="View Logs is coming soon">
              <span>📋</span>
              <strong>View Logs</strong>
              <small>Coming soon</small>
            </button>

            <button
              type="button"
              className="danger"
              onClick={() => {
                const confirmed = window.confirm(
                  'Reset all local JoeAnimeDB data? This cannot be undone unless you exported a backup.'
                );

                if (confirmed) resetData();
              }}
            >
              <span>🗑</span>
              <strong>Reset Local Data</strong>
              <small>Delete local profile and library data</small>
            </button>
          </div>
        </section>
      </div>

      {libraryImportStatus ? (
        <p className="settingsStatus settingsImportStatus">
          {libraryImportStatus}
        </p>
      ) : null}

      {libraryImportSummary ? (
        <section className="settingsImportSummary">
          <div>
            <strong>{libraryImportSummary.added.length}</strong>
            <span>Added</span>
          </div>
          <div>
            <strong>{libraryImportSummary.skipped.length}</strong>
            <span>Already Present</span>
          </div>
          <div>
            <strong>{libraryImportSummary.failed.length}</strong>
            <span>Failed</span>
          </div>

          {libraryImportSummary.skipped.length ? (
            <details className="settingsImportSkipped">
              <summary>
                Show {libraryImportSummary.skipped.length} already-present title{libraryImportSummary.skipped.length === 1 ? '' : 's'}
              </summary>
              <div>
                {libraryImportSummary.skipped.map((item, index) => (
                  <p key={`${item.requested}-${index}`}>
                    <strong>{item.requested}</strong>
                    <span>matched existing:</span>
                    <b>{item.matched}</b>
                  </p>
                ))}
              </div>
            </details>
          ) : null}

          {libraryImportSummary.failed.length ? (
            <section id="library-import-needs-review" className="settingsImportReview">
              <header>
                <div>
                  <p>Manual Match Required</p>
                  <h3>Needs Review</h3>
                </div>
                <div className="settingsImportReviewHeaderActions">
                  <button type="button" onClick={copyFailedLibraryTitles}>
                    Copy Failed Titles
                  </button>
                  <button type="button" onClick={clearLibraryImportReview}>
                    Clear Review
                  </button>
                </div>
              </header>

              <p className="settingsImportReviewIntro">
                These titles were not matched confidently. Pick the correct result below, or copy the list and add them manually later.
              </p>

              <div className="settingsImportReviewList">
                {libraryImportSummary.failed.map((item) => (
                  <article key={item.title}>
                    <div className="settingsImportReviewTitle">
                      <strong>{item.title}</strong>
                      <small>{item.reason}</small>
                    </div>

                    {item.candidates?.length ? (
                      <div className="settingsImportCandidates">
                        {item.candidates.slice(0, 5).map((candidate) => (
                          <button
                            type="button"
                            key={candidate.id || candidate.kitsuId || candidate.title}
                            onClick={() => importReviewedLibraryCandidate(item, candidate)}
                          >
                            <span>{candidate.importConfidence || candidate.matchScore || '?'}%</span>
                            <strong>{candidate.officialTitle || candidate.title}</strong>
                            <small>
                              {[candidate.year, candidate.type, candidate.status, candidate.episodeCount ? `${candidate.episodeCount} eps` : '']
                                .filter(Boolean)
                                .join(' · ') || 'Kitsu candidate'}
                            </small>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="settingsImportNoCandidates">
                        No likely candidates were returned. Add this title manually from Library.
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </section>
      ) : null}

      {metadataRepairSummary ? (
        <section className="settingsMetadataRepairSummary">
          <header>
            <div>
              <p>Metadata Repair Report</p>
              <h2>{metadataRepairSummary.repaired.length} titles improved</h2>
            </div>
            <span>{metadataRepairSummary.unresolved.length} unresolved</span>
          </header>

          <div className="settingsMetadataRepairStats">
            <div><strong>{metadataRepairSummary.scanned}</strong><span>Scanned</span></div>
            <div><strong>{metadataRepairSummary.fields.studio || 0}</strong><span>Studios Filled</span></div>
            <div><strong>{metadataRepairSummary.fields.genres || 0}</strong><span>Genres Filled</span></div>
            <div><strong>{metadataRepairSummary.fields.year || 0}</strong><span>Years Filled</span></div>
            <div><strong>{metadataRepairSummary.fields.episodes || 0}</strong><span>Episodes Filled</span></div>
          </div>

          {metadataRepairSummary.repaired.length ? (
            <details>
              <summary>Show repaired titles</summary>
              {metadataRepairSummary.repaired.map((item) => (
                <p key={`${item.title}-${item.matchedTitle}`}>
                  <strong>{item.title}</strong>
                  {' → '}
                  {item.matchedTitle} ({item.confidence}%)
                  {' · '}
                  {item.fields.join(', ')}
                  {item.source === 'local-franchise-inheritance' ? ' · local franchise match' : ''}
                </p>
              ))}
            </details>
          ) : null}

          {metadataRepairSummary.unresolved.length ? (
            <details open>
              <summary>Show unresolved titles</summary>
              {metadataRepairSummary.unresolved.map((item) => (
                <p key={`${item.title}-${item.reason}`}>
                  <strong>{item.title}</strong> — {item.reason}
                </p>
              ))}
            </details>
          ) : null}
        </section>
      ) : null}

    </section>
  );
}
