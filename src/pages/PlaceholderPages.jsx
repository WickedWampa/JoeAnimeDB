import React, { useEffect, useMemo, useRef, useState } from 'react';
import { APP_VERSION } from '../appVersion';
import '../styles/joeanime-splash.css';
import joeAnimeSplashHero from '../assets/joeanime-splash-hero.png';
import joeAIHologramBrain from '../assets/joeai-hologram-brain.png';
import '../styles/joeai-command-center.css';
import '../styles/settings-art.css';
import { Poster } from '../components/Poster';
import { AnimeCard } from '../components/AnimeCard';
import { CloudSyncPanel } from '../components/CloudSyncPanel';
import { score, countBy } from '../utils/animeUtils';
import {
  exportBackup,
  exportBackupAs,
  exportLibraryList,
  exportRankedLibraryList,
  exportLibraryCsv,
  buildMalXmlExport,
  exportMalCompatibleXml,
  parseBackupText,
  applyBackupPreferences,
  exportDiagnostics,
  readLastBackupRecord
} from '../services/storage';
import { checkMetadataProviders } from '../services/providerHealth';
import { createAnimeBrain } from '../engine/animeBrain'; import { fetchMetadata } from '../services/metadata'; import { maybeKnowledgeFirstRecommendation } from '../ai/knowledgeFirstRecommender'; import { parseJoeAIIntent } from '../ai/intentParser'; import { executeJoeAICommand } from '../ai/commandExecutor'; import { routeJoeAIRecommendation, routeJoeAITitleQuestion } from '../ai/joeAIRecommendationRouter';
import { buildTonightsWatch } from '../ai/tonightsWatch'; import { importAnimeByTitle, mergeAnimeMetadata, searchAnimeCandidates } from '../services/animeImporter';
import {
  fetchWikidataRepair,
  needsWikidataRepair,
  wikidataRepairNeeds
} from '../services/wikidataRepair';
import { getAnimeStudios, getAnimeTasteSignals } from '../utils/metadataAdapters';
import { coordinateJoeAIRecommendation } from '../ai/recommendationCoordinator';
import { friendlyJoeAIError } from '../ai/joeAIErrorResponse';
import {
  importTitleKey,
  importedPersonalData,
  parseLibraryImport as parseExternalLibraryImport,
  readLibraryImportFile
} from '../services/libraryListImporter';
import {
  inferFeedbackTraits,
  recommendationKey,
  resolveJoeAIFollowUp,
  updateJoeAIConversationContext
} from '../ai/intelligence/joeAIIntelligence';
import {
  CONTENT_SAFETY_MODES,
  contentSafetyModeLabel,
  filterContentBySafety,
  getContentRating
} from '../services/contentSafety';

function localDaySeed(date = new Date()) {
  return Number(
    `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  );
}

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

export function Assistant({
  anime,
  catalog: rawCatalog = [],
  updateAnime,
  joeAIState = {},
  contentSafetyMode = 'unrestricted',
  onRecommendationFeedback,
  onJoeAIPreference,
  onJoeAIConversation,
  initialPrompt = '',
  onPromptConsumed
}) {
  const catalog = useMemo(
    () => filterContentBySafety(rawCatalog, contentSafetyMode),
    [rawCatalog, contentSafetyMode]
  );
  const recommendationAnime = useMemo(
    () => filterContentBySafety(anime, contentSafetyMode),
    [anime, contentSafetyMode]
  );
  const brain = useMemo(
    () => createAnimeBrain(recommendationAnime, catalog, { joeAIState }),
    [recommendationAnime, catalog, joeAIState]
  );
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
  const [dailyPickSeed, setDailyPickSeed] = useState(() => localDaySeed());
  const [conversationContext, setConversationContext] = useState(() => ({
    lastRecommendations: Array.isArray(joeAIState?.conversation?.lastRecommendations)
      ? joeAIState.conversation.lastRecommendations.slice(0, 10)
      : [],
    lastReferencedTitle: joeAIState?.conversation?.lastReferencedTitle || '',
    lastPrompt: joeAIState?.conversation?.lastPrompt || ''
  }));
  const [feedbackMenuId, setFeedbackMenuId] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState({});
  const lastAutoPromptRef = useRef('');
  const conversationRef = useRef(null);

  useEffect(() => {
    const refreshDailyPick = () => {
      setDailyPickSeed((currentSeed) => {
        const nextSeed = localDaySeed();
        return nextSeed === currentSeed ? currentSeed : nextSeed;
      });
    };

    const intervalId = window.setInterval(refreshDailyPick, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

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
          icon: '🎓',
          title: 'Teach JoeAI',
          items: [
            'I liked One Piece for the crew',
            "I don't care about studio",
            'Long anime are not a problem',
            "Don't recommend recap movies"
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

  function appendBotResult(result, prompt = '') {
    if (!result) return;

    if (typeof result === 'string') {
      setLog((current) => [...current, { who: 'bot', type: 'text', text: result }]);
      return;
    }

    setLog((current) => [...current, { who: 'bot', ...result }]);
    setConversationContext((current) => {
      const next = updateJoeAIConversationContext(result, prompt, current);

      if (onJoeAIConversation) {
        Promise.resolve(onJoeAIConversation(next)).catch((error) => {
          console.warn('Could not persist JoeAI conversation context:', error);
        });
      }

      return next;
    });
  }

  function toggleRecommendationWhy(id) {
    setExpandedRecommendationIds((current) => ({
      ...current,
      [id]: !current[id]
    }));
  }

  async function saveRecommendationFeedback(item = {}, action, reason = '') {
    if (!item?.title || !onRecommendationFeedback) return null;
    const key = recommendationKey(item);
    const entry = {
      animeKey: key,
      title: item.officialTitle || item.title,
      action,
      reason,
      traits: inferFeedbackTraits(item, reason),
      sourcePrompt: conversationContext.lastPrompt || 'JoeAI recommendation card',
      predictedMatch: item.confidenceReceipt?.tasteMatch ?? item.match ?? null,
      algorithmVersion: 'joeai-intelligence-v1'
    };

    try {
      const saved = await onRecommendationFeedback(entry);
      setFeedbackStatus((current) => ({ ...current, [key]: action }));
      setFeedbackMenuId('');
      return saved;
    } catch (error) {
      console.warn('JoeAI feedback save failed:', error);
      setLog((current) => [...current, {
        who: 'bot',
        type: 'text',
        text: 'I heard that feedback, but I could not save it yet.'
      }]);
      return null;
    }
  }

  async function saveFeedbackByTitle(feedback = {}) {
    const title = String(feedback.title || '').trim();
    if (!title) return null;
    const key = title.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const item = [...conversationContext.lastRecommendations, ...catalog, ...anime]
      .find((candidate) =>
        String(candidate.officialTitle || candidate.title || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '') === key
      ) || { title };
    return saveRecommendationFeedback(item, feedback.action || 'not_for_me', feedback.reason || '');
  }

  function renderRecommendationFeedback(item = {}, id = '') {
    if (item.owned || !onRecommendationFeedback) return null;
    const key = recommendationKey(item);
    const savedStatus = (joeAIState.feedback || []).find((entry) =>
      entry.animeKey === key
      || String(entry.title || '').toLowerCase() === String(item.title || '').toLowerCase()
    )?.action;
    const status = feedbackStatus[key] || savedStatus;
    const menuOpen = feedbackMenuId === id;

    return (
      <div className="joeaiFeedback">
        <div className="joeaiFeedbackActions">
          <button
            type="button"
            className={status === 'good_pick' ? 'active' : ''}
            onClick={() => saveRecommendationFeedback(item, 'good_pick')}
          >
            👍 Good Pick
          </button>
          <button
            type="button"
            className={status === 'not_for_me' ? 'active' : ''}
            onClick={() => setFeedbackMenuId(menuOpen ? '' : id)}
          >
            👎 Not for Me
          </button>
        </div>

        {menuOpen && (
          <div className="joeaiFeedbackReasons">
            {[
              ['Too dark', 'too_dark'],
              ['Too long', 'too_long'],
              ['Too romantic', 'too_romantic'],
              ['Wrong mood', 'wrong_mood'],
              ['Bad match', 'bad_match']
            ].map(([label, reason]) => (
              <button
                type="button"
                key={reason}
                onClick={() => saveRecommendationFeedback(item, 'not_for_me', reason)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
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
          selectedAnime: input.selectedAnime,
          quickAdd: Boolean(input.quickAdd)
        },
        anime,
        catalog,
        updateAnime,
        brain,
        joeAIState
      });

      setLog((current) => [...current, { who: 'bot', ...result }]);
      if (input.selectedAnime && !input.selectedAnime.owned) {
        await saveRecommendationFeedback(input.selectedAnime, 'accepted', 'Added to library');
      }
    } catch (error) {
      console.warn('JoeAI add-to-library failed:', input.title, error);
      appendBotResult(friendlyJoeAIError(error, `add ${input.title}`));
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

    try {
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

      appendBotResult(result, `bulk add ${command.titles.length} titles`);
    } catch (error) {
      console.warn('JoeAI bulk import failed:', error);
      appendBotResult(friendlyJoeAIError(error, `bulk import ${command.titles.length} titles`));
    }
  }

  async function ask(promptOverride = '') {
    const q = String(promptOverride || text).trim();
    if (!q) return;

    setLog((current) => [...current, { who: 'user', type: 'text', text: q }]);
    setText('');

    try {
    const resolved = resolveJoeAIFollowUp(q, conversationContext);
    const routedText = resolved.text || q;
    let activeJoeAIState = joeAIState;
    if (resolved.implicitFeedback) {
      activeJoeAIState = await saveFeedbackByTitle(resolved.implicitFeedback) || joeAIState;
    }
    const intent = parseJoeAIIntent(routedText);


    if (intent.kind === 'generateGenome') {
      const result = await executeJoeAICommand({
        intent,
        anime,
        catalog,
        updateAnime,
        brain,
        joeAIState: activeJoeAIState
      });
      appendBotResult(result, routedText);
      return;
    }

    if (intent.kind === 'teaching') {
      const result = await executeJoeAICommand({
        intent,
        anime,
        catalog,
        updateAnime,
        brain,
        joeAIState: activeJoeAIState,
        recordRecommendationFeedback: onRecommendationFeedback,
        setJoeAIPreference: onJoeAIPreference
      });
      appendBotResult(result, routedText);
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

    if (intent.kind === 'recommendationExplanation') {
      const result = await executeJoeAICommand({
        intent,
        anime,
        catalog,
        updateAnime,
        brain,
        joeAIState: activeJoeAIState
      });

      appendBotResult(result, routedText);
      return;
    }

    if (intent.kind === 'tastePattern' || intent.kind === 'genreDNA') {
      const result = await executeJoeAICommand({
        intent,
        anime,
        catalog,
        updateAnime,
        brain,
        joeAIState: activeJoeAIState
      });

      appendBotResult(result, routedText);
      return;
    }

    if (intent.kind === 'recommendation') {
      const result = coordinateJoeAIRecommendation({
        text: routedText,
        anime: recommendationAnime,
        catalog,
        brain,
        joeAIState: activeJoeAIState
      });

      appendBotResult(result, routedText);
      return;
    }

    // Exact known-title questions are answered before broad conversation logic.
    // This keeps Dragon Ball separate from DBZ/Super and respects alternate titles.
    const directTitleAnswer = routeJoeAITitleQuestion(routedText, anime, catalog);
    if (directTitleAnswer) {
      appendBotResult(directTitleAnswer, routedText);
      return;
    }

    // Non-title questions continue through conversation/reasoning/memory.
    const routedQuestion = await executeJoeAICommand({
      intent: { kind: 'question', text: routedText },
      anime,
      catalog,
      updateAnime,
      brain,
      joeAIState: activeJoeAIState
    });

    if (routedQuestion?.type !== 'text' || !String(routedQuestion?.text || '').startsWith('Try asking about your Anime DNA')) {
      appendBotResult(routedQuestion, routedText);
      return;
    }

    const smartAnswer = routeJoeAIRecommendation(routedText, recommendationAnime, catalog);
    if (smartAnswer) {
      appendBotResult(smartAnswer, routedText);
      return;
    }

    appendBotResult(routedQuestion, routedText);
    } catch (error) {
      console.warn('JoeAI request failed:', q, error);
      appendBotResult(friendlyJoeAIError(error, q), q);
    }
  }

  function renderRecommendationCard(item, index) {
    const id = 'anime-' + animeId(item);
    const isAdding = addingId === id;
    const receipt = item.confidenceReceipt || {};
    const contentRating = getContentRating(item);

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
            <span className={`contentRatingBadge rating-${contentRating.rating || 'unknown'}`} title={contentRating.guide || 'No content-rating guide available'}>
              {contentRating.label}
            </span>
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

          <div className="joeaiConfidenceReceipt">
            <span><small>Taste Match</small><strong>{receipt.tasteMatch ?? item.match ?? 0}%</strong></span>
            <span><small>Data Confidence</small><strong>{receipt.dataConfidence ?? '—'}{receipt.dataConfidence != null ? '%' : ''}</strong></span>
            <span><small>Prediction Confidence</small><strong>{receipt.predictionConfidence ?? '—'}{receipt.predictionConfidence != null ? '%' : ''}</strong></span>
          </div>

          {item.warnings?.length > 0 && (
            <div className="joeaiWarningList">
              {item.warnings.map((warning) => <span key={warning}>△ {warning}</span>)}
            </div>
          )}

          <div className="joeaiRecActions">
            <button type="button" onClick={() => addAnimeToLibrary({ title: item.title, selectedAnime: item, quickAdd: true })} disabled={isAdding || !updateAnime}>
              {isAdding ? 'Adding...' : 'Quick Add'}
            </button>
            <button type="button" onClick={() => addAnimeToLibrary({ title: item.title, status: 'Completed', selectedAnime: item, quickAdd: true })} disabled={isAdding || !updateAnime}>
              Already Watched
            </button>
            <button type="button" onClick={() => runPrompt(`recommend something else instead of ${item.officialTitle || item.title}`)}>
              Show Another
            </button>
          </div>
          {renderRecommendationFeedback(item, id)}
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
            <span>Needs Review: {message.review?.length || 0}</span>
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

        {message.review?.length > 0 && (
          <section className="joeaiBulkSection">
            <h3>Needs Review</h3>
            {message.review.map((title) => (
              <div className="joeaiBulkRow skipped" key={title}>
                <span>?</span>
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
    const receipt = item.confidenceReceipt || {
      tasteMatch: confidence,
      dataConfidence: Math.max(40, confidence - 10),
      predictionConfidence: confidence
    };
    const facts = relationshipFacts(item);
    const bullets = reasoningBullets(item, sourceTitle);
    const contentRating = getContentRating(item);

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
            <span className={`contentRatingBadge rating-${contentRating.rating || 'unknown'}`} title={contentRating.guide || 'No content-rating guide available'}>
              {contentRating.label}
            </span>
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
              {renderMeter('Taste Match', receipt.tasteMatch, 'confidence')}
              {renderMeter('Data Confidence', receipt.dataConfidence, 'data')}
              {renderMeter('Prediction Confidence', receipt.predictionConfidence, 'prediction')}
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

            {receipt.receipts?.length > 0 && (
              <div className="joeaiConfidenceReceipts">
                {receipt.receipts.map((entry) => <span key={entry}>• {entry}</span>)}
              </div>
            )}
          </div>

          {item.warnings?.length > 0 && (
            <div className="joeaiWarningList">
              {item.warnings.map((warning) => <span key={warning}>△ {warning}</span>)}
            </div>
          )}

          <div className="joeaiRecActions joeaiPremiumActions">
            <button type="button" onClick={() => toggleRecommendationWhy(id)}>
              {isExpanded ? 'Hide Explanation' : '🧠 Explain Match'}
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => addAnimeToLibrary({ title: name, selectedAnime: item, quickAdd: true })}
              disabled={isAdding || !updateAnime}
            >
              {isAdding ? 'Saving...' : item.owned ? 'Update Library Entry' : 'Quick Add'}
            </button>
            {!item.owned && (
              <button
                type="button"
                onClick={() => addAnimeToLibrary({
                  title: name,
                  status: 'Completed',
                  selectedAnime: item,
                  quickAdd: true
                })}
                disabled={isAdding || !updateAnime}
              >
                Already Watched
              </button>
            )}
            {!item.owned && (
              <button
                type="button"
                onClick={() => runPrompt(`recommend something else instead of ${name}`)}
              >
                Show Another
              </button>
            )}
          </div>
          {renderRecommendationFeedback(item, id)}
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
    const dailyPool = brain.recommendations(12, {
      prompt: 'JoeAI Pick of the Day',
      joeAIState
    });
    const item = dailyPool.length
      ? dailyPool[Math.abs(dailyPickSeed) % dailyPool.length]
      : null;

    return dailyPool.length
      ? {
          item,
          confidence: item.match,
          reasons: item.reasons || [],
          confidenceReceipt: item.confidenceReceipt
        }
      : null;
  }, [brain, dailyPickSeed, joeAIState]);

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
    if (message.type === 'genreDNAExplanation') {
      const strength = Number(message.strength);
      const hasStrength = Number.isFinite(strength);
      const metrics = Array.isArray(message.metrics) ? message.metrics : [];
      const contributors = Array.isArray(message.contributors) ? message.contributors : [];
      const companions = Array.isArray(message.companions) ? message.companions : [];
      const reasons = Array.isArray(message.reasons) ? message.reasons : [];

      return (
        <div key={index} className="chat bot joeaiGenreDNAExplanation">
          <header className="joeaiGenreDNAHeader">
            <p>🧬 Personal Anime DNA Analysis</p>
            <h2>{message.title || `Why you like ${message.genre || 'this pattern'}`}</h2>
            <span>{message.summary}</span>
          </header>

          {hasStrength && (
            <section className="joeaiGenreDNAStrength">
              <div>
                <span>JoeAI signal strength</span>
                <strong>{Math.max(0, Math.min(100, strength))}%</strong>
              </div>
              <i><b style={{ width: `${Math.max(0, Math.min(100, strength))}%` }} /></i>
            </section>
          )}

          {metrics.length > 0 && (
            <section className="joeaiGenreDNAMetrics">
              {metrics.map((metric) => (
                <div key={metric.label}>
                  <strong>{metric.value}</strong>
                  <small>{metric.label}</small>
                </div>
              ))}
            </section>
          )}

          {contributors.length > 0 && (
            <section className="joeaiGenreDNASection">
              <h3>Your strongest evidence</h3>
              <div className="joeaiGenreDNAContributors">
                {contributors.map((item) => (
                  <article key={item.id || item.title}>
                    <strong>{item.title}</strong>
                    <span>
                      {[
                        item.score ? `★ ${item.score}` : '',
                        item.rewatches ? `${item.rewatches} rewatch${item.rewatches === 1 ? '' : 'es'}` : '',
                        item.episodes ? `${item.episodes} episodes` : '',
                        item.favorite ? 'Favorite' : ''
                      ].filter(Boolean).join(' · ') || item.status || 'Library evidence'}
                    </span>
                  </article>
                ))}
              </div>
            </section>
          )}

          {companions.length > 0 && (
            <section className="joeaiGenreDNASection">
              <h3>What this pattern overlaps with</h3>
              <div className="joeaiGenreDNACompanions">
                {companions.map((item) => (
                  <div key={item.name}>
                    <span>{item.name}</span>
                    <strong>{item.percent}%</strong>
                    <i><b style={{ width: `${Math.max(0, Math.min(100, Number(item.percent) || 0))}%` }} /></i>
                  </div>
                ))}
              </div>
            </section>
          )}

          {reasons.length > 0 && (
            <section className="joeaiGenreDNASection">
              <h3>Why JoeAI believes it</h3>
              <div className="joeaiGenreDNAReasons">
                {reasons.map((reason) => <span key={reason}>✓ {reason}</span>)}
              </div>
            </section>
          )}

          {message.bottomLine && (
            <footer className="joeaiGenreDNABottomLine">
              <strong>JoeAI bottom line</strong>
              <p>{message.bottomLine}</p>
            </footer>
          )}
        </div>
      );
    }

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
                    onClick={() => addAnimeToLibrary({
                      title: joeAIPick.item.title,
                      selectedAnime: joeAIPick.item,
                      quickAdd: true
                    })}
                  >
                    Quick Add
                  </button>
                  <button
                    type="button"
                    onClick={() => addAnimeToLibrary({
                      title: joeAIPick.item.title,
                      status: 'Completed',
                      selectedAnime: joeAIPick.item,
                      quickAdd: true
                    })}
                  >
                    Already Watched
                  </button>
                  <button
                    type="button"
                    onClick={() => runPrompt(`recommend something else instead of ${joeAIPick.item.title}`)}
                  >
                    Show Another
                  </button>
                </div>
                {renderRecommendationFeedback(
                  joeAIPick.item,
                  `daily-${recommendationKey(joeAIPick.item)}`
                )}
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
  theme = 'neon',
  onThemeChange,
  joeAIState = {},
  onDeleteJoeAIFeedback,
  onDeleteJoeAIPreference,
  onResetJoeAILearning,
  onClearJoeAIConversation,
  displayName = '',
  onSaveDisplayName,
  onRestoreBackup,
  onResetDatabase,
  onReplayTutorial,
  syncing = false,
  syncText = '',
  syncProgress = null,
  onOpenIntegrity,
  onOpenMetadataHealth,
  contentSafetyMode = 'unrestricted',
  onContentSafetyModeChange
}) {
  const [genomeUpdateStatus, setGenomeUpdateStatus] = React.useState('');
  const [metadataRepairStatus, setMetadataRepairStatus] = React.useState('');
  const [metadataRepairProgress, setMetadataRepairProgress] = React.useState(null);
  const [metadataRepairSummary, setMetadataRepairSummary] = React.useState(null);
  const [libraryImportStatus, setLibraryImportStatus] = React.useState('');
  const [libraryImportProgress, setLibraryImportProgress] = React.useState(null);
  const [libraryExportSummary, setLibraryExportSummary] = React.useState(null);
  const [joeAIMemoryStatus, setJoeAIMemoryStatus] = React.useState('');
  const [systemStatus, setSystemStatus] = React.useState('');
  const [systemInfo, setSystemInfo] = React.useState(null);
  const [providerHealth, setProviderHealth] = React.useState(null);
  const [checkingProviders, setCheckingProviders] = React.useState(false);
  const [displayNameDraft, setDisplayNameDraft] = React.useState(displayName);
  const [lastBackup, setLastBackup] = React.useState(() => readLastBackupRecord());
  const [lastUpdateSummary, setLastUpdateSummary] = React.useState(() => {
    try {
      const saved = localStorage.getItem('joeanime-last-update-summary-v1');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [libraryImportSummary, setLibraryImportSummary] = React.useState(() => {
    try {
      const saved = localStorage.getItem('joeanime-library-import-review-v1');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const libraryImportInputRef = React.useRef(null);
  const backupRestoreInputRef = React.useRef(null);

  function handleMalCompatibleExport(target) {
    const platform = target === 'anilist' ? 'AniList' : 'MyAnimeList';
    const preview = buildMalXmlExport(data);

    if (!preview.exported.length) {
      setLibraryExportSummary({ ...preview, platform });
      setLibraryImportStatus(
        `Nothing was exported for ${platform}. Every library title is missing a MyAnimeList ID.`
      );
      return;
    }

    if (preview.unresolved.length) {
      const confirmed = window.confirm(
        `${preview.exported.length} title${preview.exported.length === 1 ? '' : 's'} can be exported for ${platform}. ` +
        `${preview.unresolved.length} title${preview.unresolved.length === 1 ? ' is' : 's are'} missing a MyAnimeList ID and will be skipped. Continue?`
      );
      if (!confirmed) {
        setLibraryExportSummary({ ...preview, platform });
        setLibraryImportStatus(`Export cancelled. Review the ${preview.unresolved.length} unresolved title${preview.unresolved.length === 1 ? '' : 's'} below.`);
        return;
      }
    }

    const report = exportMalCompatibleXml(data, target);
    setLibraryExportSummary({ ...report, platform });
    setLibraryImportStatus(
      `Exported ${report.exported.length} title${report.exported.length === 1 ? '' : 's'} for ${platform}.` +
      (report.unresolved.length ? ` ${report.unresolved.length} unresolved title${report.unresolved.length === 1 ? ' was' : 's were'} skipped.` : '') +
      (report.roundedScores.length ? ` ${report.roundedScores.length} decimal score${report.roundedScores.length === 1 ? ' was' : 's were'} rounded to MAL's 1–10 scale.` : '')
    );
  }

  React.useEffect(() => {
    setDisplayNameDraft(displayName);
  }, [displayName]);

  React.useEffect(() => {
    const handleBackupSaved = (event) => setLastBackup(event.detail || readLastBackupRecord());
    window.addEventListener('joeanime:backup-saved', handleBackupSaved);
    return () => window.removeEventListener('joeanime:backup-saved', handleBackupSaved);
  }, []);

  React.useEffect(() => {
    let active = true;

    async function loadReleaseStatus() {
      if (window.JoeAnimeDB?.storage?.getInfo) {
        try {
          const info = await window.JoeAnimeDB.storage.getInfo();
          if (active) setSystemInfo(info);
        } catch (error) {
          console.warn('Could not load JoeAnimeDB storage information.', error);
        }
      }

      if (window.JoeAnimeDB?.app?.getInfo) {
        try {
          const info = await window.JoeAnimeDB.app.getInfo();
          if (active) {
            setSystemInfo((current) => ({ ...(current || {}), ...info }));
          }
        } catch (error) {
          console.warn('Could not load JoeAnimeDB application information.', error);
        }
      }
    }

    loadReleaseStatus();
    refreshProviderHealth();

    return () => {
      active = false;
    };
  }, []);

  function saveLibraryImportSummary(summary) {
    setLibraryImportSummary(summary);

    try {
      if (summary?.failed?.length || summary?.added?.length || summary?.updated?.length || summary?.skipped?.length) {
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

  function findImportedLibraryItem(row = {}, library = []) {
    return library.find((item) =>
      (row.malId && String(item.malId || item.mal_id || '') === String(row.malId)) ||
      (row.anilistId && String(item.anilistId || '') === String(row.anilistId)) ||
      importedTitleMatchesLibraryItem(row.requestedTitle || row.title, item)
    );
  }

  async function importLibraryRows(rows = []) {
    if (!rows.length || !updateAnime) return;

    const sourceName = rows[0]?.sourceName || 'the selected file';
    const confirmed = window.confirm(
      `Import ${rows.length} title${rows.length === 1 ? '' : 's'} from ${sourceName}? Existing titles will keep their metadata while imported personal data is merged.`
    );

    if (!confirmed) return;

    setLibraryImportSummary(null);
    setLibraryImportStatus(`Starting import of ${rows.length} titles...`);

    let liveLibrary = [...(data?.anime || [])];
    const added = [];
    const updated = [];
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
        const existingBeforeLookup = findImportedLibraryItem(row, liveLibrary);

        if (existingBeforeLookup) {
          const merged = {
            ...existingBeforeLookup,
            ...importedPersonalData(row),
            id: existingBeforeLookup.id,
            title: existingBeforeLookup.title,
            officialTitle: existingBeforeLookup.officialTitle || existingBeforeLookup.title
          };
          const saved = await updateAnime(merged);
          liveLibrary = saved?.anime || liveLibrary.map((item) =>
            String(item.id) === String(merged.id) ? merged : item
          );
          updated.push(merged.officialTitle || merged.title);
          continue;
        }

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
            const merged = {
              ...result.duplicate,
              ...importedPersonalData(row),
              id: result.duplicate.id,
              title: result.duplicate.title,
              officialTitle: result.duplicate.officialTitle || result.duplicate.title
            };
            const saved = await updateAnime(merged);
            liveLibrary = saved?.anime || liveLibrary.map((item) =>
              String(item.id) === String(merged.id) ? merged : item
            );
            updated.push(merged.officialTitle || merged.title);
            continue;
          }

          const candidates = [
            ...(result.results || []),
            result.candidate
          ].filter(Boolean);

          failed.push({
            ...row,
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
            ...row,
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
          ...importedPersonalData(row),
          id: candidate.id,
          title: candidate.title || row.title,
          officialTitle: candidate.officialTitle || candidate.title || row.title,
          addedFrom: row.sourceName || 'Library import',
          favorite: Boolean(candidate.favorite),
          rewatches:
            row.rewatches !== undefined
              ? row.rewatches
              : Number(candidate.rewatches || 0),
          finalRank: liveLibrary.length + 1,
          notes: row.notes !== undefined ? row.notes : (candidate.notes || '')
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
          ...row,
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
      updated,
      skipped,
      failed,
      autoRepaired,
      autoUnresolved
    });
    setLibraryImportStatus(
      `Import finished — ${added.length} added, ${updated.length} updated, ${autoRepaired.length} metadata repairs, ${skipped.length} skipped, ${failed.length} failed.`
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
        ...importedPersonalData(failedItem),
        id: candidate.id || candidate.kitsuId || `import-${Date.now()}`,
        title: candidate.title || candidate.officialTitle || failedItem.title,
        officialTitle: candidate.officialTitle || candidate.title || failedItem.title,
        addedFrom: failedItem.sourceName || 'Library import',
        favorite: Boolean(candidate.favorite),
        rewatches:
          failedItem.rewatches !== undefined
            ? failedItem.rewatches
            : Number(candidate.rewatches || 0),
        finalRank: currentLibrary.length + 1,
        notes: failedItem.notes !== undefined ? failedItem.notes : (candidate.notes || '')
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
      const text = await readLibraryImportFile(file);
      const rows = parseExternalLibraryImport(text, file.name.replace(/\.gz$/i, ''));

      if (!rows.length) {
        setLibraryImportStatus(
          'No anime titles were found. Choose a MAL XML/XML.GZ, AniList JSON/CSV, or JoeAnimeDB TXT/CSV file.'
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

  async function refreshProviderHealth() {
    if (checkingProviders) return;
    setCheckingProviders(true);

    try {
      setProviderHealth(await checkMetadataProviders());
    } catch (error) {
      setProviderHealth({
        checkedAt: new Date().toISOString(),
        online: 0,
        total: 2,
        providers: [],
        error: error?.message || String(error)
      });
    } finally {
      setCheckingProviders(false);
    }
  }

  async function saveDisplayNamePreference() {
    const nextName = String(displayNameDraft || '').trim().slice(0, 32);
    if (!nextName || !onSaveDisplayName) return;

    try {
      await onSaveDisplayName(nextName);
      setSystemStatus(`Display name changed to ${nextName}.`);
    } catch (error) {
      setSystemStatus(`Could not save display name: ${error?.message || String(error)}`);
    }
  }

  async function handleRollingBackup() {
    setSystemStatus('Preparing the rolling backup...');
    try {
      const outcome = await exportBackup(data);
      if (outcome?.result?.canceled) {
        setSystemStatus('Backup cancelled. Your library was not changed.');
        return;
      }
      if (!outcome?.result?.ok) {
        throw new Error(outcome?.result?.error || 'The backup could not be saved.');
      }

      setLastBackup(outcome.record);
      setSystemStatus(
        outcome.result.method === 'download-fallback'
          ? 'Backup downloaded. This browser cannot overwrite the same file automatically, so replace the older copy yourself.'
          : 'Rolling backup updated successfully.'
      );
    } catch (error) {
      setSystemStatus(`Backup failed: ${error?.message || String(error)}`);
    }
  }

  async function handleBackupAs() {
    setSystemStatus('Preparing a backup snapshot...');
    try {
      const outcome = await exportBackupAs(data);
      if (outcome?.result?.canceled) {
        setSystemStatus('Backup snapshot cancelled.');
        return;
      }
      if (!outcome?.result?.ok) {
        throw new Error(outcome?.result?.error || 'The backup snapshot could not be saved.');
      }

      setLastBackup(outcome.record);
      setSystemStatus('Backup snapshot saved successfully.');
    } catch (error) {
      setSystemStatus(`Backup failed: ${error?.message || String(error)}`);
    }
  }

  async function handleBackupRestoreFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onRestoreBackup) return;

    try {
      setSystemStatus(`Reading ${file.name}...`);
      const backup = parseBackupText(await file.text());
      const animeCount = backup.database.anime.length;
      const catalogCount = Array.isArray(backup.database.catalog)
        ? backup.database.catalog.length
        : 0;
      const confirmed = window.confirm(
        `Restore this JoeAnimeDB backup?\n\n` +
        `${animeCount} library title${animeCount === 1 ? '' : 's'}\n` +
        `${catalogCount} catalog title${catalogCount === 1 ? '' : 's'}\n\n` +
        'The current database will be replaced. A safety copy of the SQLite database will be created first.'
      );

      if (!confirmed) {
        setSystemStatus('Backup restore cancelled.');
        return;
      }

      await onRestoreBackup(backup.database);
      applyBackupPreferences(backup.preferences);

      if (backup.preferences.theme) {
        onThemeChange?.(backup.preferences.theme);
      }
      if (backup.preferences.displayName) {
        await onSaveDisplayName?.(backup.preferences.displayName);
        setDisplayNameDraft(backup.preferences.displayName);
      }

      setSystemStatus(
        `Backup restored — ${animeCount} library titles and ${catalogCount} catalog titles loaded.`
      );
    } catch (error) {
      setSystemStatus(`Restore failed: ${error?.message || String(error)}`);
    }
  }

  async function openSystemFolder(kind) {
    const opener = kind === 'logs'
      ? window.JoeAnimeDB?.storage?.openLogsFolder
      : window.JoeAnimeDB?.storage?.openDataFolder;

    if (!opener) {
      setSystemStatus('Folder access is available in the desktop build.');
      return;
    }

    try {
      const result = await opener();
      setSystemStatus(
        result?.ok
          ? `${kind === 'logs' ? 'Logs' : 'Data'} folder opened.`
          : result?.error || 'The folder could not be opened.'
      );
    } catch (error) {
      setSystemStatus(`Could not open folder: ${error?.message || String(error)}`);
    }
  }

  async function downloadDiagnostics() {
    let latestStorageInfo = systemInfo;
    if (!latestStorageInfo && window.JoeAnimeDB?.storage?.getInfo) {
      try {
        latestStorageInfo = await window.JoeAnimeDB.storage.getInfo();
        setSystemInfo(latestStorageInfo);
      } catch {}
    }

    exportDiagnostics({
      data,
      stats,
      providerHealth,
      storageInfo: latestStorageInfo,
      lastUpdate: lastUpdateSummary,
      metadata: {
        repairsRemaining: metadataRepairCount,
        missingStudios: missingStudioCount,
        missingGenres: missingGenreCount,
        missingYears: missingYearCount,
        missingEpisodeCounts: missingEpisodeCount
      }
    });
    setSystemStatus('Diagnostics exported. Personal notes and ratings were not included.');
  }

  async function resetLocalDatabase() {
    if (!onResetDatabase) return;
    const confirmed = window.confirm(
      'Reset all local JoeAnimeDB data?\n\nThis removes the library, JoeAI learning, following state, and local profile. Export a full backup first if you may want it later.'
    );
    if (!confirmed) return;

    try {
      setSystemStatus('Resetting local JoeAnimeDB data...');
      await onResetDatabase();
      setDisplayNameDraft('');
      setLastUpdateSummary(null);
      setSystemStatus('Local JoeAnimeDB data was reset successfully.');
    } catch (error) {
      setSystemStatus(`Reset failed: ${error?.message || String(error)}`);
    }
  }

  function replayTutorial() {
    setSystemStatus('First-time setup reopened. Your current library will not be changed unless you choose new taste anchors.');
    onReplayTutorial?.();
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

        const remainingNeeds = result.remainingNeeds || wikidataRepairNeeds({
          ...item,
          ...patch
        });
        const missingLabels = [
          remainingNeeds.studio ? 'studio' : '',
          remainingNeeds.genres ? 'genres' : '',
          remainingNeeds.year ? 'year' : '',
          remainingNeeds.episodes ? 'episode count' : ''
        ].filter(Boolean);
        const reportedFields = repairedFields.length
          ? repairedFields
          : result.resolvedFields || [];

        if (!reportedFields.length && missingLabels.length) {
          unresolved.push({
            title: item.officialTitle || item.title,
            reason: result.unresolvedReason || `Still missing ${missingLabels.join(', ')}; neither Kitsu nor Wikidata provided ${missingLabels.length === 1 ? 'that field' : 'those fields'}.`
          });
        } else {
          repairedFields.forEach((field) => {
            if (Object.hasOwn(fieldTotals, field)) fieldTotals[field] += 1;
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

            metadataNeedsReview: Boolean(missingLabels.length),
            metadataReviewReason: missingLabels.length
              ? `Still missing ${missingLabels.join(', ')}.`
              : '',

            syncStatus: {
              ...(item.syncStatus || {}),
              dirty: Boolean(missingLabels.length),
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
            fields: reportedFields
          });

          if (missingLabels.length) {
            unresolved.push({
              title: item.officialTitle || item.title,
              reason: result.unresolvedReason || `Improved, but still missing ${missingLabels.join(', ')}.`
            });
          }
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
      const summary = await syncMetadata?.();
      if (summary === false) {
        setGenomeUpdateStatus('Update canceled.');
        return;
      }

      if (summary) {
        setLastUpdateSummary(summary);
        try {
          localStorage.setItem(
            'joeanime-last-update-summary-v1',
            JSON.stringify(summary)
          );
        } catch {}

        const genome = summary.genome || {};
        const genomeText = genome.supported
          ? `${genome.covered} covered, ${genome.generated} generated`
          : 'desktop Genome runner unavailable';
        setGenomeUpdateStatus(
          `Update complete — ${summary.skipped} skipped, ${summary.refreshed} refreshed; Genomes: ${genomeText}.`
        );
      } else {
        setGenomeUpdateStatus('Database update finished.');
      }
    } catch (error) {
      setGenomeUpdateStatus('Update failed: ' + (error?.message || String(error)));
    }
  }

  const joeAIFeedback = Array.isArray(joeAIState?.feedback)
    ? joeAIState.feedback
    : [];
  const joeAIPreferences = Array.isArray(joeAIState?.preferences)
    ? joeAIState.preferences
    : [];
  const joeAIConversation = joeAIState?.conversation || {};

  function joeAILessonTime(entry = {}) {
    const timestamp = Date.parse(entry.createdAt || entry.updatedAt || '');
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function joeAILessonDate(entry = {}) {
    const timestamp = joeAILessonTime(entry);
    if (!timestamp) return 'Saved';
    return new Date(timestamp).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function joeAIPreferenceLabel(key = '') {
    if (key === 'studio_weight') return 'Studio influence';
    if (key === 'length_weight') return 'Episode-length influence';
    if (key === 'prefer_dub') return 'Prefer dubbed anime';
    if (key === 'exclude_recap_movies') return 'Exclude recap movies';
    if (key === 'avoid_horror') return 'Avoid horror';
    if (key.startsWith('title_distinction:')) return 'Keep titles distinct';
    return String(key).replace(/[_:]+/g, ' ');
  }

  function joeAIPreferenceValue(entry = {}) {
    if (entry.key === 'studio_weight' && Number(entry.value) === 0) return 'Ignored';
    if (entry.key === 'length_weight' && Number(entry.value) === 0) return 'Ignored';
    if (entry.value === true) return 'Enabled';
    if (Array.isArray(entry.value)) return entry.value.join(' ≠ ');
    return String(entry.value);
  }

  const latestJoeAILesson = [
    ...joeAIFeedback.map((entry) => ({ type: 'feedback', entry })),
    ...joeAIPreferences.map((entry) => ({ type: 'preference', entry }))
  ].sort((left, right) =>
    joeAILessonTime(right.entry) - joeAILessonTime(left.entry)
  )[0] || null;

  async function forgetJoeAIFeedback(entry) {
    if (!entry?.id || !onDeleteJoeAIFeedback) return;
    try {
      await onDeleteJoeAIFeedback(entry.id);
      setJoeAIMemoryStatus(`Forgot feedback about ${entry.title}.`);
    } catch (error) {
      setJoeAIMemoryStatus(`Could not forget that feedback: ${error?.message || String(error)}`);
    }
  }

  async function forgetJoeAIPreference(entry) {
    if (!entry?.key || !onDeleteJoeAIPreference) return;
    try {
      await onDeleteJoeAIPreference(entry.key);
      setJoeAIMemoryStatus(`Forgot “${joeAIPreferenceLabel(entry.key)}”.`);
    } catch (error) {
      setJoeAIMemoryStatus(`Could not forget that preference: ${error?.message || String(error)}`);
    }
  }

  async function undoLatestJoeAILesson() {
    if (!latestJoeAILesson) {
      setJoeAIMemoryStatus('JoeAI does not have a saved lesson to undo yet.');
      return;
    }

    if (latestJoeAILesson.type === 'feedback') {
      await forgetJoeAIFeedback(latestJoeAILesson.entry);
    } else {
      await forgetJoeAIPreference(latestJoeAILesson.entry);
    }
  }

  async function clearJoeAIConversation() {
    if (!onClearJoeAIConversation) return;
    try {
      await onClearJoeAIConversation();
      setJoeAIMemoryStatus('Recent JoeAI conversation context cleared. Learned taste was kept.');
    } catch (error) {
      setJoeAIMemoryStatus(`Could not clear conversation context: ${error?.message || String(error)}`);
    }
  }

  async function resetJoeAILearning() {
    if (!onResetJoeAILearning) return;
    const confirmed = window.confirm(
      'Reset every saved JoeAI preference and recommendation feedback event?\n\nYour anime library, ratings, favorites, and Genome cards will not be changed.'
    );
    if (!confirmed) return;

    try {
      await onResetJoeAILearning();
      setJoeAIMemoryStatus('JoeAI recommendation learning reset. Your library and Anime DNA were kept.');
    } catch (error) {
      setJoeAIMemoryStatus(`Could not reset JoeAI learning: ${error?.message || String(error)}`);
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
  const missingYearCount = animeRows.filter(
    (item) => wikidataRepairNeeds(item).year
  ).length;
  const missingEpisodeCount = animeRows.filter(
    (item) => wikidataRepairNeeds(item).episodes
  ).length;
  const metadataRepairCount = animeRows.filter(needsWikidataRepair).length;
  const metadataHealthyCount = Math.max(0, animeCount - metadataRepairCount);
  const metadataHealthPercent = animeCount
    ? Math.round((metadataHealthyCount / animeCount) * 100)
    : 100;
  const themeOptions = [
    { id: 'neon', label: 'Neon', description: 'Cyber blue and pink' },
    { id: 'sakura', label: 'Sakura', description: 'Warm cherry blossom' },
    { id: 'vapor', label: 'Vapor', description: 'Purple retro glow' },
    { id: 'inferno', label: 'Inferno', description: 'Fire and ember' },
    { id: 'ramen', label: 'Ramen', description: 'Cozy amber warmth' },
    { id: 'amoled', label: 'AMOLED', description: 'True-black contrast' }
  ];
  const appVersion = systemInfo?.version || window.JoeAnimeDB?.version || APP_VERSION;
  const lastUpdateTime = lastUpdateSummary?.completedAt
    ? new Date(lastUpdateSummary.completedAt).toLocaleString()
    : 'Not run yet';
  const providerRows = providerHealth?.providers || [];

  return (
    <section className="panel settingsPage">
      <div className="settingsPageHeader">
        <p className="settingsWorkshopEyebrow">JoeAnimeDB Control Center</p>
        <h2>Workshop</h2>
        <p>Export, repair, and maintain your anime library from one place.</p>
      </div>

      <section className="settingsReleaseCard">
        <header>
          <div>
            <p className="settingsWorkshopEyebrow">Release Readiness</p>
            <h2>System Status</h2>
            <p>Live provider checks, application version, database engine, and the latest updater result.</p>
          </div>
          <button type="button" onClick={refreshProviderHealth} disabled={checkingProviders}>
            {checkingProviders ? 'Checking…' : 'Check Providers'}
          </button>
        </header>

        <div className="settingsReleaseGrid">
          <article>
            <span className="settingsReleaseIcon">🍥</span>
            <div>
              <small>Version</small>
              <strong>JoeAnimeDB {appVersion}</strong>
              <em>{systemInfo?.packaged === false ? 'Development build' : 'Desktop release'}</em>
            </div>
          </article>

          <article>
            <span className="settingsReleaseIcon">🗃️</span>
            <div>
              <small>Database</small>
              <strong>{stats?.databaseEngine || data?.engine || 'Local'}</strong>
              <em>{animeCount} library · {data?.catalog?.length || 0} catalog</em>
            </div>
          </article>

          {providerRows.map((provider) => (
            <article key={provider.id} className={provider.online ? 'online' : 'offline'}>
              <span className="settingsProviderDot" aria-hidden="true" />
              <div>
                <small>{provider.role}</small>
                <strong>{provider.label} · {provider.online ? 'Online' : 'Unavailable'}</strong>
                <em>{provider.online ? `${provider.latencyMs} ms` : provider.message}</em>
              </div>
            </article>
          ))}

          {!providerRows.length && (
            <article className="checking">
              <span className="settingsProviderDot" aria-hidden="true" />
              <div>
                <small>Metadata providers</small>
                <strong>{checkingProviders ? 'Checking Kitsu and Wikidata…' : 'Not checked'}</strong>
                <em>Use Check Providers to test connectivity</em>
              </div>
            </article>
          )}
        </div>

        <footer>
          <span>Last database update</span>
          <strong>{lastUpdateTime}</strong>
          {lastUpdateSummary && (
            <em>
              {lastUpdateSummary.skipped} skipped · {lastUpdateSummary.refreshed} refreshed ·{' '}
              {lastUpdateSummary.genome?.covered || 0} Genomes already covered
            </em>
          )}
        </footer>
      </section>

      <section className="settingsAppearanceCard">
        <header>
          <div>
            <p className="settingsWorkshopEyebrow">Appearance</p>
            <h2>Choose Your World</h2>
            <p>The entire JoeAnimeDB environment changes instantly and stays selected next time you open the app.</p>
          </div>
          <strong>{themeOptions.find((option) => option.id === theme)?.label || 'Neon'} active</strong>
        </header>

        <div className="settingsThemeGrid" role="group" aria-label="Application theme">
          {themeOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`settingsThemeOption ${option.id} ${theme === option.id ? 'active' : ''}`}
              onClick={() => onThemeChange?.(option.id)}
              aria-pressed={theme === option.id}
            >
              <i aria-hidden="true" />
              <span>
                <b>{option.label}</b>
                <small>{option.description}</small>
              </span>
              {theme === option.id && <em>Selected</em>}
            </button>
          ))}
        </div>
      </section>

      <section className="settingsContentSafetyCard">
        <header>
          <div>
            <p className="settingsWorkshopEyebrow">Content Safety</p>
            <h2>Recommendation Rating Limit</h2>
            <p>Applies to Discover, JoeAI, and Quick Ask recommendations on every platform.</p>
          </div>
          <strong>{contentSafetyModeLabel(contentSafetyMode)} active</strong>
        </header>

        <div className="settingsContentSafetyGrid" role="radiogroup" aria-label="Recommendation content safety mode">
          {CONTENT_SAFETY_MODES.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={contentSafetyMode === option.id}
              className={contentSafetyMode === option.id ? 'active' : ''}
              onClick={() => onContentSafetyModeChange?.(option.id)}
            >
              <b>{option.label}</b>
              <small>{option.description}</small>
              {contentSafetyMode === option.id && <em>Selected</em>}
            </button>
          ))}
        </div>
        <p className="settingsContentSafetyNote">
          Kid-safe hides titles whose rating is unknown. The other modes allow unknown ratings but still follow their stated limits.
        </p>
      </section>

      <section className="settingsProfileCard">
        <div>
          <p className="settingsWorkshopEyebrow">Profile</p>
          <h2>What should JoeAI call you?</h2>
          <p>This name appears on Home and in personalized JoeAI responses.</p>
        </div>
        <div className="settingsProfileControls">
          <input
            value={displayNameDraft}
            onChange={(event) => setDisplayNameDraft(event.target.value)}
            maxLength={32}
            placeholder="Display name"
            aria-label="JoeAnimeDB display name"
          />
          <button
            type="button"
            onClick={saveDisplayNamePreference}
            disabled={!displayNameDraft.trim() || displayNameDraft.trim() === displayName}
          >
            Save Name
          </button>
        </div>
      </section>

      <section className="settingsJoeAIMemoryCard">
        <header>
          <div>
            <p className="settingsWorkshopEyebrow">JoeAI Intelligence V1.1</p>
            <h2>Memory Manager</h2>
            <p>See exactly what JoeAI learned, remove a bad lesson, or clear its recent conversation without touching your library.</p>
          </div>
          <div className="settingsJoeAIMemoryStats" aria-label="JoeAI memory totals">
            <span><strong>{joeAIPreferences.length}</strong> preferences</span>
            <span><strong>{joeAIFeedback.length}</strong> feedback events</span>
          </div>
        </header>

        <div className="settingsJoeAIMemoryActions">
          <button
            type="button"
            onClick={undoLatestJoeAILesson}
            disabled={!latestJoeAILesson}
          >
            ↶ Undo Latest Lesson
          </button>
          <button
            type="button"
            onClick={clearJoeAIConversation}
            disabled={!joeAIConversation.lastPrompt && !joeAIConversation.lastReferencedTitle}
          >
            Clear Conversation
          </button>
          <button
            type="button"
            className="danger"
            onClick={resetJoeAILearning}
            disabled={!joeAIPreferences.length && !joeAIFeedback.length}
          >
            Reset Learning
          </button>
        </div>

        {joeAIMemoryStatus && (
          <p className="settingsJoeAIMemoryStatus">{joeAIMemoryStatus}</p>
        )}

        <div className="settingsJoeAIMemoryGrid">
          <section>
            <h3>Explicit Preferences</h3>
            {joeAIPreferences.length ? (
              <div className="settingsJoeAILessonList">
                {joeAIPreferences.map((entry) => (
                  <article key={entry.key}>
                    <div>
                      <strong>{joeAIPreferenceLabel(entry.key)}</strong>
                      <span>{joeAIPreferenceValue(entry)}</span>
                      <small>{joeAILessonDate(entry)}</small>
                    </div>
                    <button type="button" onClick={() => forgetJoeAIPreference(entry)}>
                      Forget
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="settingsJoeAIEmpty">No explicit preferences saved yet.</p>
            )}
          </section>

          <section>
            <h3>Recent Recommendation Feedback</h3>
            {joeAIFeedback.length ? (
              <div className="settingsJoeAILessonList">
                {joeAIFeedback.slice(0, 8).map((entry) => (
                  <article key={entry.id}>
                    <div>
                      <strong>{entry.title}</strong>
                      <span>
                        {String(entry.action || '').replace(/_/g, ' ')}
                        {entry.reason ? ` · ${String(entry.reason).replace(/_/g, ' ')}` : ''}
                      </span>
                      <small>{joeAILessonDate(entry)}</small>
                    </div>
                    <button type="button" onClick={() => forgetJoeAIFeedback(entry)}>
                      Forget
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="settingsJoeAIEmpty">No recommendation feedback saved yet.</p>
            )}
          </section>
        </div>

        <footer>
          <span>Conversation anchor</span>
          <strong>
            {joeAIConversation.lastReferencedTitle
              || joeAIConversation.lastPrompt
              || 'No active conversation'}
          </strong>
        </footer>
      </section>

      <CloudSyncPanel
        data={data}
        onRestoreBackup={onRestoreBackup}
        onThemeChange={onThemeChange}
        onSaveDisplayName={onSaveDisplayName}
      />

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

      {systemStatus && (
        <p className="settingsStatus settingsSystemStatus">
          {systemStatus}
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

          {document.documentElement.dataset.platform === 'web' && (
            <aside className="settingsWebDataSafety">
              <strong>Your web library lives in this browser</strong>
              <p>
                Clearing site data, resetting the browser, or using a different browser can remove it.
                Keep using joeanimedb.com and update your backup regularly.
              </p>
              <small>To restore: choose Restore Full Backup below and select JoeAnimeDB-backup.json.</small>
            </aside>
          )}

          <div className="settingsBackupStatus" aria-live="polite">
            <span>Last backup</span>
            <strong>
              {lastBackup?.savedAt
                ? new Date(lastBackup.savedAt).toLocaleString()
                : 'No backup recorded on this device'}
            </strong>
            {lastBackup?.filename && <small>{lastBackup.filename}</small>}
          </div>

          <div className="settingsWorkshopActions">
            <button type="button" className="settingsPrimaryBackup" onClick={handleRollingBackup}>
              <span>📦</span>
              <strong>Update Rolling Backup</strong>
              <small>Updates JoeAnimeDB-backup.json when supported</small>
            </button>

            <button type="button" onClick={handleBackupAs}>
              <span>＋</span>
              <strong>Save Backup As...</strong>
              <small>Create a separate dated snapshot</small>
            </button>

            <input
              ref={backupRestoreInputRef}
              className="settingsImportInput"
              type="file"
              accept=".json,application/json"
              onChange={handleBackupRestoreFile}
            />

            <button
              type="button"
              onClick={() => backupRestoreInputRef.current?.click()}
              disabled={!onRestoreBackup}
            >
              <span>♻️</span>
              <strong>Restore Full Backup</strong>
              <small>Replace the current database from a JoeAnimeDB JSON backup</small>
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

            <button type="button" onClick={() => handleMalCompatibleExport('mal')}>
              <span>🔷</span>
              <strong>Export for MyAnimeList</strong>
              <small>MAL-compatible XML with status, scores, and progress</small>
            </button>

            <button type="button" onClick={() => handleMalCompatibleExport('anilist')}>
              <span>🔹</span>
              <strong>Export for AniList</strong>
              <small>MAL XML accepted by AniList's list importer</small>
            </button>

            <input
              ref={libraryImportInputRef}
              className="settingsImportInput"
              type="file"
              accept=".txt,.csv,.json,.xml,.gz,text/plain,text/csv,application/json,application/xml,text/xml,application/gzip"
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
                {libraryImportProgress?.title || 'MAL XML · AniList JSON/CSV · JoeAnimeDB TXT/CSV'}
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
              <span><strong>{missingYearCount}</strong> missing year</span>
              <span><strong>{missingEpisodeCount}</strong> missing episode count</span>
              <span><strong>{metadataHealthyCount}</strong> healthy titles</span>
            </div>
          </section>

          <section className="settingsLastUpdate">
            <header>
              <span>Last Updater Audit</span>
              <strong>{lastUpdateTime}</strong>
            </header>
            {syncing ? (
              <>
                <div className="settingsLastUpdateTrack">
                  <i style={{ width: `${Math.max(0, Math.min(100, Number(syncProgress?.percent || 0)))}%` }} />
                </div>
                <p>{syncText || syncProgress?.current || 'Updater is working…'}</p>
              </>
            ) : lastUpdateSummary ? (
              <div className="settingsLastUpdateFacts">
                <span><strong>{lastUpdateSummary.scanned}</strong> scanned</span>
                <span><strong>{lastUpdateSummary.skipped}</strong> skipped</span>
                <span><strong>{lastUpdateSummary.refreshed}</strong> refreshed</span>
                <span><strong>{lastUpdateSummary.genome?.generated || 0}</strong> Genomes generated</span>
              </div>
            ) : (
              <p>Run Update Database + Genomes to create the first audit report.</p>
            )}
          </section>

          <p className="settingsWorkshopDescription">
            Refresh metadata, rebuild Genome coverage, and inspect unresolved records.
          </p>

          <div className="settingsWorkshopActions">
            <button type="button" onClick={updateDatabaseWithGenomes} disabled={syncing}>
              <span>🔄</span>
              <strong>{syncing ? 'Update In Progress' : 'Update Database + Genomes'}</strong>
              <small>{syncing ? (syncProgress?.current || syncText) : 'Refresh Kitsu metadata and rebuild local intelligence'}</small>
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
            <button type="button" onClick={() => openSystemFolder('data')}>
              <span>🗂</span>
              <strong>Open Data Folder</strong>
              <small>Open the SQLite database and backup location</small>
            </button>

            <button type="button" onClick={() => openSystemFolder('logs')}>
              <span>📋</span>
              <strong>View Logs</strong>
              <small>Open the local diagnostic logs folder</small>
            </button>

            <button type="button" onClick={downloadDiagnostics}>
              <span>🩺</span>
              <strong>Export Diagnostics</strong>
              <small>Save provider, database, updater, and version details</small>
            </button>

            <button type="button" onClick={replayTutorial}>
              <span>🎓</span>
              <strong>Replay Tutorial</strong>
              <small>Reopen the complete first-time setup and page tips</small>
            </button>

            <button
              type="button"
              className="danger"
              onClick={resetLocalDatabase}
              disabled={!onResetDatabase}
            >
              <span>🗑</span>
              <strong>Reset Local Data</strong>
              <small>Delete local profile and library data</small>
            </button>
          </div>

          <footer className="settingsSystemFacts">
            <span><b>App:</b> {appVersion}</span>
            <span><b>Data:</b> {systemInfo?.database || systemInfo?.data || 'Desktop storage'}</span>
            <span><b>Backups:</b> {systemInfo?.backups || 'Exported JSON files'}</span>
          </footer>
        </section>
      </div>

      {libraryImportStatus ? (
        <p className="settingsStatus settingsImportStatus">
          {libraryImportStatus}
        </p>
      ) : null}

      {libraryExportSummary ? (
        <section className="settingsImportSummary">
          <div>
            <strong>{libraryExportSummary.exported?.length || 0}</strong>
            <span>Exported for {libraryExportSummary.platform}</span>
          </div>
          <div>
            <strong>{libraryExportSummary.unresolved?.length || 0}</strong>
            <span>Missing MAL ID</span>
          </div>
          <div>
            <strong>{libraryExportSummary.roundedScores?.length || 0}</strong>
            <span>Scores Rounded</span>
          </div>

          {libraryExportSummary.unresolved?.length ? (
            <details className="settingsImportSkipped">
              <summary>
                Show {libraryExportSummary.unresolved.length} title{libraryExportSummary.unresolved.length === 1 ? '' : 's'} not included
              </summary>
              <div>
                {libraryExportSummary.unresolved.map((item, index) => (
                  <p key={`${item.title}-${index}`}>
                    <strong>{item.title}</strong>
                    <span>{item.reason}</span>
                    <b>{item.anilistId ? `AniList ${item.anilistId}` : item.kitsuId ? `Kitsu ${item.kitsuId}` : 'No external ID'}</b>
                  </p>
                ))}
              </div>
            </details>
          ) : null}

          {libraryExportSummary.roundedScores?.length ? (
            <details className="settingsImportSkipped">
              <summary>
                Show {libraryExportSummary.roundedScores.length} rounded score{libraryExportSummary.roundedScores.length === 1 ? '' : 's'}
              </summary>
              <div>
                {libraryExportSummary.roundedScores.map((item, index) => (
                  <p key={`${item.title}-${index}`}>
                    <strong>{item.title}</strong>
                    <span>MAL uses whole-number scores</span>
                    <b>{item.from} → {item.to}</b>
                  </p>
                ))}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      {libraryImportSummary ? (
        <section className="settingsImportSummary">
          <div>
            <strong>{libraryImportSummary.added?.length || 0}</strong>
            <span>Added</span>
          </div>
          <div>
            <strong>{libraryImportSummary.updated?.length || 0}</strong>
            <span>Personal Data Updated</span>
          </div>
          <div>
            <strong>{libraryImportSummary.skipped?.length || 0}</strong>
            <span>Already Present</span>
          </div>
          <div>
            <strong>{libraryImportSummary.failed?.length || 0}</strong>
            <span>Failed</span>
          </div>

          {libraryImportSummary.updated?.length ? (
            <details className="settingsImportSkipped">
              <summary>
                Show {libraryImportSummary.updated.length} updated title{libraryImportSummary.updated.length === 1 ? '' : 's'}
              </summary>
              <div>
                {libraryImportSummary.updated.map((title, index) => (
                  <p key={`${title}-${index}`}>
                    <strong>{title}</strong>
                    <span>personal list data merged</span>
                  </p>
                ))}
              </div>
            </details>
          ) : null}

          {libraryImportSummary.skipped?.length ? (
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

          {libraryImportSummary.failed?.length ? (
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
