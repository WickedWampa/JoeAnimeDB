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
import { recommendAnime } from '../engine/recommendationEngine'; import { fetchMetadata } from '../services/metadata'; import { maybeKnowledgeFirstRecommendation } from '../ai/knowledgeFirstRecommender'; import { parseJoeAIIntent } from '../ai/intentParser'; import { executeJoeAICommand } from '../ai/commandExecutor'; import { routeJoeAIRecommendation, routeJoeAITitleQuestion } from '../ai/joeAIRecommendationRouter';
import { getRecommendationContext } from '../services/recommendationRuntime';
import { useDeferredDailyRecommendation } from '../hooks/useDeferredDailyRecommendation';
import { buildTonightsWatch } from '../ai/tonightsWatch'; import { applySafeKitsuIdentity, importAnimeByTitle, mergeAnimeMetadata, resolveSafeKitsuIdentity, searchAnimeCandidates } from '../services/animeImporter';
import {
  fetchWikidataRepair,
  needsWikidataRepair,
  wikidataRepairNeeds
} from '../services/wikidataRepair';
import { getAnimeStudios, getAnimeTasteSignals } from '../utils/metadataAdapters';
import { coordinateJoeAIRecommendation, enrichRecommendationItems } from '../ai/recommendationCoordinator';
import { getTasteReadiness } from '../ai/tasteReadiness';
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
  sanitizeJoeAIConversationMessages,
  updateJoeAIConversationContext
} from '../ai/intelligence/joeAIIntelligence';
import {
  CONTENT_SAFETY_MODES,
  contentSafetyModeLabel,
  getContentRating
} from '../services/contentSafety';
import {
  STREAMING_APP_OPTIONS,
  getSavedStreamingApps,
  saveStreamingApps
} from '../services/watchmodeService';
import { askJoeAICloud, isJoeAICloudEnabled } from '../services/joeAICloud';
import {
  animeIdentityKeys,
  sameAnimeIdentity,
  titleAliases as identityTitleAliases
} from '../services/titleIdentity';
import { franchiseBaseTitle } from '../utils/titleAliases';
import { getJoeAIEasterEgg } from '../ai/joeAIEasterEggs';
import { findGenomeCardByTitle } from '../ai/genome/genomeRegistry';
import '../styles/joeai-cloud.css';

const EMPTY_ANIME_LIST = Object.freeze([]);
const EMPTY_JOEAI_STATE = Object.freeze({});

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
  anime = EMPTY_ANIME_LIST,
  catalog: rawCatalog = EMPTY_ANIME_LIST,
  updateAnime,
  setSelected,
  joeAIState = EMPTY_JOEAI_STATE,
  contentSafetyMode = 'unrestricted',
  onRecommendationFeedback,
  onJoeAIPreference,
  onJoeAIConversation,
  initialPrompt = '',
  onPromptConsumed
}) {
  const recommendationContext = useMemo(
    () => getRecommendationContext(anime, rawCatalog, contentSafetyMode, joeAIState),
    [anime, rawCatalog, contentSafetyMode, joeAIState]
  );
  const catalog = recommendationContext.catalog;
  const recommendationAnime = recommendationContext.library;
  const brain = recommendationContext.brain;
  const [log, setLog] = useState(() => {
    const savedMessages = sanitizeJoeAIConversationMessages(
      joeAIState?.conversation?.messages || [],
      48
    );

    return savedMessages.length
      ? savedMessages
      : [{
          who: 'bot',
          type: 'text',
          text: 'JoeAI is wicked smaht now. Ask what I can do, tell me what you finished, bulk add titles, or ask for recommendations.'
        }];
  });
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
    lastPrompt: joeAIState?.conversation?.lastPrompt || '',
    lastRecommendationPrompt: joeAIState?.conversation?.lastRecommendationPrompt || '',
    recentRecommendationKeys: Array.isArray(joeAIState?.conversation?.recentRecommendationKeys)
      ? joeAIState.conversation.recentRecommendationKeys.slice(0, 48)
      : [],
    lastConstraints: joeAIState?.conversation?.lastConstraints && typeof joeAIState.conversation.lastConstraints === 'object'
      ? joeAIState.conversation.lastConstraints
      : { exclude: [] }
  }));
  const [feedbackMenuId, setFeedbackMenuId] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState({});
  const [cloudThinking, setCloudThinking] = useState(false);
  const lastAutoPromptRef = useRef('');
  const conversationRef = useRef(null);
  const onJoeAIConversationRef = useRef(onJoeAIConversation);
  const skipInitialConversationPersistRef = useRef(true);

  useEffect(() => {
    onJoeAIConversationRef.current = onJoeAIConversation;
  }, [onJoeAIConversation]);

  useEffect(() => {
    if (skipInitialConversationPersistRef.current) {
      skipInitialConversationPersistRef.current = false;
      return;
    }

    const persist = onJoeAIConversationRef.current;
    if (!persist) return;

    const snapshot = {
      ...conversationContext,
      messages: sanitizeJoeAIConversationMessages(log, 48)
    };

    Promise.resolve(persist(snapshot)).catch((error) => {
      console.warn('Could not persist JoeAI conversation:', error);
    });
  }, [log, conversationContext]);

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
  }, [log, pendingAction, expandedRecommendationIds, cloudThinking]);

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

  function recommendationDetailTitleKey(value = '') {
    return String(value || '')
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  function recommendationDetailTitles(item = {}) {
    return identityTitleAliases(item)
      .filter(Boolean)
      .map(recommendationDetailTitleKey)
      .filter(Boolean);
  }

  function recommendationDetailProviderId(item = {}, provider) {
    if (provider === 'mal') {
      const value = item.malId ?? item.mal_id;
      return value == null || value === '' ? '' : String(value);
    }

    const value = item.kitsuId ?? item.kitsu_id;
    return value == null || value === '' ? '' : String(value);
  }

  function recommendationDetailCandidateScore(item = {}, candidate = {}) {
    if (!candidate || typeof candidate !== 'object') return -1;

    const itemMal = recommendationDetailProviderId(item, 'mal');
    const candidateMal = recommendationDetailProviderId(candidate, 'mal');
    const itemKitsu = recommendationDetailProviderId(item, 'kitsu');
    const candidateKitsu = recommendationDetailProviderId(candidate, 'kitsu');

    // Conflicting provider IDs are never the same anime, even when their titles
    // normalize to the same text.
    if (itemMal && candidateMal && itemMal !== candidateMal) return -1;
    if (itemKitsu && candidateKitsu && itemKitsu !== candidateKitsu) return -1;

    let matchScore = 0;
    const exactMal = Boolean(itemMal && candidateMal && itemMal === candidateMal);
    const exactKitsu = Boolean(itemKitsu && candidateKitsu && itemKitsu === candidateKitsu);
    const exactId = Boolean(
      item.id != null &&
      candidate.id != null &&
      String(item.id) === String(candidate.id)
    );

    if (exactMal) matchScore += 1000;
    if (exactKitsu) matchScore += 1000;
    if (exactId) matchScore += 900;

    const itemHasProviderId = Boolean(itemMal || itemKitsu);
    const exactProviderMatch = exactMal || exactKitsu;

    // If JoeAI already knows a provider ID, a title-only duplicate is not
    // allowed to hijack the Details handoff.
    if (itemHasProviderId && !exactProviderMatch && !exactId) return -1;

    const wantedTitles = new Set(recommendationDetailTitles(item));
    const titleMatch = recommendationDetailTitles(candidate).some((title) => wantedTitles.has(title));

    if (!exactProviderMatch && !exactId) {
      if (!titleMatch) return -1;

      const itemType = recommendationDetailTitleKey(item.type || item.mediaType || '');
      const candidateType = recommendationDetailTitleKey(candidate.type || candidate.mediaType || '');
      if (itemType && candidateType && itemType !== candidateType) return -1;

      const itemYear = Number(item.year || 0);
      const candidateYear = Number(candidate.year || 0);
      if (itemYear && candidateYear && itemYear !== candidateYear) return -1;

      matchScore += 100;
      if (itemType && candidateType) matchScore += 20;
      if (itemYear && candidateYear) matchScore += 20;
    } else if (titleMatch) {
      matchScore += 25;
    }

    if (candidate.cover || candidate.poster || candidate.posterUrl || candidate.imageUrl || candidate.image) matchScore += 5;
    if (candidate.synopsis || candidate.description) matchScore += 5;
    if (Number(candidate.episodeCount || candidate.episodes || 0) > 0) matchScore += 3;
    if (candidate.studio || candidate.studios?.length) matchScore += 3;
    if (candidate.year) matchScore += 2;

    return matchScore;
  }

  function bestRecommendationDetailCandidate(item = {}, pool = []) {
    let best = null;
    let bestScore = -1;

    for (const candidate of Array.isArray(pool) ? pool : []) {
      const candidateScore = recommendationDetailCandidateScore(item, candidate);
      if (candidateScore > bestScore) {
        best = candidate;
        bestScore = candidateScore;
      }
    }

    return bestScore >= 0 ? best : null;
  }

  function recommendationDetailValueMissing(value) {
    if (value == null) return true;
    if (typeof value === 'string') return !value.trim();
    if (Array.isArray(value)) return value.length === 0;
    return false;
  }

  function mergeRecommendationDetailRecord(item = {}, fallback = null) {
    const merged = { ...item };

    // The object JoeAI rendered is authoritative. A matching local/catalog row
    // may fill holes, but it can never overwrite populated recommendation data.
    if (fallback && typeof fallback === 'object') {
      for (const [key, value] of Object.entries(fallback)) {
        if (recommendationDetailValueMissing(merged[key]) && !recommendationDetailValueMissing(value)) {
          merged[key] = value;
        }
      }
    }

    const cover =
      item.cover || item.poster || item.posterUrl || item.imageUrl || item.image ||
      fallback?.cover || fallback?.poster || fallback?.posterUrl || fallback?.imageUrl || fallback?.image || '';
    const synopsis =
      item.synopsis || item.description ||
      fallback?.synopsis || fallback?.description || '';
    const episodeCount = Number(
      item.episodeCount || item.episodes ||
      fallback?.episodeCount || fallback?.episodes || 0
    );
    const studio =
      item.studio ||
      item.studios?.[0]?.name || item.studios?.[0] ||
      fallback?.studio ||
      fallback?.studios?.[0]?.name || fallback?.studios?.[0] || '';

    if (cover) {
      merged.cover = cover;
      merged.imageUrl = item.imageUrl || cover;
    }
    if (synopsis) merged.synopsis = synopsis;
    if (episodeCount > 0) {
      merged.episodeCount = episodeCount;
      merged.episodes = episodeCount;
    }
    if (studio) merged.studio = studio;

    merged.title = item.title || item.officialTitle || fallback?.title || fallback?.officialTitle || '';
    merged.officialTitle = item.officialTitle || item.title || fallback?.officialTitle || fallback?.title || merged.title;
    merged.type = item.type || item.mediaType || fallback?.type || fallback?.mediaType || merged.type || '';
    merged.year = item.year || fallback?.year || merged.year || '';
    merged.malId = item.malId ?? item.mal_id ?? fallback?.malId ?? fallback?.mal_id ?? merged.malId;
    merged.kitsuId = item.kitsuId ?? item.kitsu_id ?? fallback?.kitsuId ?? fallback?.kitsu_id ?? merged.kitsuId;
    merged.communityScore =
      item.communityScore ?? item.malScore ??
      fallback?.communityScore ?? fallback?.malScore ??
      merged.communityScore;
    merged.malScore = item.malScore ?? fallback?.malScore ?? merged.malScore;

    return merged;
  }

  function openRecommendationDetails(item = {}) {
    if (!setSelected || !item || typeof item !== 'object') return;

    const owned = Boolean(item.owned || item.bucket === 'library');
    const sourcePool = owned ? anime : catalog;
    const exactCandidate = bestRecommendationDetailCandidate(item, sourcePool);
    const detailRecord = mergeRecommendationDetailRecord(item, exactCandidate);

    if (owned && exactCandidate) {
      // Keep rich recommendation metadata while restoring the user's personal
      // relationship fields from the actual saved library row.
      [
        'status',
        'joeScore',
        'favorite',
        'notes',
        'rewatches',
        'finalRank',
        'libraryNeedsReview',
        'libraryReviewReason'
      ].forEach((field) => {
        if (exactCandidate[field] !== undefined) detailRecord[field] = exactCandidate[field];
      });

      detailRecord.id = exactCandidate.id || detailRecord.id;
      detailRecord.catalogSource = '';
    } else {
      // Discoveries open the exact rich object JoeAI displayed. Matching catalog
      // data may fill blanks only; it never replaces populated fields or identity.
      detailRecord.id = item.id || exactCandidate?.id || detailRecord.id || item.malId || item.kitsuId || item.title;
      detailRecord.catalogSource = item.catalogSource || exactCandidate?.catalogSource || 'joeai';
    }

    setSelected(detailRecord);
  }

  function openRecommendationDetailsFromKeyboard(event, item) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openRecommendationDetails(item);
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
      subtitle: 'Ask naturally. I can recommend what to watch, compare titles you own or have never seen, explain your Anime DNA, manage your library with confirmation, remember taste signals, and talk anime with you.',
      sections: [
        {
          icon: '🎯',
          title: 'Recommendations',
          items: [
            'what should I watch next?',
            'recommend something like Bleach',
            'recommend something like Bleach but shorter',
            'recommend Slime without isekai',
            'show me a hidden gem'
          ]
        },
        {
          icon: '⚖️',
          title: 'Compare & Decide',
          items: [
            'which fits my taste better, Bleach or JJK?',
            'which would I like better, Banana Fish or Gintama?',
            'which would I like better, Bleach or Banana Fish?',
            'compare Hunter x Hunter and Bleach',
            'compare Slime and Overlord'
          ]
        },
        {
          icon: '🧬',
          title: 'Anime DNA',
          items: [
            'explain my Anime DNA',
            'why do I like long adventures?',
            'what is unusual about my library?',
            'what assumption about my taste would be wrong?',
            'what changed in my Anime DNA?'
          ]
        },
        {
          icon: '💬',
          title: 'Keep the Conversation Going',
          items: [
            'darker',
            'no school',
            'under 24 episodes',
            'another one',
            'why that one?'
          ]
        },
        {
          icon: '🧠',
          title: 'JoeAI Memory',
          items: [
            'what did you learn?',
            'what changed recently?',
            'what surprised you most?',
            'what are your strongest signals?',
            'what are you least certain about?'
          ]
        },
        {
          icon: '🎓',
          title: 'Teach JoeAI',
          items: [
            'I liked One Piece for the crew',
            "I don't care about studio",
            'Long anime are not a problem',
            "Don't recommend recap movies",
            'I want more kingdom building'
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
          title: 'Stats & Quick Questions',
          items: [
            'library stats',
            'top genres',
            'top studios',
            'top rated anime',
            'show me unrated anime'
          ]
        }
      ],
      footer: 'Click a prompt to load it, or just talk naturally. JoeAI can carry recommendation follow-ups, use saved receipts when they exist, and predict taste fit when they do not.'
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

    const normalizedResult = typeof result === 'string'
      ? { type: 'text', text: result }
      : result;

    setLog((current) => [...current, { who: 'bot', ...normalizedResult }]);
    setConversationContext((current) =>
      updateJoeAIConversationContext(normalizedResult, prompt, current)
    );
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

  function compactCloudValue(value, depth = 0) {
    if (value == null) return value;
    if (depth > 4) return undefined;
    if (typeof value === 'string') return value.length > 1600 ? `${value.slice(0, 1600)}…` : value;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) {
      return value.slice(0, 14).map((item) => compactCloudValue(item, depth + 1)).filter((item) => item !== undefined);
    }
    if (typeof value !== 'object') return undefined;

    const omittedKeys = new Set([
      'cover', 'poster', 'posterUrl', 'imageUrl', 'image', 'banner', 'bannerImage',
      'background', 'backgroundImage', 'notes', 'userNotes'
    ]);
    const entries = Object.entries(value)
      .filter(([key]) => !omittedKeys.has(key))
      .slice(0, 32)
      .map(([key, item]) => [key, compactCloudValue(item, depth + 1)])
      .filter(([, item]) => item !== undefined);

    return Object.fromEntries(entries);
  }

  function cloudCompactAnime(item = {}, { rich = false, source = '' } = {}) {
    // Never label a catalog/community score as the user's personal score. Only
    // library/owned records are allowed to contribute a personal rating signal.
    const isLibraryRecord = source === 'library' || Boolean(item.owned);
    const userScore = isLibraryRecord
      ? Number(
          item.joeScore ??
          item.userScore ??
          item.personalScore ??
          item.myScore ??
          item.rating ??
          0
        )
      : 0;
    const aliases = [
      item.officialTitle,
      item.englishTitle,
      item.japaneseTitle,
      item.shortTitle,
      ...(Array.isArray(item.titleSynonyms) ? item.titleSynonyms : []),
      ...(Array.isArray(item.synonyms) ? item.synonyms : []),
      ...(Array.isArray(item.aliases) ? item.aliases : [])
    ].filter(Boolean);

    const record = {
      title: item.officialTitle || item.title || '',
      aliases: aliases.slice(0, 8),
      score: userScore > 0 ? userScore : undefined,
      communityScore: item.communityScore ?? item.malScore ?? undefined,
      status: item.status || undefined,
      favorite: Boolean(item.favorite) || undefined,
      rewatches: Number(item.rewatches || 0) || undefined,
      genres: Array.isArray(item.genres) ? item.genres.slice(0, 8) : [],
      themes: Array.isArray(item.themes) ? item.themes.slice(0, 8) : [],
      studio: item.studio || item.studios?.[0]?.name || item.studios?.[0] || undefined,
      year: item.year || undefined,
      type: item.type || item.mediaType || undefined,
      episodes: Number(item.episodeCount || item.episodes || 0) || undefined,
      malId: item.malId ?? item.mal_id ?? undefined,
      kitsuId: item.kitsuId ?? item.kitsu_id ?? undefined,
      source: source || undefined,
      owned: isLibraryRecord || undefined,
      inLibrary: isLibraryRecord || undefined
    };

    if (rich) {
      const synopsis = String(item.synopsis || item.description || '').trim();
      if (synopsis) record.synopsis = synopsis.slice(0, 900);

      const genome = item.genome || item.animeGenome || item.genomeCard || item.genomeData;
      if (genome) record.genome = compactCloudValue(genome);
    }

    return record;
  }

  function cloudComparisonRecord(item = {}) {
    const userScore = Number(
      item.joeScore ??
      item.userScore ??
      item.personalScore ??
      item.myScore ??
      item.rating ??
      0
    );

    return {
      ...cloudCompactAnime(item, { rich: true, source: 'library' }),
      score: userScore > 0 ? userScore : null,
      rewatches: Number(item.rewatches || 0) || 0,
      favorite: Boolean(item.favorite),
      status: item.status || '',
      owned: true,
      inLibrary: true
    };
  }

  const COMMON_CLOUD_TITLE_SHORTHANDS = new Map([
    ['jjk', ['jujutsu kaisen']],
    ['hxh', ['hunter x hunter']],
    ['op', ['one piece']],
    ['aot', ['attack on titan', 'shingeki no kyojin']],
    ['mha', ['my hero academia']],
    ['bnha', ['boku no hero academia']],
    ['fma', ['fullmetal alchemist']],
    ['fmab', ['fullmetal alchemist brotherhood']],
    ['sao', ['sword art online']],
    ['slime', ['that time i got reincarnated as a slime', 'tensei shitara slime datta ken']],
    ['kny', ['kimetsu no yaiba', 'demon slayer']],
    ['tensura', ['that time i got reincarnated as a slime', 'tensei shitara slime datta ken']]
  ]);

  function cloudTitleAliases(item = {}) {
    return [
      ...recommendationDetailTitles(item),
      item.shortTitle,
      item.acronym,
      ...(Array.isArray(item.synonyms) ? item.synonyms : []),
      ...(Array.isArray(item.aliases) ? item.aliases : [])
    ]
      .filter(Boolean)
      .map(recommendationDetailTitleKey)
      .filter((title) => title.length >= 4);
  }

  function cloudShortTitleAliases(item = {}) {
    const fullAliases = [
      ...recommendationDetailTitles(item),
      item.shortTitle,
      item.acronym,
      ...(Array.isArray(item.synonyms) ? item.synonyms : []),
      ...(Array.isArray(item.aliases) ? item.aliases : [])
    ]
      .filter(Boolean)
      .map(recommendationDetailTitleKey)
      .filter(Boolean);

    const short = new Set(
      [item.shortTitle, item.acronym]
        .filter(Boolean)
        .map(recommendationDetailTitleKey)
        .filter((alias) => alias.length >= 2 && alias.length <= 10 && !alias.includes(' '))
    );

    // Generate ordinary initialisms deterministically (Hunter x Hunter -> HxH,
    // One Piece -> OP, Sword Art Online -> SAO) and supplement the handful of
    // fandom shorthands that cannot be derived from word initials (JJK, FMAB).
    for (const title of fullAliases) {
      const words = title.split(/\s+/).filter(Boolean);
      if (words.length >= 2 && words.length <= 8) {
        const initials = words.map((word) => word[0]).join('');
        if (initials.length >= 2 && initials.length <= 8) short.add(initials);
      }
    }

    for (const [alias, targets] of COMMON_CLOUD_TITLE_SHORTHANDS.entries()) {
      if (targets.some((target) => fullAliases.some((title) => title === target || title.includes(target)))) {
        short.add(alias);
      }
    }

    return [...short];
  }

  function findCloudTitleMatches(prompt = '') {
    const promptKey = recommendationDetailTitleKey(prompt);
    if (!promptKey) return [];
    const promptTokens = new Set(promptKey.split(/\s+/).filter(Boolean));

    const pool = [
      ...anime.map((item) => ({ item, source: 'library' })),
      ...catalog.map((item) => ({ item, source: 'catalog' }))
    ];
    const matches = [];
    const seen = new Set();

    for (const entry of pool) {
      const aliases = cloudTitleAliases(entry.item);
      const longestMatch = aliases
        .filter((alias) => promptKey.includes(alias))
        .sort((a, b) => b.length - a.length)[0] || '';
      const shortMatch = cloudShortTitleAliases(entry.item)
        .filter((alias) => promptTokens.has(alias))
        .sort((a, b) => b.length - a.length)[0] || '';

      if (!longestMatch && !shortMatch) continue;

      const identity = String(
        entry.item.malId ?? entry.item.mal_id ??
        entry.item.kitsuId ?? entry.item.kitsu_id ??
        entry.item.id ?? entry.item.title ?? (longestMatch || shortMatch)
      );
      if (seen.has(identity)) continue;
      seen.add(identity);
      matches.push({ ...entry, matchLength: Math.max(longestMatch.length, shortMatch.length) });
    }

    return matches
      .sort((a, b) => b.matchLength - a.matchLength || (a.source === 'library' ? -1 : 1))
      .slice(0, 6);
  }


  function findHybridTitleByName(value = '') {
    const key = recommendationDetailTitleKey(value);
    if (!key) return null;

    const pool = [...anime, ...catalog];
    const exact = pool.find((item) => cloudTitleAliases(item).some((alias) => alias === key));
    if (exact) return exact;

    // Fall back to a contained alias only for reasonably descriptive names. This
    // lets a local Genome result hand us an official title even when the prompt
    // used a nickname such as "Slime".
    return pool
      .map((item) => ({
        item,
        alias: cloudTitleAliases(item)
          .filter((alias) => alias.length >= 5 && (key.includes(alias) || alias.includes(key)))
          .sort((a, b) => b.length - a.length)[0] || ''
      }))
      .filter((entry) => entry.alias)
      .sort((a, b) => b.alias.length - a.alias.length)[0]?.item || null;
  }

  function resolveHybridSourceAnchor(prompt = '', localResult = null) {
    // The local recommendation router already resolved "Slime" -> the actual
    // source title. Prefer that authoritative resolution over re-parsing the raw
    // prompt, which may only contain a nickname that cloudTitleAliases does not.
    const explicitSource = String(
      localResult?.sourceAnime ||
      localResult?.sourceTitle ||
      ''
    ).trim();
    if (explicitSource) {
      const resolved = findHybridTitleByName(explicitSource);
      if (resolved) return resolved;
    }

    const titleText = String(localResult?.title || '');
    const becauseMatch = titleText.match(/because you like\s+(.+)$/i);
    if (becauseMatch?.[1]) {
      const resolved = findHybridTitleByName(becauseMatch[1].trim());
      if (resolved) return resolved;
    }

    return findCloudTitleMatches(prompt)
      .find((entry) => entry.source === 'library')?.item ||
      findCloudTitleMatches(prompt)[0]?.item ||
      null;
  }

  function isJoeAIComparisonQuestion(prompt = '') {
    const text = String(prompt || '').trim();
    if (!text) return false;

    return (
      /\b(vs\.?|versus|over|than|compare|comparison|between|prefer|prefers|preferred|better\s+than|more\s+than)\b/i.test(text) ||
      /\b(?:which|what)\b.{0,70}\b(?:fits?|suits?|matches?)\b.{0,45}\bbetter\b/i.test(text) ||
      /\bbetter\b.{0,50}\b(?:or|between)\b/i.test(text)
    );
  }

  function isJoeAILibraryReflectionQuestion(prompt = '') {
    const text = String(prompt || '').trim().toLowerCase();
    if (!text) return false;

    // A title-to-title comparison can contain phrases like "my taste" + "which",
    // which previously made the broad reflection detector steal the request before
    // the comparison route could build its deterministic receipt card.
    if (isJoeAIComparisonQuestion(prompt)) return false;

    // These are questions about the user's overall taste/library, not title lookups.
    // Catch them before the legacy title-question parser can turn phrases such as
    // "unusual about my library" into a fake anime title.
    return (
      /\b(unusual|surprising|interesting|weird|unique|odd|unexpected)\b.*\b(my\s+)?(library|taste|anime)\b/i.test(text) ||
      /\b(my\s+)?(library|taste)\b.*\b(unusual|surprising|interesting|weird|unique|odd|unexpected)\b/i.test(text) ||
      /\b(blind\s+spot|biggest\s+blind\s+spot|weakness|strength)\b/i.test(text) ||
      /\bwhat\s+(?:kind\s+of\s+anime\s+)?do\s+i\s+(?:seem\s+to\s+)?avoid\b/i.test(text) ||
      /\bwhat\s+do\s+i\s+(?:seem\s+to\s+)?value\b/i.test(text) ||
      /\bwhat\s+(?:does|do)\s+my\s+(?:anime\s+)?(?:taste|library)\s+(?:say|tell)\b/i.test(text) ||
      /\bwhat\s+(?:patterns?|themes?)\s+(?:stand\s+out|show\s+up|define\s+me)\b/i.test(text) ||
      /\bwhat\s+surprised\s+you\b/i.test(text) ||
      (
        /\b(my\s+(?:anime\s+)?(?:library|taste)|my\s+ratings|my\s+favorites|my\s+rewatches|anime\s+dna)\b/i.test(text) &&
        /\b(what|why|how|which|tell|describe|analy[sz]e|explain|think)\b/i.test(text)
      )
    );
  }

  function isJoeAIRecommendationRequest(prompt = '') {
    const text = String(prompt || '').trim();
    if (!text) return false;

    // Explanations about an existing recommendation should stay on the explanation
    // route instead of accidentally starting a fresh recommendation run.
    if (/\bwhy\b.{0,40}\b(?:recommend|recomend|suggest|pick|picked)\b/i.test(text)) return false;

    return (
      /\b(?:recommend|recomend|suggest)\b/i.test(text) ||
      /\bwhat\s+should\s+i\s+watch(?:\s+next)?\b/i.test(text) ||
      /\bwhat\s+(?:can|could)\s+i\s+watch\b/i.test(text) ||
      /\b(?:show|give|find|pick)\s+me\b.{0,50}\b(?:anime|show|series|movie|something|hidden\s+gem|pick)\b/i.test(text) ||
      /\b(?:something|anime|show|series|movie)\b.{0,35}\b(?:i(?:'d| would)\s+like|to\s+watch)\b/i.test(text) ||
      /\b(?:movie|anime|show)\s+for\s+tonight\b/i.test(text) ||
      /\bhidden\s+gem\b/i.test(text)
    );
  }

  function comparisonContinuationPenalty(item = {}) {
    const display = recommendationDetailTitleKey(
      [item.title, item.officialTitle, item.englishTitle].filter(Boolean).join(' ')
    );

    let penalty = 0;
    if (/\b(?:season|s)\s*[2-9]\b/.test(display)) penalty += 350;
    if (/\b(?:part|cour)\s*[2-9]\b/.test(display)) penalty += 260;
    if (/\b(?:movie|film|ova|ona|specials?|recap)\b/.test(display)) penalty += 220;
    if (/\b(?:ii|iii|iv)\b/.test(display)) penalty += 140;
    return penalty;
  }

  function promptExplicitlyRequestsContinuation(prompt = '') {
    const key = recommendationDetailTitleKey(prompt);
    return /\b(?:season|s)\s*[2-9]\b|\b(?:part|cour)\s*[2-9]\b|\b(?:movie|film|ova|ona|specials?|recap)\b/.test(key);
  }

  function cleanComparisonTarget(value = '') {
    return String(value || '')
      .trim()
      .replace(/^[\s"'“”‘’`([{]+|[\s"'“”‘’`\])}]+$/g, '')
      .replace(/\s+(?:for|based\s+on)\s+my\s+(?:anime\s+)?taste\s*$/i, '')
      .replace(/\s+in\s+my\s+(?:anime\s+)?library\s*$/i, '')
      .trim();
  }

  function extractComparisonTitleQueries(prompt = '') {
    const raw = String(prompt || '')
      .trim()
      .replace(/[?!]+\s*$/g, '')
      .trim();
    if (!raw) return [];

    const patterns = [
      /\bwhy\s+do\s+i\s+(?:like|prefer)\s+(.+?)\s+(?:more\s+than|over|to)\s+(.+)$/i,
      /\bcompare\s+(.+?)\s+(?:vs\.?|versus|and|with)\s+(.+)$/i,
      /\bbetter\b\s*[,\-:]?\s*(.+?)\s+or\s+(.+)$/i,
      /\bbetween\s+(.+?)\s+and\s+(.+)$/i,
      /^(.+?)\s+(?:vs\.?|versus)\s+(.+)$/i,
      /^(.+?)\s+(?:more\s+than|better\s+than|over)\s+(.+)$/i,
      /^(.+?)\s+or\s+(.+?)\s+(?:which|what).+\bbetter$/i
    ];

    for (const pattern of patterns) {
      const match = raw.match(pattern);
      if (!match) continue;

      const left = cleanComparisonTarget(match[1]);
      const right = cleanComparisonTarget(match[2]);
      if (left && right) return [left, right];
    }

    return [];
  }

  function comparisonTargetContinuation(value = '') {
    const key = recommendationDetailTitleKey(value);
    const season = key.match(/\b(?:season\s*|s)([2-9])\b/);
    const part = key.match(/\b(?:part|cour)\s*([2-9])\b/);
    const special = key.match(/\b(movie|film|ova|ona|specials?|recap)\b/);

    return {
      season: season ? Number(season[1]) : null,
      part: part ? Number(part[1]) : null,
      special: special ? special[1] : ''
    };
  }

  function comparisonCandidateMatchesContinuation(item = {}, requested = {}) {
    if (!requested.season && !requested.part && !requested.special) return false;

    const display = recommendationDetailTitleKey(
      [item.title, item.officialTitle, item.englishTitle, item.canonicalTitle]
        .filter(Boolean)
        .join(' ')
    );

    if (requested.season) {
      const seasonPattern = new RegExp(`\\b(?:season\\s*|s)${requested.season}\\b`, 'i');
      if (!seasonPattern.test(display)) return false;
    }

    if (requested.part) {
      const partPattern = new RegExp(`\\b(?:part|cour)\\s*${requested.part}\\b`, 'i');
      if (!partPattern.test(display)) return false;
    }

    if (requested.special && !new RegExp(`\\b${requested.special}\\b`, 'i').test(display)) return false;
    return true;
  }

  function resolveComparisonLibraryTarget(value = '', excluded = []) {
    const query = cleanComparisonTarget(value);
    const queryKey = recommendationDetailTitleKey(query);
    if (!queryKey) return null;

    const requestedContinuation = comparisonTargetContinuation(query);
    const wantsContinuation = Boolean(
      requestedContinuation.season || requestedContinuation.part || requestedContinuation.special
    );

    const shorthandEntry = [...COMMON_CLOUD_TITLE_SHORTHANDS.entries()]
      .find(([short]) => queryKey === short || queryKey.startsWith(`${short} `));
    const shorthandTargets = shorthandEntry?.[1] || [];

    const candidates = anime
      .map((item, index) => {
        if (excluded.some((other) => other && sameAnimeIdentity(item, other))) return null;

        const aliases = cloudTitleAliases(item);
        const displayAliases = [
          item.title,
          item.officialTitle,
          item.englishTitle,
          item.canonicalTitle
        ]
          .filter(Boolean)
          .map(recommendationDetailTitleKey)
          .filter(Boolean);

        let matchScore = 0;
        let reason = '';

        if (displayAliases.includes(queryKey)) {
          matchScore = 5000;
          reason = 'exact display title';
        } else if (aliases.includes(queryKey)) {
          matchScore = 4500;
          reason = 'exact alias';
        }

        for (const target of shorthandTargets) {
          const targetKey = recommendationDetailTitleKey(target);
          if (!targetKey) continue;

          if (displayAliases.includes(targetKey)) {
            const scoreValue = 4900;
            if (scoreValue > matchScore) {
              matchScore = scoreValue;
              reason = `base shorthand ${shorthandEntry[0]}`;
            }
          } else if (displayAliases.some((alias) => alias.startsWith(`${targetKey} `))) {
            const scoreValue = 3600;
            if (scoreValue > matchScore) {
              matchScore = scoreValue;
              reason = `shorthand franchise member ${shorthandEntry[0]}`;
            }
          } else if (aliases.includes(targetKey)) {
            const scoreValue = 3300;
            if (scoreValue > matchScore) {
              matchScore = scoreValue;
              reason = `shorthand alias ${shorthandEntry[0]}`;
            }
          }
        }

        // Full-title requests can still resolve harmless punctuation/subtitle
        // differences, but this is deliberately weaker than an exact title/alias.
        if (queryKey.length >= 5) {
          for (const alias of aliases) {
            if (alias === queryKey) continue;
            if (alias.startsWith(`${queryKey} `) || queryKey.startsWith(`${alias} `)) {
              const scoreValue = 2600 + Math.min(200, Math.min(alias.length, queryKey.length));
              if (scoreValue > matchScore) {
                matchScore = scoreValue;
                reason = 'contained title';
              }
            }
          }
        }

        if (!matchScore) return null;

        if (wantsContinuation) {
          if (comparisonCandidateMatchesContinuation(item, requestedContinuation)) matchScore += 1200;
          else matchScore -= 900;
        } else {
          // Bare franchise names and shorthands should prefer the actual base entry.
          // A sequel/OVA can still be used as a fallback when the base is absent,
          // but it cannot beat a real base-title match.
          matchScore -= comparisonContinuationPenalty(item);

          const displayBases = displayAliases.map((alias) =>
            recommendationDetailTitleKey(franchiseBaseTitle(alias))
          );
          if (displayBases.includes(queryKey) && !displayAliases.includes(queryKey)) {
            matchScore -= 500;
          }
        }

        return { item, index, matchScore, reason };
      })
      .filter(Boolean)
      .sort((a, b) => b.matchScore - a.matchScore || a.index - b.index);

    return candidates[0]?.item || null;
  }

  function resolveComparisonLibraryTitles(prompt = '') {
    // Resolve the two sides independently instead of ranking every library title
    // against the entire sentence. The old global ranking could choose two entries
    // from one franchise or miss a nickname even when both intended titles existed.
    const explicitTargets = extractComparisonTitleQueries(prompt);
    if (explicitTargets.length === 2) {
      const first = resolveComparisonLibraryTarget(explicitTargets[0]);
      const second = resolveComparisonLibraryTarget(explicitTargets[1], first ? [first] : []);
      if (first && second) return [first, second];
    }

    // Conservative fallback for unusual comparison phrasing that the two-target
    // parser does not recognize yet. Keep this path grounded in the library only.
    const matches = findCloudTitleMatches(prompt)
      .filter(({ source }) => source === 'library')
      .map(({ item }) => item);

    const picked = [];
    for (const item of matches) {
      if (picked.some((other) => sameAnimeIdentity(item, other))) continue;
      picked.push(item);
      if (picked.length >= 2) break;
    }

    return picked;
  }

  function comparisonGenomeFallback(value = '') {
    const query = cleanComparisonTarget(value);
    if (!query) return null;

    const card = findGenomeCardByTitle(query);
    if (!card) return null;

    const canonicalTitle =
      (Array.isArray(card.titles) ? card.titles[0] : '') ||
      card.title ||
      query;

    return {
      id: `genome:${card.id || recommendationDetailTitleKey(canonicalTitle)}`,
      title: canonicalTitle,
      officialTitle: canonicalTitle,
      titleSynonyms: Array.isArray(card.titles) ? card.titles.slice(1, 8) : [],
      aliases: Array.isArray(card.aliases) ? card.aliases.slice(0, 8) : [],
      themes: Array.isArray(card.themes) ? card.themes.slice(0, 10) : [],
      tags: Array.isArray(card.tags) ? card.tags.slice(0, 10) : [],
      viewerMotivations: Array.isArray(card.viewerMotivations) ? card.viewerMotivations.slice(0, 10) : [],
      fantasyPillars: Array.isArray(card.fantasyPillars) ? card.fantasyPillars.slice(0, 10) : [],
      atmosphere: Array.isArray(card.atmosphere) ? card.atmosphere.slice(0, 8) : [],
      emotionalProfile: Array.isArray(card.emotionalProfile) ? card.emotionalProfile.slice(0, 8) : [],
      synopsis: card.signature || card.coreFantasy || '',
      genome: card,
      metadataReady: true,
      owned: false,
      catalogSource: 'genome-registry'
    };
  }

  function resolveComparisonCatalogTarget(value = '', excluded = []) {
    const query = cleanComparisonTarget(value);
    const queryKey = recommendationDetailTitleKey(query);
    if (!queryKey) return null;

    const requestedContinuation = comparisonTargetContinuation(query);
    const wantsContinuation = Boolean(
      requestedContinuation.season || requestedContinuation.part || requestedContinuation.special
    );

    const shorthandEntry = [...COMMON_CLOUD_TITLE_SHORTHANDS.entries()]
      .find(([short]) => queryKey === short || queryKey.startsWith(`${short} `));
    const shorthandTargets = shorthandEntry?.[1] || [];

    const candidates = catalog
      .map((item, index) => {
        if (excluded.some((other) => other && sameAnimeIdentity(item, other))) return null;

        const aliases = cloudTitleAliases(item);
        const displayAliases = [
          item.title,
          item.officialTitle,
          item.englishTitle,
          item.canonicalTitle
        ]
          .filter(Boolean)
          .map(recommendationDetailTitleKey)
          .filter(Boolean);

        let matchScore = 0;

        if (displayAliases.includes(queryKey)) {
          matchScore = 5000;
        } else if (aliases.includes(queryKey)) {
          matchScore = 4500;
        }

        for (const target of shorthandTargets) {
          const targetKey = recommendationDetailTitleKey(target);
          if (!targetKey) continue;

          if (displayAliases.includes(targetKey)) {
            matchScore = Math.max(matchScore, 4900);
          } else if (displayAliases.some((alias) => alias.startsWith(`${targetKey} `))) {
            matchScore = Math.max(matchScore, 3600);
          } else if (aliases.includes(targetKey)) {
            matchScore = Math.max(matchScore, 3300);
          }
        }

        if (queryKey.length >= 5) {
          for (const alias of aliases) {
            if (alias === queryKey) continue;
            if (alias.startsWith(`${queryKey} `) || queryKey.startsWith(`${alias} `)) {
              matchScore = Math.max(
                matchScore,
                2600 + Math.min(200, Math.min(alias.length, queryKey.length))
              );
            }
          }
        }

        if (!matchScore) return null;

        if (wantsContinuation) {
          if (comparisonCandidateMatchesContinuation(item, requestedContinuation)) matchScore += 1200;
          else matchScore -= 900;
        } else {
          matchScore -= comparisonContinuationPenalty(item);

          const displayBases = displayAliases.map((alias) =>
            recommendationDetailTitleKey(franchiseBaseTitle(alias))
          );
          if (displayBases.includes(queryKey) && !displayAliases.includes(queryKey)) {
            matchScore -= 500;
          }
        }

        return { item, index, matchScore };
      })
      .filter(Boolean)
      .sort((a, b) => b.matchScore - a.matchScore || a.index - b.index);

    if (candidates[0]?.item) return candidates[0].item;

    // The Genome registry is JoeAI's last local identity fallback. This lets a
    // known title participate in a predictive comparison even when the catalog
    // row is missing or has not been enriched yet.
    const genomeItem = comparisonGenomeFallback(query);
    if (
      genomeItem &&
      !excluded.some((other) => other && sameAnimeIdentity(genomeItem, other))
    ) return genomeItem;

    return null;
  }

  function resolveFlexibleComparisonTargets(prompt = '') {
    const explicitTargets = extractComparisonTitleQueries(prompt);
    if (explicitTargets.length !== 2) return [];

    const resolved = [];
    for (const query of explicitTargets) {
      const libraryItem = resolveComparisonLibraryTarget(query, resolved.map((entry) => entry.item));
      if (libraryItem) {
        resolved.push({ item: libraryItem, source: 'library', query });
        continue;
      }

      const catalogItem = resolveComparisonCatalogTarget(query, resolved.map((entry) => entry.item));
      if (catalogItem) {
        resolved.push({ item: catalogItem, source: 'catalog', query });
        continue;
      }

      return [];
    }

    return resolved;
  }

  function comparisonPrediction(item = {}, source = 'catalog', activeState = joeAIState) {
    const targetTitle = item.officialTitle || item.title || '';
    const targetBase = recommendationDetailTitleKey(franchiseBaseTitle(targetTitle));

    // When predicting an owned title, remove that franchise from the taste-profile
    // input so the recommendation engine can score the target as if it were unseen
    // instead of rejecting it as already watched.
    const tasteLibrary = anime.filter((libraryItem) => {
      if (sameAnimeIdentity(libraryItem, item)) return false;
      if (source !== 'library') return true;

      const libraryBase = recommendationDetailTitleKey(
        franchiseBaseTitle(libraryItem.officialTitle || libraryItem.title || '')
      );
      return !targetBase || libraryBase !== targetBase;
    });

    const candidate = {
      ...item,
      owned: false,
      inLibrary: false
    };

    const predicted = recommendAnime(tasteLibrary, [candidate], {
      limit: 1,
      joeAIState: activeState || joeAIState,
      prompt: ''
    })?.[0] || null;

    if (!predicted) {
      return {
        match: null,
        dataConfidence: null,
        predictionConfidence: null,
        reasons: [],
        genomeTraits: []
      };
    }

    return {
      match: Number.isFinite(Number(predicted.match)) ? Number(predicted.match) : null,
      dataConfidence: Number.isFinite(Number(predicted.confidenceReceipt?.dataConfidence))
        ? Number(predicted.confidenceReceipt.dataConfidence)
        : null,
      predictionConfidence: Number.isFinite(Number(predicted.confidenceReceipt?.predictionConfidence))
        ? Number(predicted.confidenceReceipt.predictionConfidence)
        : null,
      reasons: Array.isArray(predicted.reasons) ? predicted.reasons.slice(0, 4) : [],
      genomeTraits: Array.isArray(predicted.genomeTraits) ? predicted.genomeTraits.slice(0, 6) : []
    };
  }

  function comparisonDecisionFit(entry = {}, prediction = {}) {
    if (entry.source === 'library') {
      const receipt = cloudComparisonRecord(entry.item);
      const savedScore = Number(receipt.score || 0);
      if (savedScore > 0) {
        return Math.max(1, Math.min(
          100,
          Math.round(
            (savedScore * 10) +
            (receipt.favorite ? 3 : 0) +
            Math.min(4, Number(receipt.rewatches || 0))
          )
        ));
      }
    }

    const predicted = Number(prediction.match);
    return Number.isFinite(predicted) && predicted > 0 ? Math.round(predicted) : null;
  }

  function cloudFlexibleComparisonRecord(entry = {}, prediction = {}) {
    const item = entry.item || {};
    const owned = entry.source === 'library';
    const base = owned
      ? cloudComparisonRecord(item)
      : cloudCompactAnime(item, { rich: true, source: 'catalog' });

    return {
      ...base,
      source: owned ? 'library' : 'catalog',
      owned,
      inLibrary: owned,
      comparisonBasis: owned ? 'saved-library-evidence' : 'anime-dna-prediction',
      predictedFit: Number.isFinite(Number(prediction.match)) ? Number(prediction.match) : null,
      dataConfidence: Number.isFinite(Number(prediction.dataConfidence)) ? Number(prediction.dataConfidence) : null,
      predictionConfidence: Number.isFinite(Number(prediction.predictionConfidence)) ? Number(prediction.predictionConfidence) : null,
      predictionReasons: Array.isArray(prediction.reasons) ? prediction.reasons.slice(0, 4) : [],
      genomeTraits: Array.isArray(prediction.genomeTraits) ? prediction.genomeTraits.slice(0, 6) : []
    };
  }

  function buildPredictiveComparisonEvidence(prompt = '', activeState = joeAIState) {
    const targets = resolveFlexibleComparisonTargets(prompt);
    if (targets.length !== 2) return null;

    const predictions = targets.map((entry) =>
      comparisonPrediction(entry.item, entry.source, activeState)
    );
    const records = targets.map((entry, index) =>
      cloudFlexibleComparisonRecord(entry, predictions[index])
    );

    const ownedCount = targets.filter((entry) => entry.source === 'library').length;
    const comparisonMode = ownedCount === 2
      ? 'saved'
      : ownedCount === 1
        ? 'mixed'
        : 'predictive';

    // The existing receipt path remains untouched for two owned titles.
    if (comparisonMode === 'saved') {
      const savedEvidence = buildTitleComparisonEvidence(prompt);
      return savedEvidence ? { ...savedEvidence, comparisonMode: 'saved' } : null;
    }

    const [firstEntry, secondEntry] = targets;
    const [firstPrediction, secondPrediction] = predictions;
    const [firstRecord, secondRecord] = records;
    const firstTitle = firstEntry.item.officialTitle || firstEntry.item.title || firstEntry.query;
    const secondTitle = secondEntry.item.officialTitle || secondEntry.item.title || secondEntry.query;

    const firstFit = comparisonDecisionFit(firstEntry, firstPrediction);
    const secondFit = comparisonDecisionFit(secondEntry, secondPrediction);
    const bothFits = Number.isFinite(firstFit) && Number.isFinite(secondFit);
    const fitGap = bothFits ? Math.abs(firstFit - secondFit) : 0;
    const winnerTitle = bothFits && fitGap > 2
      ? (firstFit > secondFit ? firstTitle : secondTitle)
      : '';

    const confidenceValues = [
      firstPrediction.predictionConfidence,
      secondPrediction.predictionConfidence
    ].map(Number).filter(Number.isFinite);
    const averageConfidence = confidenceValues.length
      ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
      : 64;
    const signalStrength = Math.max(
      45,
      Math.min(94, Math.round(averageConfidence + Math.min(10, fitGap / 2)))
    );

    const metrics = [];
    const contributors = [];

    targets.forEach((entry, index) => {
      const item = entry.item;
      const record = records[index];
      const prediction = predictions[index];
      const title = item.officialTitle || item.title || entry.query;

      if (entry.source === 'library') {
        const savedScore = Number(record.score || 0);
        metrics.push({
          label: `${title} saved score`,
          value: savedScore > 0 ? savedScore.toFixed(1).replace(/\.0$/, '') : '—'
        });
        metrics.push({
          label: `${title} favorite`,
          value: record.favorite ? 'Yes' : 'No'
        });

        contributors.push({
          ...item,
          title,
          score: savedScore || null,
          rewatches: Number(record.rewatches || 0),
          favorite: Boolean(record.favorite),
          status: record.status || item.status || '',
          comparisonSummary: [
            savedScore > 0 ? `★ ${savedScore.toFixed(1).replace(/\.0$/, '')}` : 'No saved score',
            Number(record.rewatches || 0) > 0
              ? `${Number(record.rewatches)} rewatch${Number(record.rewatches) === 1 ? '' : 'es'}`
              : '',
            record.favorite ? 'Favorite' : '',
            'Library evidence'
          ].filter(Boolean).join(' · ')
        });
      } else {
        const predictedFit = Number(prediction.match);
        const predictionConfidence = Number(prediction.predictionConfidence);

        metrics.push({
          label: `${title} predicted fit`,
          value: Number.isFinite(predictedFit) ? `${Math.round(predictedFit)}%` : '—'
        });
        metrics.push({
          label: `${title} prediction confidence`,
          value: Number.isFinite(predictionConfidence) ? `${Math.round(predictionConfidence)}%` : '—'
        });

        contributors.push({
          ...item,
          title,
          score: null,
          rewatches: 0,
          favorite: false,
          status: '',
          comparisonSummary: [
            Number.isFinite(predictedFit) ? `${Math.round(predictedFit)}% predicted taste fit` : 'Predictive comparison',
            Number.isFinite(predictionConfidence) ? `${Math.round(predictionConfidence)}% confidence` : '',
            'Not in library'
          ].filter(Boolean).join(' · ')
        });
      }
    });

    const genreCounts = countBy(
      anime.flatMap((item) => Array.isArray(item.genres) ? item.genres : [])
    );
    const targetSignals = new Set(
      targets.flatMap(({ item }, index) => [
        ...(Array.isArray(item.genres) ? item.genres : []),
        ...(Array.isArray(item.themes) ? item.themes : []),
        ...(Array.isArray(predictions[index].genomeTraits) ? predictions[index].genomeTraits : [])
      ]).filter(Boolean)
    );
    const relevantSignals = genreCounts
      .filter(([name]) => targetSignals.has(name))
      .slice(0, 5);
    const fallbackSignals = relevantSignals.length ? relevantSignals : genreCounts.slice(0, 5);
    const maxSignalCount = Math.max(
      1,
      ...fallbackSignals.map(([, count]) => Number(count) || 0)
    );

    const summary = comparisonMode === 'mixed'
      ? 'A mixed taste comparison using saved library evidence for the title you know and an Anime DNA prediction for the unseen title.'
      : 'A predictive taste comparison using your Anime DNA, Genome evidence, and available title metadata. Predicted fit is not a saved rating.';

    return {
      type: 'genreDNAExplanation',
      title: `${firstTitle} vs ${secondTitle}`,
      summary,
      strength: signalStrength,
      metrics,
      contributors,
      contributorsHeading: comparisonMode === 'mixed'
        ? 'Saved + predictive evidence'
        : 'Predictive evidence',
      companions: fallbackSignals.map(([name, count]) => ({
        name,
        percent: Math.max(8, Math.round((Number(count) / maxSignalCount) * 100))
      })),
      comparedTitles: records,
      comparisonMode,
      decision: {
        winnerTitle,
        close: !winnerTitle,
        firstTitle,
        secondTitle,
        firstFit,
        secondFit,
        rule: comparisonMode === 'mixed'
          ? 'Saved personal evidence outranks prediction when a direct user score exists; unseen-title fit comes from local Anime DNA prediction.'
          : 'Both fits are local Anime DNA predictions, not user ratings.'
      }
    };
  }

  function buildTitleComparisonEvidence(prompt = '') {
    const unique = resolveComparisonLibraryTitles(prompt);

    if (unique.length < 2) return null;

    const [first, second] = unique;
    const firstTitle = first.officialTitle || first.title || 'First title';
    const secondTitle = second.officialTitle || second.title || 'Second title';

    // Comparison receipts must come from explicit saved personal fields only.
    // Never use score(item) here because that helper may include derived/community
    // values and can make a comparison look like the user saved a score they did not.
    const firstReceipt = cloudComparisonRecord(first);
    const secondReceipt = cloudComparisonRecord(second);
    const firstScore = Number(firstReceipt.score || 0) || 0;
    const secondScore = Number(secondReceipt.score || 0) || 0;
    const firstRewatches = Number(firstReceipt.rewatches || 0) || 0;
    const secondRewatches = Number(secondReceipt.rewatches || 0) || 0;
    const favoriteDelta = Number(Boolean(first.favorite)) !== Number(Boolean(second.favorite)) ? 8 : 0;
    const signalStrength = Math.max(40, Math.min(95, Math.round(
      48 + Math.abs(firstScore - secondScore) * 10 + Math.abs(firstRewatches - secondRewatches) * 4 + favoriteDelta
    )));

    const genreCounts = countBy(anime.flatMap((item) => Array.isArray(item.genres) ? item.genres : []));
    const comparedGenres = new Set([
      ...(Array.isArray(first.genres) ? first.genres : []),
      ...(Array.isArray(second.genres) ? second.genres : [])
    ].filter(Boolean));
    const relevantGenres = genreCounts
      .filter(([name]) => comparedGenres.has(name))
      .slice(0, 5);
    const fallbackGenres = relevantGenres.length ? relevantGenres : genreCounts.slice(0, 5);
    const maxGenreCount = Math.max(1, ...fallbackGenres.map(([, count]) => Number(count) || 0));

    const prefersFirst = /\bprefer(?:s|red)?\b/i.test(prompt) || /\bmore\s+than\b/i.test(prompt) || /\bover\b/i.test(prompt);

    return {
      type: 'genreDNAExplanation',
      title: prefersFirst
        ? `Why you prefer ${firstTitle} to ${secondTitle}`
        : `${firstTitle} vs ${secondTitle}`,
      summary: 'A title-to-title preference read grounded in your saved ratings, rewatches, favorites, and broader Anime DNA.',
      strength: signalStrength,
      metrics: [
        { label: `${firstTitle} score`, value: firstScore ? firstScore.toFixed(1).replace(/\.0$/, '') : '—' },
        { label: `${secondTitle} score`, value: secondScore ? secondScore.toFixed(1).replace(/\.0$/, '') : '—' },
        { label: `${firstTitle} rewatches`, value: firstRewatches },
        { label: `${secondTitle} rewatches`, value: secondRewatches },
        { label: `${firstTitle} favorite`, value: first.favorite ? 'Yes' : 'No' },
        { label: `${secondTitle} favorite`, value: second.favorite ? 'Yes' : 'No' }
      ],
      contributors: [
        {
          ...first,
          score: firstScore || null,
          rewatches: firstRewatches,
          favorite: Boolean(firstReceipt.favorite),
          status: firstReceipt.status || first.status || ''
        },
        {
          ...second,
          score: secondScore || null,
          rewatches: secondRewatches,
          favorite: Boolean(secondReceipt.favorite),
          status: secondReceipt.status || second.status || ''
        }
      ],
      companions: fallbackGenres.map(([name, count]) => ({
        name,
        percent: Math.max(8, Math.round((Number(count) / maxGenreCount) * 100))
      })),
      comparedTitles: [
        firstReceipt,
        secondReceipt
      ]
    };
  }

  function cloudRecommendationCandidateKey(item = {}, index = 0) {
    const stable = recommendationKey(item);
    if (stable) return String(stable);

    const providerId = item.malId ?? item.mal_id ?? item.kitsuId ?? item.kitsu_id ?? item.id;
    if (providerId !== undefined && providerId !== null && String(providerId).trim()) {
      return `candidate:${String(providerId).trim().toLowerCase()}`;
    }

    return `title:${recommendationDetailTitleKey(item.officialTitle || item.title || `candidate-${index}`)}`;
  }

  function compactHybridGenome(item = {}) {
    const genome = item.genome || item.animeGenome || item.genomeCard || item.genomeData;
    if (!genome || typeof genome !== 'object') return undefined;

    const usefulKey = /(tone|theme|motivation|fantasy|atmosphere|emotion|pacing|comedy|world|character|setting|story|appeal|genre|trait|conflict|stakes)/i;
    const entries = Object.entries(genome)
      .filter(([key]) => usefulKey.test(key))
      .slice(0, 14)
      .map(([key, value]) => [key, compactCloudValue(value, 1)])
      .filter(([, value]) => value !== undefined);

    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  function hybridCandidateRecord(item = {}, index = 0) {
    // Keep the second-pass prompt compact enough to be reliable. The first POC
    // sent entire Genome objects and ~900-character synopses for every candidate,
    // which pushed the reranker into long/truncated JSON responses. The reviewer
    // only needs the strongest taste evidence, not a second copy of the database.
    const rich = cloudCompactAnime(item, {
      rich: false,
      source: item.owned ? 'library' : 'catalog'
    });
    const synopsis = String(item.synopsis || item.description || '').trim();
    const genome = compactHybridGenome(item);

    const extraSignals = {
      tags: Array.isArray(item.tags) ? item.tags.slice(0, 6) : [],
      viewerMotivations: Array.isArray(item.viewerMotivations) ? item.viewerMotivations.slice(0, 6) : [],
      fantasyPillars: Array.isArray(item.fantasyPillars) ? item.fantasyPillars.slice(0, 6) : [],
      atmosphere: Array.isArray(item.atmosphere) ? item.atmosphere.slice(0, 5) : [],
      emotionalProfile: Array.isArray(item.emotionalProfile) ? item.emotionalProfile.slice(0, 5) : [],
      genomeTraits: Array.isArray(item.genomeTraits) ? item.genomeTraits.slice(0, 6) : []
    };

    return {
      key: cloudRecommendationCandidateKey(item, index),
      localRank: index + 1,
      localMatch: Math.max(0, Math.min(100, Number(item.match || 0))),
      sourceSimilarity: Math.max(0, Math.min(100, Number(item.sourceSimilarity || 0))),
      localReasons: Array.isArray(item.reasons) ? item.reasons.slice(0, 5) : [],
      localWarnings: Array.isArray(item.warnings) ? item.warnings.slice(0, 3) : [],
      ...rich,
      ...(synopsis ? { synopsis: synopsis.slice(0, 420) } : {}),
      ...(genome ? { genome } : {}),
      ...extraSignals
    };
  }

  function hybridLibraryIdentityIndex() {
    const identityKeys = new Set();

    for (const item of anime) {
      animeIdentityKeys(item).forEach((key) => identityKeys.add(key));
      if (item?.id !== undefined && item?.id !== null && String(item.id).trim()) {
        identityKeys.add(`id:${String(item.id).trim().toLowerCase()}`);
      }
    }

    return { identityKeys, items: anime };
  }

  function hybridIdentityKeys(item = {}) {
    const keys = new Set(animeIdentityKeys(item));
    if (item?.id !== undefined && item?.id !== null && String(item.id).trim()) {
      keys.add(`id:${String(item.id).trim().toLowerCase()}`);
    }
    return keys;
  }

  function isHybridCandidateOwned(item = {}, libraryIndex = hybridLibraryIdentityIndex()) {
    if (item.owned || item.bucket === 'library') return true;

    const keys = hybridIdentityKeys(item);
    for (const key of keys) {
      if (libraryIndex.identityKeys.has(key)) return true;
    }

    // Last-resort structural comparison catches provider-less aliases while still
    // respecting season/year/episode distinctions in the shared identity service.
    return (libraryIndex.items || []).some((libraryItem) => sameAnimeIdentity(item, libraryItem));
  }

  function hybridFranchiseKeys(item = {}) {
    const explicit = item.franchise || item.franchiseTitle || item.seriesTitle || item.parentTitle || '';
    const titles = explicit ? [explicit, ...identityTitleAliases(item)] : identityTitleAliases(item);
    const keys = new Set();

    titles.filter(Boolean).forEach((value) => {
      let title = franchiseBaseTitle(value);
      if (!title) return;

      title = title
        .replace(/\b(?:season|series|part|cour)\s*\d+\b.*$/i, '')
        .replace(/\b\d+(?:st|nd|rd|th)\s+season\b.*$/i, '')
        .replace(/\s+(?:specials?|ova|ona|recaps?|picture\s+drama|mini\s+anime)\b.*$/i, '')
        .trim();

      const key = recommendationDetailTitleKey(title);
      if (key) keys.add(key);
    });

    return keys;
  }

  function hybridContinuationInfo(item = {}) {
    const titles = identityTitleAliases(item).map((value) => String(value || '').toLowerCase());
    const blob = [...titles, String(item.type || item.format || '').toLowerCase()].join(' ');
    const season = titles.map((title) => {
      const match = title.match(/\b(?:season|series)\s*(\d+)\b|\b(\d+)(?:st|nd|rd|th)\s+season\b/);
      return Number(match?.[1] || match?.[2] || 0);
    }).find((value) => value > 1) || 0;
    const part = titles.map((title) => Number(title.match(/\b(?:part|cour)\s*(\d+)\b/)?.[1] || 0)).find((value) => value > 1) || 0;
    const companion = /\b(?:specials?|ova|ona|recap|picture\s+drama|mini\s+anime)\b/.test(blob);

    return {
      isContinuation: Boolean(season > 1 || part > 1 || companion),
      season,
      part,
      companion
    };
  }

  function hybridLibraryHasFranchise(item = {}) {
    const candidateKeys = hybridFranchiseKeys(item);
    if (!candidateKeys.size) return false;
    return anime.some((libraryItem) => {
      const libraryKeys = hybridFranchiseKeys(libraryItem);
      for (const key of candidateKeys) {
        if (libraryKeys.has(key)) return true;
      }
      return false;
    });
  }

  function hybridAllowsContinuation(prompt = '') {
    return /\b(?:continue|resume|watch\s+order|next\s+season|another\s+season|same\s+franchise|more\s+(?:of|from)|season\s+\d+|specials?|ova|ona)\b/i.test(String(prompt || ''));
  }

  function hybridShouldGateContinuation(item = {}, prompt = '') {
    if (hybridAllowsContinuation(prompt)) return false;
    const info = hybridContinuationInfo(item);
    return info.isContinuation && !hybridLibraryHasFranchise(item);
  }

  function hybridPromptExclusions(prompt = '') {
    const raw = String(prompt || '').toLowerCase();
    const found = [];
    const pattern = /(?:without|avoid|exclude|nothing\s+with|nothing\s+that\s+has|no(?!\s+(?:more|less|fewer)\s+than))\s+(?:any\s+)?([a-z0-9][a-z0-9 -]{1,32})/gi;
    let match;
    while ((match = pattern.exec(raw))) {
      const phrase = String(match[1] || '')
        .split(/\b(?:but|and|with|under|over|at\s+most|that|which|please)\b/)[0]
        .trim();
      if (phrase) found.push(phrase);
    }
    return [...new Set(found)].slice(0, 8);
  }

  function hybridCandidateText(item = {}) {
    return recommendationDetailTitleKey([
      item.title,
      item.officialTitle,
      item.synopsis,
      item.description,
      item.type,
      item.format,
      ...(Array.isArray(item.genres) ? item.genres : []),
      ...(Array.isArray(item.themes) ? item.themes : []),
      ...(Array.isArray(item.tags) ? item.tags : []),
      ...getAnimeTasteSignals(item)
    ].filter(Boolean).join(' '));
  }

  function hybridCandidateViolatesPromptExclusions(item = {}, prompt = '') {
    const exclusions = hybridPromptExclusions(prompt);
    if (!exclusions.length) return false;
    const blob = ` ${hybridCandidateText(item)} `;
    return exclusions.some((phrase) => {
      const key = recommendationDetailTitleKey(phrase);
      return key && blob.includes(` ${key} `);
    });
  }

  function hybridSimilarityValues(item = {}, keys = []) {
    const values = [];
    for (const key of keys) {
      const value = item?.[key];
      if (Array.isArray(value)) values.push(...value);
      else if (value) values.push(value);
    }
    return [...new Set(
      values
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean)
    )];
  }

  function hybridSetOverlap(sourceValues = [], candidateValues = []) {
    if (!sourceValues.length || !candidateValues.length) return 0;
    const left = new Set(sourceValues);
    const right = new Set(candidateValues);
    let shared = 0;
    for (const value of left) {
      if (right.has(value)) shared += 1;
    }
    const union = new Set([...left, ...right]).size || 1;
    return shared / union;
  }

  function hybridSynopsisTokens(item = {}) {
    const stop = new Set([
      'about', 'after', 'again', 'against', 'being', 'between', 'could', 'from',
      'have', 'into', 'more', 'their', 'there', 'these', 'they', 'this', 'through',
      'under', 'when', 'where', 'which', 'while', 'with', 'would', 'young'
    ]);
    return [...new Set(
      String(item.synopsis || item.description || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]+/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 5 && !stop.has(token))
    )].slice(0, 90);
  }

  function hybridSourceSimilarityScore(source = null, candidate = {}) {
    if (!source) return 0;

    const weighted = [
      [30, hybridSimilarityValues(source, ['genres']), hybridSimilarityValues(candidate, ['genres'])],
      [20, hybridSimilarityValues(source, ['themes', 'tags']), hybridSimilarityValues(candidate, ['themes', 'tags'])],
      [15, hybridSimilarityValues(source, ['viewerMotivations', 'genomeTraits']), hybridSimilarityValues(candidate, ['viewerMotivations', 'genomeTraits'])],
      [12, hybridSimilarityValues(source, ['fantasyPillars', 'rewardLoop']), hybridSimilarityValues(candidate, ['fantasyPillars', 'rewardLoop'])],
      [9, hybridSimilarityValues(source, ['atmosphere', 'emotionalProfile']), hybridSimilarityValues(candidate, ['atmosphere', 'emotionalProfile'])],
      [10, hybridSynopsisTokens(source), hybridSynopsisTokens(candidate)]
    ];

    let score = weighted.reduce(
      (sum, [weight, sourceValues, candidateValues]) => sum + (hybridSetOverlap(sourceValues, candidateValues) * weight),
      0
    );

    const sourceStudio = String(source.studio || source.studios?.[0] || '').trim().toLowerCase();
    const candidateStudio = String(candidate.studio || candidate.studios?.[0] || '').trim().toLowerCase();
    if (sourceStudio && candidateStudio && sourceStudio === candidateStudio) score += 2;

    const sourceType = String(source.type || source.format || '').trim().toLowerCase();
    const candidateType = String(candidate.type || candidate.format || '').trim().toLowerCase();
    if (sourceType && candidateType && sourceType === candidateType) score += 2;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function mergeHybridCandidatePool(localResult, prompt = '', activeState = joeAIState) {
    const baseItems = Array.isArray(localResult?.items) ? localResult.items : [];
    const pool = [...baseItems];
    const libraryIndex = hybridLibraryIdentityIndex();

    // Recommendation prompts mean "show me something to watch" by default.
    // Existing-library titles are evidence/anchors, not recommendation candidates,
    // unless the user explicitly asks for a rewatch or a pick from their library.
    const allowOwned = /\b(?:rewatch|watch\s+again|revisit|continue|resume|pick\s+from\s+my\s+library|from\s+my\s+library|already\s+(?:own|have))\b/i.test(prompt);

    // We are already inside the recommendation pipeline here. Do not make the
    // unseen/owned decision depend on perfect spelling in the raw prompt. A typo
    // such as "recomend something like slime" can still be correctly classified
    // by the intent parser/local router, so normal recommendation runs must remain
    // discovery-only unless the user explicitly asked for a rewatch/library pick.
    const discoveryMode = !allowOwned;
    const sourceAnchor = resolveHybridSourceAnchor(prompt, localResult);
    const sourceFranchiseKeys = sourceAnchor ? hybridFranchiseKeys(sourceAnchor) : new Set();

    // For "something like X", the first gate must be similarity to X. Generic
    // Anime-DNA recommendations are useful for "what should I watch next?" but
    // can swamp an anchored request with titles Joe may like for unrelated reasons.
    if (discoveryMode && sourceAnchor) {
      const sourceDriven = catalog
        .filter((item) => !isHybridCandidateOwned(item, libraryIndex))
        .filter((item) => !hybridCandidateViolatesPromptExclusions(item, prompt))
        .filter((item) => !hybridShouldGateContinuation(item, prompt))
        .filter((item) => {
          const candidateKeys = hybridFranchiseKeys(item);
          for (const key of candidateKeys) {
            if (sourceFranchiseKeys.has(key)) return false;
          }
          return true;
        })
        .map((item) => ({
          ...item,
          sourceSimilarity: hybridSourceSimilarityScore(sourceAnchor, item)
        }))
        .filter((item) => item.sourceSimilarity > 0)
        .sort((a, b) =>
          Number(b.sourceSimilarity || 0) - Number(a.sourceSimilarity || 0)
          || Number(b.communityScore || b.malScore || 0) - Number(a.communityScore || a.malScore || 0)
        )
        .slice(0, 24);

      const enrichedSourceDriven = enrichRecommendationItems({
        type: 'recommendations',
        items: sourceDriven
      }, activeState)?.items || sourceDriven;

      pool.push(...enrichedSourceDriven.map((item) => ({
        ...item,
        sourceSimilarity: Number(
          item.sourceSimilarity
          || sourceDriven.find((candidate) =>
            recommendationDetailTitleKey(candidate.officialTitle || candidate.title)
            === recommendationDetailTitleKey(item.officialTitle || item.title)
          )?.sourceSimilarity
          || 0
        )
      })));
    }

    // Add broad unseen JoeAI picks too. They are valuable for generic requests and
    // serve as challengers on anchored requests, but source similarity gets first
    // priority when a source title is present.
    const currentUnownedCount = pool.filter((item) => !isHybridCandidateOwned(item, libraryIndex)).length;
    if (discoveryMode && currentUnownedCount < 18) {
      const extras = brain?.recommendations?.(28, {
        prompt,
        joeAIState: activeState
      }) || [];
      const enrichedExtras = enrichRecommendationItems({
        type: 'recommendations',
        items: extras
      }, activeState)?.items || extras;
      pool.push(...enrichedExtras);
    } else if (!discoveryMode && localResult?.type === 'recommendations' && baseItems.length < 10) {
      const extras = brain?.recommendations?.(12, { prompt, joeAIState: activeState }) || [];
      const enrichedExtras = enrichRecommendationItems({ type: 'recommendations', items: extras }, activeState)?.items || extras;
      pool.push(...enrichedExtras);
    }

    const seen = new Set();
    const seenFranchises = new Set();
    const allowSameFranchise = hybridAllowsContinuation(prompt);

    let prepared = pool.map((item) => {
      const owned = isHybridCandidateOwned(item, libraryIndex);
      return {
        ...item,
        owned,
        bucket: owned ? 'library' : (item.bucket || 'discovery'),
        sourceSimilarity: sourceAnchor
          ? Math.max(
              Number(item.sourceSimilarity || 0),
              hybridSourceSimilarityScore(sourceAnchor, item)
            )
          : Number(item.sourceSimilarity || 0)
      };
    });

    if (sourceAnchor && discoveryMode) {
      prepared = prepared.sort((a, b) =>
        Number(b.sourceSimilarity || 0) - Number(a.sourceSimilarity || 0)
        || Number(b.match || 0) - Number(a.match || 0)
      );
    }

    const candidates = prepared
      .filter((item, index) => {
        if (discoveryMode && item.owned) return false;
        if (discoveryMode && hybridCandidateViolatesPromptExclusions(item, prompt)) return false;
        if (discoveryMode && hybridShouldGateContinuation(item, prompt)) return false;

        const key = cloudRecommendationCandidateKey(item, index);
        if (!key || seen.has(key)) return false;

        const franchiseKeys = hybridFranchiseKeys(item);
        if (discoveryMode && !allowSameFranchise) {
          // A "like X" discovery request should never recommend another entry
          // from X's own franchise unless the user explicitly asks to continue it.
          for (const franchiseKey of franchiseKeys) {
            if (sourceFranchiseKeys.has(franchiseKey)) return false;
          }

          for (const franchiseKey of franchiseKeys) {
            if (seenFranchises.has(franchiseKey)) return false;
          }
          franchiseKeys.forEach((franchiseKey) => seenFranchises.add(franchiseKey));
        }

        seen.add(key);
        return true;
      })
      .slice(0, 12);

    console.log('[JoeAI] second-pass source anchor:', sourceAnchor?.officialTitle || sourceAnchor?.title || '(generic discovery)');
    console.log('[JoeAI] second-pass candidate pool:', candidates.map((item) => ({
      title: item.officialTitle || item.title,
      owned: Boolean(item.owned),
      localMatch: Number(item.match || 0),
      sourceSimilarity: Number(item.sourceSimilarity || 0)
    })));

    return candidates;
  }

  function buildHybridRecommendationCloudContext(prompt = '', localResult = null, candidates = [], activeState = joeAIState) {
    const scored = [...anime]
      .filter((item) => Number(item.joeScore ?? score(item) ?? 0) > 0)
      .sort((a, b) => Number(b.joeScore ?? score(b) ?? 0) - Number(a.joeScore ?? score(a) ?? 0));

    const lowRated = [...anime]
      .filter((item) => {
        const userScore = Number(item.joeScore ?? score(item) ?? 0);
        return userScore > 0 && userScore <= 7;
      })
      .sort((a, b) => Number(a.joeScore ?? score(a) ?? 0) - Number(b.joeScore ?? score(b) ?? 0))
      .slice(0, 10)
      .map((item) => cloudCompactAnime(item, { source: 'library' }));

    const dropped = anime
      .filter((item) => String(item.status || '').toLowerCase() === 'dropped')
      .slice(0, 10)
      .map((item) => cloudCompactAnime(item, { source: 'library' }));

    const feedback = (Array.isArray(activeState?.feedback) ? activeState.feedback : [])
      .slice(-28)
      .map((entry) => ({
        title: entry.title || '',
        animeKey: entry.animeKey || '',
        action: entry.action || '',
        reason: entry.reason || entry.reasonCode || ''
      }));

    const preferences = (Array.isArray(activeState?.preferences) ? activeState.preferences : [])
      .slice(-24)
      .map((entry) => compactCloudValue(entry));

    const recentRecommendations = (Array.isArray(conversationContext?.lastRecommendations)
      ? conversationContext.lastRecommendations
      : [])
      .slice(0, 10)
      .map((item, index) => ({
        key: cloudRecommendationCandidateKey(item, index),
        title: item.officialTitle || item.title || ''
      }));

    const sourceMatch = resolveHybridSourceAnchor(prompt, localResult);

    return {
      task: 'recommendationRerank',
      candidates: candidates.map((item, index) => hybridCandidateRecord(item, index)),
      sourceAnchor: sourceMatch ? cloudCompactAnime(sourceMatch, { rich: true, source: 'library' }) : undefined,
      localRecommendation: {
        type: localResult?.type || '',
        title: localResult?.title || '',
        subtitle: localResult?.subtitle || '',
        sourceTitle: localResult?.sourceTitle || ''
      },
      requestConstraints: {
        exclude: hybridPromptExclusions(prompt),
        discoveryOnly: !/\b(?:rewatch|watch\s+again|revisit|continue|resume|from\s+my\s+library)\b/i.test(prompt)
      },
      tasteProfile: {
        libraryCount: anime.length,
        topRated: scored.slice(0, 12).map((item) => cloudCompactAnime(item, { source: 'library' })),
        favorites: anime.filter((item) => item.favorite).slice(0, 10).map((item) => cloudCompactAnime(item, { source: 'library' })),
        rewatches: [...anime]
          .filter((item) => Number(item.rewatches || 0) > 0)
          .sort((a, b) => Number(b.rewatches || 0) - Number(a.rewatches || 0))
          .slice(0, 10)
          .map((item) => cloudCompactAnime(item, { source: 'library' })),
        lowRated,
        dropped,
        topGenres: countBy(anime.flatMap((item) => Array.isArray(item.genres) ? item.genres : []))
          .slice(0, 10)
          .map(([name, count]) => ({ name, count })),
        topStudios: countBy(anime.map((item) => item.studio).filter(Boolean))
          .slice(0, 8)
          .map(([name, count]) => ({ name, count }))
      },
      feedback,
      preferences,
      recentRecommendations,
      conversation: {
        lastReferencedTitle: conversationContext?.lastReferencedTitle || '',
        lastPrompt: conversationContext?.lastPrompt || ''
      },
      note: 'Candidates came from the local JoeAI engine. The cloud layer may rerank or reject them but must not invent new titles.'
    };
  }

  function hybridRecommendationTitleKey(value = '') {
    return recommendationDetailTitleKey(value).replace(/\s+/g, '');
  }

  function applyHybridRecommendationPlan(localResult, candidates = [], plan = null) {
    if (!localResult || !Array.isArray(localResult.items) || !plan || !Array.isArray(plan.rankings)) return null;

    const byKey = new Map();
    const byTitle = new Map();
    candidates.forEach((item, index) => {
      byKey.set(cloudRecommendationCandidateKey(item, index), item);
      [item.title, item.officialTitle].filter(Boolean).forEach((name) => {
        byTitle.set(hybridRecommendationTitleKey(name), item);
      });
    });

    const used = new Set();
    const reviewed = [];
    for (const rank of plan.rankings) {
      const rankKey = String(rank?.key || '');
      const titleKey = hybridRecommendationTitleKey(rank?.title || '');
      const item = byKey.get(rankKey) || byTitle.get(titleKey);
      if (!item) continue;

      const identity = cloudRecommendationCandidateKey(item, candidates.indexOf(item));
      if (used.has(identity)) continue;
      used.add(identity);

      const verdict = String(rank?.verdict || 'maybe').toLowerCase();
      const cloudFit = Math.max(0, Math.min(100, Number(rank?.fit || 0)));
      const requestFit = Math.max(0, Math.min(100, Number(rank?.requestFit || 0)));
      const tasteFit = Math.max(0, Math.min(100, Number(rank?.tasteFit || 0)));
      const localMatch = Math.max(0, Math.min(100, Number(item.match || 0)));

      // v5: the visible score is the cloud-reviewed final fit. The old 55% local /
      // 45% cloud blend let an inflated local 95% score overpower the reviewer,
      // which is why nearly every card still looked like a 90%+ JoeAI match.
      const hybridMatch = Math.round(cloudFit);
      const shortSignals = (Array.isArray(rank?.signals) ? rank.signals : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .slice(0, 5);
      const reason = String(rank?.reason || '').trim();
      const caution = String(rank?.caution || '').trim();
      const warnings = [...new Set([
        ...(item.warnings || []),
        ...(caution && !/^(none|n\/a|no caution)$/i.test(caution) ? [caution] : [])
      ])].slice(0, 4);
      const tags = [...new Set([
        ...shortSignals,
        ...(item.tags || [])
      ])].slice(0, 7);
      const receipt = item.confidenceReceipt || {};
      const oldPrediction = Number(receipt.predictionConfidence || tasteFit || cloudFit || localMatch || hybridMatch);

      reviewed.push({
        item: {
          ...item,
          match: hybridMatch,
          tags,
          warnings,
          joeAISummary: reason || item.joeAISummary || item.blurb,
          confidenceReceipt: {
            ...receipt,
            tasteMatch: hybridMatch,
            predictionConfidence: Math.round((oldPrediction * 0.6) + (cloudFit * 0.4))
          },
          cloudTasteReview: {
            fit: cloudFit,
            requestFit,
            tasteFit,
            verdict,
            reason,
            caution
          },
          hybridReviewed: true
        },
        verdict,
        cloudFit
      });
    }

    // Any candidate the model omitted is kept at the tail as a local-only maybe,
    // rather than silently disappearing because of a malformed structured reply.
    candidates.forEach((item, index) => {
      const identity = cloudRecommendationCandidateKey(item, index);
      if (used.has(identity)) return;
      reviewed.push({
        item: { ...item, hybridReviewed: false },
        verdict: 'maybe',
        cloudFit: Number(item.match || 0)
      });
    });

    const accepted = reviewed
      .filter((entry) => entry.verdict !== 'reject')
      .sort((left, right) => {
        const verdictWeight = { strong: 4, good: 3, maybe: 2 };
        const verdictDelta = (verdictWeight[right.verdict] || 0) - (verdictWeight[left.verdict] || 0);
        if (verdictDelta) return verdictDelta;
        if (right.cloudFit !== left.cloudFit) return right.cloudFit - left.cloudFit;
        return Number(right.item.match || 0) - Number(left.item.match || 0);
      })
      .slice(0, 5)
      .map((entry) => entry.item);

    if (!accepted.length) return null;

    const reviewedCount = reviewed.length;
    const filteredCount = Math.max(0, reviewedCount - accepted.length);
    const reviewLine = `JoeAI reviewed ${reviewedCount} candidate${reviewedCount === 1 ? '' : 's'} and kept ${accepted.length}${filteredCount ? `; ${filteredCount} weaker or duplicate fit${filteredCount === 1 ? ' was' : 's were'} held back` : ''}.`;

    console.log('[JoeAI] hybrid recommendation result:', {
      reviewed: reviewedCount,
      accepted: accepted.length,
      filtered: filteredCount,
      titles: accepted.map((item) => item.officialTitle || item.title)
    });

    return {
      ...localResult,
      // Hybrid-reviewed recommendations use the richer recommendation-card renderer
      // even when the old fallback router originally returned the legacy type.
      type: 'recommendationCards',
      title: localResult.title || '🍜 JoeAI Recommendations',
      subtitle: reviewLine,
      items: accepted,
      hybridReviewed: true,
      hybridFilteredCount: filteredCount,
      hybridReviewedCount: reviewedCount
    };
  }

  async function tryJoeAIHybridRecommendation(prompt, localResult, activeState = joeAIState) {
    // Empty structured recommendation shells are still useful: source-anchored
    // constraints can filter the local Genome neighbors to zero, then the hybrid
    // pool should widen into the unseen catalog instead of falling back to a title card.
    if (!isJoeAICloudEnabled() || !Array.isArray(localResult?.items)) return null;

    const candidates = mergeHybridCandidatePool(localResult, prompt, activeState);
    if (!candidates.length) return null;

    setCloudThinking(true);
    try {
      const cloudAnswer = await askJoeAICloud({
        prompt,
        mode: 'recommendation-rerank',
        context: buildHybridRecommendationCloudContext(prompt, localResult, candidates, activeState)
      });
      if (Array.isArray(cloudAnswer.data?.rankings)) {
        console.log('[JoeAI] second-pass recommendation review:', cloudAnswer.data.rankings.map((entry) => ({
          title: entry.title,
          fit: entry.fit,
          verdict: entry.verdict
        })));
      }
      return applyHybridRecommendationPlan(localResult, candidates, cloudAnswer.data);
    } catch (error) {
      console.warn('[JoeAI] second-pass recommendation review unavailable; using local ranking:', error);
      return null;
    } finally {
      setCloudThinking(false);
    }
  }

  function buildJoeAICloudContext(prompt = '', localEvidence = null) {
    const reflectionPrompt = isJoeAILibraryReflectionQuestion(prompt);
    const comparisonPrompt = isJoeAIComparisonQuestion(prompt);
    const contextMode = reflectionPrompt
      ? 'libraryReflection'
      : (comparisonPrompt ? 'titleComparison' : 'conversation');

    const limits = reflectionPrompt
      ? { topRated: 6, favorites: 5, rewatches: 5, genres: 6, studios: 5, recentRecommendations: 0 }
      : comparisonPrompt
        ? { topRated: 6, favorites: 6, rewatches: 6, genres: 6, studios: 4, recentRecommendations: 2 }
        : { topRated: 8, favorites: 6, rewatches: 6, genres: 8, studios: 6, recentRecommendations: 4 };

    const scored = [...anime]
      .filter((item) => Number(item.joeScore ?? score(item) ?? 0) > 0)
      .sort((a, b) => Number(b.joeScore ?? score(b) ?? 0) - Number(a.joeScore ?? score(a) ?? 0));

    const favorites = anime
      .filter((item) => item.favorite)
      .slice(0, limits.favorites)
      .map((item) => cloudCompactAnime(item, { source: 'library' }));
    const rewatches = anime
      .filter((item) => Number(item.rewatches || 0) > 0)
      .sort((a, b) => Number(b.rewatches || 0) - Number(a.rewatches || 0))
      .slice(0, limits.rewatches)
      .map((item) => cloudCompactAnime(item, { source: 'library' }));

    const topGenres = countBy(anime.flatMap((item) => Array.isArray(item.genres) ? item.genres : []))
      .slice(0, limits.genres)
      .map(([name, count]) => ({ name, count }));
    const topStudios = countBy(anime.map((item) => item.studio).filter(Boolean))
      .slice(0, limits.studios)
      .map(([name, count]) => ({ name, count }));

    const titleMatches = findCloudTitleMatches(prompt).map(({ item, source }) =>
      comparisonPrompt && source === 'library'
        ? cloudComparisonRecord(item)
        : cloudCompactAnime(item, { rich: true, source })
    );

    // Put the two resolved comparison records in a dedicated, prominent field.
    // These records are authoritative library receipts: ownership, saved score,
    // rewatches, favorite status, and watch status must win over model guesses.
    const comparisonTargets = comparisonPrompt
      ? compactCloudValue(
          Array.isArray(localEvidence?.comparedTitles) && localEvidence.comparedTitles.length
            ? localEvidence.comparedTitles.slice(0, 2)
            : titleMatches.slice(0, 2)
        )
      : undefined;

    // Exact titleMatches carry the rich facts. The comparison index only needs
    // names for shorthand resolution, which saves a large amount of prompt data.
    const libraryIndex = comparisonPrompt
      ? anime
          .slice(0, 220)
          .map((item) => item.officialTitle || item.title || '')
          .filter(Boolean)
      : undefined;

    const recentRecommendations = limits.recentRecommendations > 0
      ? compactCloudValue(
          Array.isArray(conversationContext?.lastRecommendations)
            ? conversationContext.lastRecommendations.slice(0, limits.recentRecommendations)
            : []
        )
      : undefined;

    return {
      contextMode,
      libraryCount: anime.length,
      topRated: scored.slice(0, limits.topRated).map((item) => cloudCompactAnime(item, { source: 'library' })),
      favorites,
      rewatches,
      topGenres,
      topStudios,
      titleMatches,
      comparisonTargets,
      libraryIndex,
      localEvidence: compactCloudValue(localEvidence),
      conversation: {
        lastReferencedTitle: conversationContext?.lastReferencedTitle || '',
        lastPrompt: conversationContext?.lastPrompt || '',
        lastRecommendations: recentRecommendations
      }
    };
  }

  function cloudComparisonEvidence(result = {}) {
    return {
      kind: 'comparisonSignals',
      metrics: Array.isArray(result.metrics) ? result.metrics : [],
      contributors: Array.isArray(result.contributors) ? result.contributors.slice(0, 6) : [],
      companions: Array.isArray(result.companions) ? result.companions.slice(0, 8) : [],
      note: 'These are broad library signals only. Do not treat the comparison phrase itself as a genre, theme, or pattern, and do not claim every library title matches the comparison.'
    };
  }

  async function tryJoeAICloud(prompt, localEvidence = null, presentation = null) {
    if (!isJoeAICloudEnabled()) return false;

    setCloudThinking(true);
    try {
      const cloudAnswer = await askJoeAICloud({
        prompt,
        context: buildJoeAICloudContext(prompt, localEvidence)
      });

      if (presentation?.type === 'dnaComparison') {
        appendBotResult({
          type: 'cloudDNAComparison',
          text: cloudAnswer.text,
          cloudAI: true,
          evidence: presentation.evidence || null,
          title: presentation.title || presentation.evidence?.title || ''
        }, prompt);
      } else {
        appendBotResult({
          type: 'text',
          text: cloudAnswer.text,
          cloudAI: true
        }, prompt);
      }
      return true;
    } catch (error) {
      // JoeAnimeDB remains offline-first. Cloud failure is a silent enhancement
      // failure: log it for us, then continue through the existing local answer.
      console.warn('[JoeAI] cloud conversation unavailable; using local fallback:', error);
      return false;
    } finally {
      setCloudThinking(false);
    }
  }

  async function ask(promptOverride = '') {
    const q = String(promptOverride || text).trim();
    if (!q) return;

    setLog((current) => [...current, { who: 'user', type: 'text', text: q }]);
    setConversationContext((current) => ({ ...current, lastPrompt: q }));
    setText('');

    try {
      // Known commands stay local; conversational AI is added below as an
      // invisible enhancement with the existing JoeAI router as fallback.

    const resolved = resolveJoeAIFollowUp(q, conversationContext);
    const routedText = resolved.text || q;
    let activeJoeAIState = joeAIState;
    if (resolved.implicitFeedback) {
      activeJoeAIState = await saveFeedbackByTitle(resolved.implicitFeedback) || joeAIState;
    }

    // Hidden personality layer. Easter eggs are intentionally side-effect free:
    // they either add a one-line preface before normal routing, or answer a
    // narrow joke/unsupported query outright. In particular, unsupported
    // character-attribute searches stop here instead of falling through to the
    // taste recommender and returning a confident but unrelated anime card.
    const easterEgg = getJoeAIEasterEgg(q);
    if (easterEgg) {
      console.log('[JoeAI] easter egg:', easterEgg.id);
      setLog((current) => [...current, {
        who: 'bot',
        type: 'text',
        text: easterEgg.text,
        joeAIEasterEgg: true
      }]);
      if (easterEgg.mode === 'reply') return;
    }

    // Reflective questions must be intercepted before the legacy intent parser.
    // Otherwise phrases like "my biggest blind spot" or "unusual about my library"
    // can be misclassified as anime-title questions.
    if (isJoeAILibraryReflectionQuestion(routedText)) {
      if (await tryJoeAICloud(routedText, {
        kind: 'libraryReflection',
        localStats: {
          libraryCount: anime.length,
          completed: joeAIStats.completed,
          rewatches: joeAIStats.rewatches,
          favorites: joeAIStats.favorites.length,
          episodes: joeAIStats.episodes,
          topGenres: joeAIStats.genreRows.slice(0, 6)
        }
      })) return;
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

    // Catch title-to-title comparisons before the older intent router can
    // flatten them into a generic question or synthetic taste pattern. This keeps
    // natural wording like "why do I prefer One Piece to Naruto?" on the same
    // hybrid path as "Bleach more than JJK".
    if (isJoeAIComparisonQuestion(routedText)) {
      const comparisonEvidence = buildPredictiveComparisonEvidence(routedText, activeJoeAIState);
      if (comparisonEvidence) {
        // Keep comparison receipts and cloud commentary in ONE rendered card.
        // The evidence object is fully local/deterministic; Workers AI only writes
        // the qualitative "JoeAI's Read" section. If cloud fails, the same local
        // receipt card still renders by itself.
        if (await tryJoeAICloud(
          routedText,
          {
            kind: 'titleComparison',
            comparisonMode: comparisonEvidence.comparisonMode || 'saved',
            comparedTitles: comparisonEvidence.comparedTitles,
            decision: comparisonEvidence.decision || null,
            metrics: comparisonEvidence.metrics,
            summary: comparisonEvidence.summary,
            rule: 'Respect each target source exactly. Library targets contain saved receipts; catalog targets contain Anime DNA predictions. A predicted fit is not a saved rating. The local decision is authoritative when present. Do not invent ownership, ratings, rewatches, or favorites. Add concise qualitative interpretation only.'
          },
          {
            type: 'dnaComparison',
            evidence: comparisonEvidence,
            title: comparisonEvidence.title
          }
        )) return;

        appendBotResult(comparisonEvidence, routedText);
        return;
      }

      appendBotResult({
        type: 'text',
        text: 'I can compare those once I can resolve both titles from your library, catalog, or local Genome registry. Try the exact anime names so I do not guess which entries you mean.'
      }, routedText);
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

      // The local engine supplies the facts/reasons; cloud AI is only the mouth.
      if (await tryJoeAICloud(routedText, { kind: intent.kind, result })) return;
      appendBotResult(result, routedText);
      return;
    }

    if ((intent.kind === 'tastePattern' || intent.kind === 'genreDNA') && !isJoeAIRecommendationRequest(routedText)) {
      const result = await executeJoeAICommand({
        intent,
        anime,
        catalog,
        updateAnime,
        brain,
        joeAIState: activeJoeAIState
      });

      const isComparisonQuestion = isJoeAIComparisonQuestion(routedText);

      // Comparisons such as "why do I like Bleach more than JJK?" use both layers:
      // local JoeAI supplies the visual evidence card while Workers AI supplies the
      // natural-language comparison. The synthetic comparison phrase is deliberately
      // removed from cloud evidence so it cannot be mistaken for a real taste genre.
      if (
        isComparisonQuestion &&
        await tryJoeAICloud(
          routedText,
          // Keep the exact comparison payload shape that already proved reliable
          // in the plain conversational route. The local result is used as model
          // evidence while the presentation object below controls the visual card.
          // Those two concerns must stay separate so a prettier card cannot change
          // whether the cloud request succeeds.
          { kind: intent.kind, result, comparisonMode: true },
          {
            type: 'dnaComparison',
            evidence: result,
            title: result?.title || ''
          }
        )
      ) return;

      // Keep dedicated single-pattern Genome/DNA cards local. Broad taste questions
      // get a conversational rendering backed by the deterministic local analysis.
      if (intent.kind === 'tastePattern' && await tryJoeAICloud(routedText, { kind: intent.kind, result })) return;
      appendBotResult(result, routedText);
      return;
    }

    if (intent.kind === 'recommendation' || isJoeAIRecommendationRequest(routedText)) {
      let result = coordinateJoeAIRecommendation({
        text: routedText,
        anime: recommendationAnime,
        catalog,
        brain,
        joeAIState: activeJoeAIState
      });

      // Some natural recommendation phrasings historically fell through the intent
      // parser (for example "what should I watch next?"). If the coordinator does
      // not produce cards, recover them from the mature local recommendation router
      // and still send that real candidate set through the cloud taste reviewer.
      if (!Array.isArray(result?.items) || !result.items.length) {
        result = routeJoeAIRecommendation(routedText, recommendationAnime, catalog) || result;
      }

      if (Array.isArray(result?.items)) {
        // Local JoeAI generates the candidates and remains the source of truth for
        // metadata, safety filters, hard recommendation logic, and saved learning.
        // Even an empty structured shell is routed through the hybrid pool so a
        // hard constraint like "Slime without isekai" can widen into fresh catalog
        // candidates instead of collapsing back into the Slime title card.
        const hybridResult = await tryJoeAIHybridRecommendation(routedText, result, activeJoeAIState);
        appendBotResult(hybridResult || result, routedText);
        return;
      }
    }

    // Build local evidence first, but let the cloud layer phrase normal
    // conversation. If cloud is unavailable, the exact same local routing below
    // remains the fallback, so JoeAI still works offline.
    const directTitleAnswer = routeJoeAITitleQuestion(routedText, anime, catalog);
    const routedQuestion = await executeJoeAICommand({
      intent: { kind: 'question', text: routedText },
      anime,
      catalog,
      updateAnime,
      brain,
      joeAIState: activeJoeAIState
    });
    const routedQuestionIsUseful = Boolean(
      routedQuestion && (
        routedQuestion.type !== 'text' ||
        !String(routedQuestion.text || '').startsWith('Try asking about your Anime DNA')
      )
    );
    const smartAnswer = routedQuestionIsUseful
      ? null
      : routeJoeAIRecommendation(routedText, recommendationAnime, catalog);
    const localEvidence = directTitleAnswer || (routedQuestionIsUseful ? routedQuestion : null) || smartAnswer || null;

    // Last-chance recommendation safety net: if any older route still produces
    // recommendation cards here, do not bypass the second-pass cloud taste review.
    if (Array.isArray(smartAnswer?.items) && smartAnswer.items.length) {
      const hybridSmartAnswer = await tryJoeAIHybridRecommendation(routedText, smartAnswer, activeJoeAIState);
      if (hybridSmartAnswer) {
        appendBotResult(hybridSmartAnswer, routedText);
        return;
      }
    }

    if (await tryJoeAICloud(routedText, localEvidence)) return;

    if (directTitleAnswer) {
      appendBotResult(directTitleAnswer, routedText);
      return;
    }

    if (routedQuestionIsUseful) {
      appendBotResult(routedQuestion, routedText);
      return;
    }

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
        <span
          className="joeaiLegacyPosterOpen"
          role="button"
          tabIndex={0}
          onClick={() => openRecommendationDetails(item)}
          onKeyDown={(event) => openRecommendationDetailsFromKeyboard(event, item)}
          aria-label={`Open details for ${item.officialTitle || item.title}`}
          title={`Open ${item.officialTitle || item.title} details`}
          style={{ cursor: 'pointer' }}
        >
          <Poster anime={item} className="joeaiRecPoster" mode="thumb" />
        </span>
        <div className="joeaiRecBody">
          <div className="joeaiRecTopline">
            <span className="joeaiRecRank">#{index + 1}</span>
            <span className="joeaiMatchBadge">{item.match}%</span>
            <span className="joeaiMatchLabel">{item.matchLabel || 'Match'}</span>
          </div>

          <h3
            className="joeaiTitleOpen"
            role="button"
            tabIndex={0}
            onClick={() => openRecommendationDetails(item)}
            onKeyDown={(event) => openRecommendationDetailsFromKeyboard(event, item)}
            title={`Open ${item.officialTitle || item.title} details`}
            style={{ cursor: 'pointer' }}
          >
            {item.officialTitle || item.title}
          </h3>

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
    const explicit = String(message.sourceAnime || message.sourceTitle || '').trim();
    if (explicit) return explicit;

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
    const resultCount = message.items?.length || 0;
    const heading = message.title || (sourceTitle
      ? `${resultCount} matches for ${sourceTitle}`
      : `${resultCount} JoeAI recommendations`);
    const subtitle = message.subtitle || 'JoeAI matched the request against the catalog metadata currently available.';

    return (
      <div key={index} className="chat bot joeaiRecommendations">
        <div className="joeaiRecHeader joeaiSmartRecHeader">
          <p className="joeaiRecEyebrow">{message.hybridReviewed ? '🧠 JoeAI two-pass taste review' : '🧬 Genome recommendation run'}</p>
          <h2>{heading}</h2>
          <p>{subtitle}</p>
        </div>

        {message.hybridReviewed && Array.isArray(message.items) && message.items.length > 0 ? (
          <section className="joeaiBulkSection joeaiHybridPicks">
            <h3>JoeAI's reviewed picks</h3>
            <div className="joeaiRecGrid">
              {message.items.map((item, itemIndex) => renderCompactRecommendationCard(item, itemIndex, sourceTitle))}
            </div>
          </section>
        ) : (
          <>
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
          </>
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
        <div
          className="joeaiPosterWrap joeaiDetailTrigger"
          role="button"
          tabIndex={0}
          onClick={() => openRecommendationDetails(item)}
          onKeyDown={(event) => openRecommendationDetailsFromKeyboard(event, item)}
          aria-label={`Open details for ${name}`}
          title={`Open ${name} details`}
          style={{ cursor: 'pointer' }}
        >
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

          <h3
            className="joeaiTitleOpen"
            role="button"
            tabIndex={0}
            onClick={() => openRecommendationDetails(item)}
            onKeyDown={(event) => openRecommendationDetailsFromKeyboard(event, item)}
            title={`Open ${name} details`}
            style={{ cursor: 'pointer' }}
          >
            {name}
          </h3>

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

  const tasteReadiness = useMemo(() => getTasteReadiness(anime), [anime]);

  const {
    recommendation: joeAIPick,
    isPending: joeAIPickPending
  } = useDeferredDailyRecommendation(
    recommendationContext,
    dailyPickSeed,
    joeAIState
  );

  const joeAIThought = useMemo(() => {
    if (!tasteReadiness.hasTasteData) {
      return {
        eyebrow: 'JoeAI is ready to learn',
        headline: 'Your Anime DNA starts with your first few titles.',
        body: 'Import a list or add, rate, favorite, and rewatch anime. JoeAI will only claim a taste pattern after your library provides evidence.'
      };
    }

    const topGenre = joeAIStats.genreRows[0]?.[0] || 'Your current taste';
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
  }, [joeAIStats, tasteReadiness]);

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

  function renderJoeAIInlineMarkdown(value = '', keyPrefix = 'inline') {
    return String(value)
      .split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g)
      .filter((part) => part !== '')
      .map((part, index) => {
        const strong = part.match(/^\*\*(.+)\*\*$/s);
        if (strong) return <strong key={`${keyPrefix}-strong-${index}`}>{strong[1]}</strong>;
        const emphasis = part.match(/^\*(.+)\*$/s);
        return emphasis
          ? <em key={`${keyPrefix}-em-${index}`}>{emphasis[1]}</em>
          : <React.Fragment key={`${keyPrefix}-text-${index}`}>{part}</React.Fragment>;
      });
  }

  function renderJoeAICloudText(value = '') {
    const lines = String(value || '').replace(/\r\n/g, '\n').split('\n');
    const nodes = [];
    let bullets = [];

    const flushBullets = () => {
      if (!bullets.length) return;
      const groupIndex = nodes.length;
      nodes.push(
        <ul key={`cloud-list-${groupIndex}`}>
          {bullets.map((bullet, index) => (
            <li key={`cloud-list-${groupIndex}-${index}`}>
              {renderJoeAIInlineMarkdown(bullet, `cloud-list-${groupIndex}-${index}`)}
            </li>
          ))}
        </ul>
      );
      bullets = [];
    };

    lines.forEach((line, lineIndex) => {
      const bullet = line.match(/^\s*(?:[-*•])\s+(.+)$/);
      if (bullet) {
        bullets.push(bullet[1]);
        return;
      }

      flushBullets();
      const clean = line.trim();
      if (!clean) return;

      const heading = clean.match(/^#{1,3}\s+(.+)$/);
      if (heading) {
        nodes.push(
          <strong key={`cloud-heading-${lineIndex}`} className="joeaiCloudHeading">
            {renderJoeAIInlineMarkdown(heading[1], `cloud-heading-${lineIndex}`)}
          </strong>
        );
        return;
      }

      nodes.push(
        <p key={`cloud-line-${lineIndex}`}>
          {renderJoeAIInlineMarkdown(clean, `cloud-line-${lineIndex}`)}
        </p>
      );
    });

    flushBullets();
    return <div className="joeaiCloudRichText">{nodes}</div>;
  }

  function renderMessage(message, index) {
    if (message.type === 'cloudDNAComparison') {
      const evidence = message.evidence || {};
      const strength = Number(evidence.strength);
      const hasStrength = Number.isFinite(strength);
      const metrics = Array.isArray(evidence.metrics) ? evidence.metrics : [];
      const contributors = Array.isArray(evidence.contributors) ? evidence.contributors : [];
      const companions = Array.isArray(evidence.companions) ? evidence.companions : [];

      return (
        <div key={index} className="chat bot joeaiGenreDNAExplanation joeaiCloudDNAComparison">
          <header className="joeaiGenreDNAHeader">
            <p>🧬 Personal Anime DNA Comparison</p>
            <h2>{message.title || evidence.title || 'Why these shows land differently for you'}</h2>
            <span>JoeAI combined your local Anime DNA signals with a conversational comparison.</span>
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
              <h3>{evidence.contributorsHeading || 'Your strongest supporting signals'}</h3>
              <div className="joeaiGenreDNAContributors">
                {contributors.map((item) => (
                  <article key={item.id || item.title}>
                    <strong>{item.title}</strong>
                    <span>
                      {item.comparisonSummary || [
                        item.score ? `★ ${item.score}` : '',
                        item.rewatches ? `${item.rewatches} rewatch${item.rewatches === 1 ? '' : 'es'}` : '',
                        item.episodes ? `${item.episodes} episodes` : '',
                        item.favorite ? 'Favorite' : ''
                      ].filter(Boolean).join(' · ') || item.status || 'Comparison evidence'}
                    </span>
                  </article>
                ))}
              </div>
            </section>
          )}

          {companions.length > 0 && (
            <section className="joeaiGenreDNASection">
              <h3>Taste patterns involved</h3>
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

          <section className="joeaiCloudComparisonInsight">
            <div className="joeaiCloudComparisonInsightHeader">
              <span aria-hidden="true">🍜</span>
              <div>
                <small>JOEAI'S READ</small>
                <strong>What the evidence means</strong>
              </div>
            </div>
            {renderJoeAICloudText(message.text)}
          </section>
        </div>
      );
    }

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
      <div key={index} className={'chat ' + message.who + (message.cloudAI ? ' joeaiCloudAnswer' : '')}>
        {message.cloudAI ? renderJoeAICloudText(message.text) : message.text}
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
            <h2>{tasteReadiness.hasPersonalizedTaste ? 'JoeAI Pick of the Day' : 'Starter Pick of the Day'}</h2>
          </header>

          {joeAIPick ? (
            <div className="joeAIPickInner">
              <Poster anime={joeAIPick.item} className="joeAIPickPoster" mode="thumb" />
              <div>
                <div className="joeAIPickHeading">
                  <h3>{joeAIPick.item.officialTitle || joeAIPick.item.title}</h3>
                  <strong>{tasteReadiness.hasPersonalizedTaste ? `${joeAIPick.confidence}% Match` : 'Catalog Pick'}</strong>
                </div>

                <div className="joeAIPickTags">
                  {(joeAIPick.item.genres || []).slice(0, 4).map((genre) => (
                    <span key={genre}>{genre}</span>
                  ))}
                </div>

                <p>
                  {tasteReadiness.hasPersonalizedTaste
                    ? 'This overlaps with the strongest genres and patterns already visible in your library.'
                    : 'This is a well-supported catalog starting point. Add and rate titles to make future picks personal.'}
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
          ) : joeAIPickPending ? (
            <p className="joeAIEmptyCard">Preparing your daily pick...</p>
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
            {!joeAIStats.genreRows.length && (
              <p className="joeAIEmptyCard">
                No taste pattern yet. Import a list or add a few titles to begin building your Anime DNA.
              </p>
            )}
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
          {log.length > 10 && <p className="joeAIHistoryNotice">Earlier messages are hidden to keep JoeAI responsive.</p>}
          {log.slice(-10).map((message, index) => renderMessage(message, index))}
          {cloudThinking && (
            <div className="chat bot joeaiCloudThinking" role="status" aria-live="polite">
              <span aria-hidden="true">🍜</span> JoeAI is thinking…
            </div>
          )}
        </div>

        <div className="assistant-input joeaiChatInput joeAIComposer">
          <textarea
            placeholder={'Ask JoeAI anything...\nTry: recommend something dark under 24 episodes'}
            value={text}
            rows={2}
            disabled={cloudThinking}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (!cloudThinking) ask();
              }
            }}
          />
          <button onClick={() => ask()} disabled={cloudThinking}>{cloudThinking ? 'Thinking…' : 'Ask JoeAI'}</button>
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
  const [streamingApps, setStreamingApps] = React.useState(() => getSavedStreamingApps());
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

  useEffect(() => {
    const syncStreamingApps = (event) => {
      setStreamingApps(
        Array.isArray(event?.detail) ? event.detail : getSavedStreamingApps()
      );
    };

    window.addEventListener('joeanime:streaming-apps-changed', syncStreamingApps);
    return () => window.removeEventListener('joeanime:streaming-apps-changed', syncStreamingApps);
  }, []);

  function toggleStreamingApp(appId) {
    const selected = new Set(streamingApps);

    if (selected.has(appId)) selected.delete(appId);
    else selected.add(appId);

    const next = saveStreamingApps(
      STREAMING_APP_OPTIONS
        .map((option) => option.id)
        .filter((id) => selected.has(id))
    );

    setStreamingApps(next);
  }

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
      if (summary?.failed?.length || summary?.needsReview?.length || summary?.added?.length || summary?.updated?.length || summary?.skipped?.length) {
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
    const needsReview = [];

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
          let merged = {
            ...existingBeforeLookup,
            ...importedPersonalData(row),
            id: existingBeforeLookup.id,
            title: existingBeforeLookup.title,
            officialTitle: existingBeforeLookup.officialTitle || existingBeforeLookup.title
          };

          let identityReview = null;
          if (!String(existingBeforeLookup.kitsuId || existingBeforeLookup.kitsu_id || '').trim()) {
            const linkage = await resolveSafeKitsuIdentity(merged);
            merged = applySafeKitsuIdentity(merged, linkage, 'mal-import-safe-resolution');
            if (linkage.identityDecision.needsReview) {
              identityReview = {
                ...row,
                title: row.requestedTitle || row.title,
                importedRecordId: existingBeforeLookup.id,
                reason: linkage.identityDecision.reason,
                candidates: linkage.results || []
              };
            }
          }

          const saved = await updateAnime(merged);
          liveLibrary = saved?.anime || liveLibrary.map((item) =>
            String(item.id) === String(merged.id) ? merged : item
          );
          updated.push(merged.officialTitle || merged.title);
          if (identityReview) needsReview.push(identityReview);
          continue;
        }

        const result = await importAnimeByTitle({
          title: row.requestedTitle || row.title,
          normalizedTitle: row.title,
          status: row.status || 'Completed',
          library: liveLibrary,
          requireSafeIdentity: true
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

          needsReview.push({
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

        if (result.identityDecision?.needsReview) {
          failed.push({
            ...row,
            title: row.requestedTitle || row.title,
            importedRecordId: next.id,
            reason: result.identityDecision.reason,
            candidates: result.results || []
          });
        }
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
      addedIds.has(String(item.id)) &&
      !item.identityNeedsReview &&
      needsWikidataRepair(item)
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
      needsReview,
      autoRepaired,
      autoUnresolved
    });
    setLibraryImportStatus(
      `Import finished — ${added.length} added, ${updated.length} updated, ${autoRepaired.length} metadata repairs, ${needsReview.length} need review, ${skipped.length} skipped, ${failed.length} failed.`
    );
  }

  async function importReviewedLibraryCandidate(failedItem, candidate) {
    if (!candidate || !updateAnime) return;

    setLibraryImportStatus(`Adding reviewed match: ${candidate.officialTitle || candidate.title}...`);

    try {
      const currentLibrary = data?.anime || [];

      if (failedItem.importedRecordId) {
        const importedRecord = currentLibrary.find(
          (item) => String(item.id) === String(failedItem.importedRecordId)
        );

        if (!importedRecord) {
          throw new Error('The imported library record could not be found.');
        }
        if (!candidate.kitsuId) {
          throw new Error('The reviewed candidate does not have a Kitsu identity.');
        }

        const linked = {
          ...importedRecord,
          kitsuId: candidate.kitsuId,
          identityNeedsReview: false,
          metadataNeedsReview: Boolean(importedRecord.metadataNeedsRefresh),
          metadataReviewReason: '',
          identityResolutionStatus: 'user-reviewed',
          identityLinkageSource: 'mal-import-user-review',
          identityLinkageUpdatedAt: new Date().toISOString()
        };

        await updateAnime(linked);

        const nextSummary = {
          ...libraryImportSummary,
          needsReview: (libraryImportSummary?.needsReview || []).filter((item) =>
            String(item.importedRecordId || '') !== String(failedItem.importedRecordId)
          ),
          failed: (libraryImportSummary?.failed || []).filter((item) =>
            String(item.importedRecordId || '') !== String(failedItem.importedRecordId)
          )
        };
        saveLibraryImportSummary(nextSummary);
        setLibraryImportStatus(`Linked ${importedRecord.title} to the reviewed Kitsu title.`);
        return;
      }

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
        needsReview: (libraryImportSummary?.needsReview || []).filter((item) => item.title !== failedItem.title),
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
    const reviewItems = [
      ...(libraryImportSummary?.needsReview || []),
      ...(libraryImportSummary?.failed || [])
    ];
    if (!reviewItems.length) return;

    const text = reviewItems.map((item) => item.title).join('\\n');

    try {
      await navigator.clipboard.writeText(text);
      setLibraryImportStatus(`Copied ${reviewItems.length} review title${reviewItems.length === 1 ? '' : 's'} to the clipboard.`);
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

    const targets = (data?.anime || []).filter(
      (item) => !item.identityNeedsReview && needsWikidataRepair(item)
    );

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
        const linkage = summary.kitsuLinkage || {};
        setGenomeUpdateStatus(
          `Update complete — ${summary.skipped} skipped, ${summary.refreshed} refreshed; ` +
          `Kitsu links: ${linkage.repaired || 0} repaired, ${linkage.needsReview || 0} need review, ` +
          `${linkage.unresolved || 0} unresolved; Genomes: ${genomeText}.`
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
  const importReviewItems = [
    ...(libraryImportSummary?.needsReview || []),
    ...(libraryImportSummary?.failed || [])
  ];
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
              {lastUpdateSummary.kitsuLinkage?.repaired || 0} Kitsu links repaired ·{' '}
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

      <section className="settingsStreamingAppsCard">
        <header>
          <div>
            <p className="settingsWorkshopEyebrow">Quick Watch</p>
            <h2>My Streaming Apps</h2>
            <p>
              Pick the services you use. Where to Watch will put matching services first
              so you can get from Details to playback with fewer clicks.
            </p>
          </div>
          <strong>
            {streamingApps.length
              ? `${streamingApps.length} selected`
              : 'None selected'}
          </strong>
        </header>

        <div className="settingsStreamingAppsGrid" role="group" aria-label="My streaming apps">
          {STREAMING_APP_OPTIONS.map((option) => {
            const selected = streamingApps.includes(option.id);

            return (
              <button
                key={option.id}
                type="button"
                className={`settingsStreamingAppOption ${selected ? 'active' : ''}`}
                aria-pressed={selected}
                onClick={() => toggleStreamingApp(option.id)}
              >
                <span>
                  <b>{option.label}</b>
                  <small>{option.description}</small>
                </span>
                <em>{selected ? 'Quick Watch' : 'Add'}</em>
              </button>
            );
          })}
        </div>

        <p className="settingsStreamingAppsNote">
          These selections are included in full backups and Cloud Sync. Provider availability still depends on your streaming region.
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
                <span><strong>{lastUpdateSummary.kitsuLinkage?.repaired || 0}</strong> Kitsu links repaired</span>
                <span><strong>{lastUpdateSummary.kitsuLinkage?.needsReview || 0}</strong> need review</span>
                <span><strong>{lastUpdateSummary.kitsuLinkage?.unresolved || 0}</strong> unresolved</span>
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
            <strong>{libraryImportSummary.needsReview?.length || 0}</strong>
            <span>Needs Review</span>
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

          {importReviewItems.length ? (
            <section id="library-import-needs-review" className="settingsImportReview">
              <header>
                <div>
                  <p>Manual Match Required</p>
                  <h3>Needs Review</h3>
                </div>
                <div className="settingsImportReviewHeaderActions">
                  <button type="button" onClick={copyFailedLibraryTitles}>
                    Copy Review Titles
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
                {importReviewItems.map((item) => (
                  <article key={`${item.importedRecordId || 'unresolved'}-${item.title}`}>
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
