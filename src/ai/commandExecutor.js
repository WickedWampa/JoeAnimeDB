import { findDuplicateAnime, importAnimeByTitle, mergeAnimeMetadata, findLocalTitleMatches, searchAnimeCandidates } from '../services/animeImporter';
import { resolveAnimeTitleCandidates } from '../services/titleResolver';
import { buildQuickAddEntry } from '../services/quickAdd';
import { answerLibraryQuestion } from './libraryIntelligence';
import { maybeSimilarRecommendation } from './similarityEngine';
import { maybeKnowledgeFirstRecommendation } from './knowledgeFirstRecommender';
import { routeJoeAIConversation } from './conversation/conversationEngine';
import { explainGenreDNA } from './genreDNAExplainer';
import { explainTastePattern } from './tastePatternExplainer';
import {
  inferFeedbackTraits,
  normalizeJoeAIKey
} from './intelligence/joeAIIntelligence';

export function makeTextResult(text) {
  return { type: 'text', text };
}

export function makeBulkResult({ added = [], skipped = [], review = [], failed = [] }) {
  return {
    type: 'bulkResult',
    title: '🍜 Bulk import complete',
    added,
    skipped,
    review,
    failed
  };
}

export function makeCandidateSelectionResult({ title, status = 'Watching', candidates = [], source = 'local' }) {
  const hasRemote = candidates.some((item) => item.candidateSource === 'remote');
  const hasLocal = candidates.some((item) => item.candidateSource === 'local' || item.isLocal);

  return {
    type: 'candidateSelection',
    title: hasLocal && hasRemote
      ? '🍜 I found local and remote matches'
      : source === 'remote'
        ? '🍜 I found a few possible anime'
        : '🍜 I found multiple local matches',
    text: hasLocal && hasRemote
      ? `Which “${title}” did you mean? Local titles update instantly; remote titles will be added as ${status}.`
      : source === 'remote'
        ? `Which “${title}” did you mean? I will add the one you pick as ${status}.`
        : `Which “${title}” did you mean? I will update the one you pick as ${status}.`,
    status,
    originalTitle: title,
    source,
    candidates: candidates.slice(0, 12).map((item) => ({
      id: item.id,
      kitsuId: item.kitsuId,
      malId: item.malId,
      title: item.title,
      officialTitle: item.officialTitle,
      year: item.year,
      type: item.type,
      studio: item.studio,
      episodeCount: item.episodeCount,
      episodes: item.episodes,
      cover: item.cover,
      status: item.status,
      genres: item.genres,
      synopsis: item.synopsis,
      trailerUrl: item.trailerUrl,
      japaneseTitle: item.japaneseTitle,
      englishTitle: item.englishTitle,
      romajiTitle: item.romajiTitle,
      titleSynonyms: item.titleSynonyms,
      communityScore: item.communityScore,
      malScore: item.malScore,
      importLabel: item.importLabel,
      importConfidence: item.importConfidence,
      importScore: item.importScore,
      isLocal: Boolean(item.isLocal || item.candidateSource === 'local'),
      candidateSource: item.candidateSource || (item.isLocal ? 'local' : source),
      matchScore: item.matchScore || item.importConfidence,
      matchReason: item.matchReason || item.importLabel || 'Possible match'
    }))
  };
}

function normalizeKey(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function candidateIdentity(item = {}) {
  return String(item.malId || item.id || item.officialTitle || item.title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function mergeCandidateLists(localCandidates = [], remoteCandidates = []) {
  const merged = [];
  const seen = new Set();

  const add = (item, source) => {
    if (!item) return;
    const key = candidateIdentity(item);
    if (!key || seen.has(key)) return;
    seen.add(key);

    const isLocal = source === 'local';
    merged.push({
      ...item,
      isLocal,
      candidateSource: source,
      matchReason: item.matchReason || item.importLabel || (isLocal ? 'In your library' : 'Remote metadata match'),
      matchScore: item.matchScore || item.importConfidence || (isLocal ? 90 : 60)
    });
  };

  localCandidates.forEach((item) => add(item, 'local'));
  remoteCandidates.forEach((item) => add(item, 'remote'));

  return merged.sort((a, b) => {
    const aLocal = a.candidateSource === 'local' ? 1 : 0;
    const bLocal = b.candidateSource === 'local' ? 1 : 0;
    const aExact = /exact/i.test(a.matchReason || a.importLabel || '') ? 1 : 0;
    const bExact = /exact/i.test(b.matchReason || b.importLabel || '') ? 1 : 0;
    const aTv = String(a.type || '').toLowerCase() === 'tv' ? 1 : 0;
    const bTv = String(b.type || '').toLowerCase() === 'tv' ? 1 : 0;

    return (bLocal - aLocal) ||
      (bExact - aExact) ||
      Number(b.matchScore || 0) - Number(a.matchScore || 0) ||
      (bTv - aTv) ||
      String(a.officialTitle || a.title || '').localeCompare(String(b.officialTitle || b.title || ''));
  });
}

async function buildLocalPlusRemoteCandidates(title, localCandidates = []) {
  let remoteCandidates = [];

  try {
    remoteCandidates = await searchAnimeCandidates(title, { limit: 10 });
  } catch (error) {
    console.warn('Remote candidate enrichment failed, using local matches only:', title, error);
  }

  return mergeCandidateLists(localCandidates, remoteCandidates);
}


export async function executeSingleAddCommand({ anime = [], updateAnime, command }) {
  if (!updateAnime || !command?.title) {
    return makeTextResult('I could not update your library because the save path is not ready.');
  }

  if (command.selectedAnime) {
    const selected = command.selectedAnime;
    const existing = findDuplicateAnime(anime, selected);

    if (existing) {
      const merged = mergeAnimeMetadata(existing, { ...existing, status: command.status || existing.status }, command.status || existing.status);
      await updateAnime(merged);
      return makeTextResult(`Updated selected entry: ${existing.title} → ${merged.status}. No duplicate added.`);
    }

    const selectedAnime = command.quickAdd ? buildQuickAddEntry({
      ...selected,
      id: selected.id || `anime-${normalizeKey(selected.officialTitle || selected.title || command.title)}`,
      title: selected.officialTitle || selected.title || command.title,
      officialTitle: selected.officialTitle || selected.title || command.title,
      metadataNeedsRefresh: false
    }, {
      source: 'JoeAI',
      librarySize: anime.length,
      status: command.status || 'Plan to Watch'
    }) : {
      ...selected,
      id: selected.id || `anime-${normalizeKey(selected.officialTitle || selected.title || command.title)}`,
      title: selected.officialTitle || selected.title || command.title,
      officialTitle: selected.officialTitle || selected.title || command.title,
      status: command.status || 'Watching',
      favorite: false,
      rewatches: 0,
      notes: selected.notes || 'Added from JoeAI candidate picker.',
      addedFrom: 'JoeAI candidate picker',
      metadataNeedsRefresh: false,
      finalRank: anime.length + 1
    };

    await updateAnime(selectedAnime);
    return makeTextResult(command.quickAdd
      ? selectedAnime.status === 'Completed'
        ? `Added ${selectedAnime.officialTitle || selectedAnime.title} as Completed and sent it to Needs Review.`
        : `Quick Added ${selectedAnime.officialTitle || selectedAnime.title} to Needs Review.`
      : `Added ${selectedAnime.officialTitle || selectedAnime.title} as ${selectedAnime.status}.`);
  }

  const localMatches = findLocalTitleMatches(anime, command.title);
  const exactMatches = localMatches.exact || [];
  const shorthandMatches = localMatches.shorthand || [];
  const relatedMatches = localMatches.related || [];

  // Exact title is usually safe, but some franchises are ambiguous even when the
  // base title exists locally. Example: "Dragon Ball" can mean Dragon Ball,
  // Dragon Ball Z, Dragon Ball Super, etc. If exact + related local matches exist,
  // ask instead of silently updating the base franchise entry.
  const franchiseCandidates = [...exactMatches, ...shorthandMatches, ...relatedMatches]
    .filter((item, index, list) => {
      const key = item.id || item.malId || normalizeKey(item.officialTitle || item.title || '');
      return key && list.findIndex((other) => (other.id || other.malId || normalizeKey(other.officialTitle || other.title || '')) === key) === index;
    });

  if (exactMatches.length === 1 && franchiseCandidates.length > 1) {
    const candidates = await buildLocalPlusRemoteCandidates(command.title, franchiseCandidates);
    return makeCandidateSelectionResult({
      title: command.title,
      status: command.status || 'Watching',
      candidates,
      source: candidates.some((item) => item.candidateSource === 'remote') ? 'mixed' : 'local'
    });
  }

  if (exactMatches.length === 1) {
    const existing = exactMatches[0];
    const merged = mergeAnimeMetadata(existing, { ...existing, status: command.status || existing.status }, command.status || existing.status);
    await updateAnime(merged);
    return makeTextResult(`Updated existing entry: ${existing.title} → ${merged.status}. No duplicate added.`);
  }

  if (exactMatches.length > 1) {
    const candidates = await buildLocalPlusRemoteCandidates(command.title, exactMatches);
    return makeCandidateSelectionResult({ title: command.title, status: command.status || 'Watching', candidates, source: candidates.some((item) => item.candidateSource === 'remote') ? 'mixed' : 'local' });
  }

  const ambiguousCandidates = [...shorthandMatches, ...relatedMatches];
  if (ambiguousCandidates.length > 0) {
    const candidates = await buildLocalPlusRemoteCandidates(command.title, ambiguousCandidates);
    return makeCandidateSelectionResult({ title: command.title, status: command.status || 'Watching', candidates, source: candidates.some((item) => item.candidateSource === 'remote') ? 'mixed' : 'local' });
  }

  const result = await importAnimeByTitle({
    title: command.title,
    status: command.status || 'Watching',
    library: anime
  });

  const titleResolution = result.titleResolution || resolveAnimeTitleCandidates({
    query: command.title,
    candidates: result.results || []
  });

  if (titleResolution.decision === 'review') {
    return makeCandidateSelectionResult({
      title: command.title,
      status: command.status || 'Watching',
      candidates: titleResolution.candidates,
      source: 'remote'
    });
  }

  if (titleResolution.decision === 'none') {
    return makeTextResult(
      `I could not verify “${command.title}” against the title provider, so I made no library changes. Try again or use Add Anime to review the match manually.`
    );
  }

  if (result.duplicate) {
    const merged = mergeAnimeMetadata(
      result.duplicate,
      result.candidate,
      command.status || result.duplicate.status
    );

    await updateAnime(merged);

    return makeTextResult(
      `Updated existing entry: ${result.duplicate.title} → ${merged.officialTitle || merged.title}. No duplicate added.`
    );
  }

  const nextAnime = {
    ...result.candidate,
    finalRank: anime.length + 1,
    addedFrom: 'JoeAI'
  };

  await updateAnime(nextAnime);

  if (result.metadataLookupFailed || nextAnime.metadataNeedsRefresh) {
    return makeTextResult([
      `Added ${nextAnime.officialTitle || nextAnime.title} as ${nextAnime.status}.`,
      '',
      '🍜 Metadata is unavailable or incomplete right now, so I saved the title locally instead of guessing.',
      'Your library entry is safe. Run Update Database when connected to complete its poster, studio, genres, and other details.'
    ].join('\n'));
  }

  return makeTextResult(
    `Added ${nextAnime.officialTitle || nextAnime.title} as ${nextAnime.status}. Metadata fetched.`
  );
}

export async function executeBulkAddCommand({ anime = [], updateAnime, command, onProgress }) {
  if (!updateAnime || !command?.titles?.length) {
    return makeBulkResult({
      failed: command?.titles?.length ? command.titles : ['No titles found']
    });
  }

  const added = [];
  const skipped = [];
  const review = [];
  const failed = [];
  let liveLibrary = [...anime];

  for (let index = 0; index < command.titles.length; index++) {
    const title = command.titles[index];

    onProgress?.({
      index: index + 1,
      total: command.titles.length,
      title
    });

    try {
      const result = await importAnimeByTitle({
        title,
        status: command.status || 'Watching',
        library: liveLibrary
      });

      const titleResolution = result.titleResolution || resolveAnimeTitleCandidates({
        query: title,
        candidates: result.results || []
      });

      if (result.duplicate && (result.localOnly || result.manualOverride)) {
        skipped.push(`${title} is already in your library as ${result.duplicate.title}`);
        continue;
      }

      if (titleResolution.decision !== 'exact') {
        const suggestions = titleResolution.candidates
          .slice(0, 3)
          .map((item) => item.officialTitle || item.title)
          .filter(Boolean)
          .join(', ');
        review.push(`${title}${suggestions ? `: ${suggestions}` : ': no verified exact match'}`);
        continue;
      }

      if (result.duplicate) {
        skipped.push(`${title} is already in your library as ${result.duplicate.title}`);
        continue;
      }

      const nextAnime = {
        ...result.candidate,
        finalRank: liveLibrary.length + 1,
        addedFrom: 'JoeAI bulk import'
      };

      const saved = await updateAnime(nextAnime);
      liveLibrary = saved.anime || [...liveLibrary, nextAnime];
      added.push(nextAnime.title);
    } catch (error) {
      console.warn('JoeAI bulk add failed:', title, error);
      failed.push(`${title}${error?.message ? `: ${error.message}` : ''}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  return makeBulkResult({ added, skipped, review, failed });
}

export function answerLibraryStats({ anime = [], catalog = [] }) {
  const completed = anime.filter((item) => String(item.status).toLowerCase() === 'completed').length;
  const watching = anime.filter((item) => String(item.status).toLowerCase() === 'watching').length;
  const favorites = anime.filter((item) => item.favorite).length;

  return makeTextResult([
    '🍜 Library status:',
    '',
    `• ${anime.length} titles total`,
    `• ${completed} completed`,
    `• ${watching} currently watching`,
    `• ${favorites} favorites`,
    `• ${catalog.length} catalog titles for recommendations`
  ].join('\n'));
}

export function answerWatchingList({ anime = [] }) {
  const watching = anime
    .filter((item) => String(item.status).toLowerCase() === 'watching')
    .slice(0, 12);

  if (!watching.length) {
    return makeTextResult('Nothing is marked Watching right now. Say “I am watching Magi” and I will add/update it.');
  }

  return makeTextResult([
    'You are currently watching:',
    '',
    ...watching.map((item) => `• ${item.title}${item.episodeCount ? ` (${item.episodeCount} eps)` : ''}`)
  ].join('\n'));
}

export function answerHelp() {
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


function localCountBy(items) {
  const map = {};
  items.forEach((item) => {
    if (item) map[item] = (map[item] || 0) + 1;
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function topList(items, label) {
  if (!items.length) return `I do not have enough ${label} data yet.`;
  return items.map(([name, count], index) => `${index + 1}. ${name} — ${count}`).join('\n');
}

function answerConversationalQuestion({ text = '', anime = [], catalog = [], brain, joeAIState = {} }) {
  const lower = String(text).toLowerCase();

  // Dashboard and chat DNA explanations must be handled before any
  // recommendation fallback. Examples: "explain Action", "explain Fantasy".
  const dnaExplainMatch = String(text || '').trim().match(
    /^(?:please\s+)?explain(?:\s+why)?\s+(action|adventure|fantasy|isekai|romance|comedy|drama|horror|mecha|sports|mystery|sci[- ]?fi|supernatural|shounen|seinen)\b/i
  );

  if (dnaExplainMatch) {
    const requested = dnaExplainMatch[1];
    const normalizedRequested = requested.toLowerCase().replace(/[-\s]+/g, '');

    const matching = anime.filter((item) =>
      (item.genres || []).some((genre) =>
        String(genre || '').toLowerCase().replace(/[-\s]+/g, '') === normalizedRequested
      )
    );

    const rated = matching
      .map((item) => ({
        item,
        score: Number(item.joeScore ?? item.score ?? item.finalScore ?? item.rating ?? 0)
      }))
      .filter(({ score }) => Number.isFinite(score) && score > 0);

    const average = rated.length
      ? (rated.reduce((sum, entry) => sum + entry.score, 0) / rated.length).toFixed(2)
      : null;

    const topTitles = [...matching]
      .sort((a, b) =>
        Number(b.rewatches || 0) - Number(a.rewatches || 0) ||
        Number(b.joeScore ?? b.score ?? b.finalScore ?? b.rating ?? 0) -
        Number(a.joeScore ?? a.score ?? a.finalScore ?? a.rating ?? 0)
      )
      .slice(0, 5);

    const companionGenres = localCountBy(
      matching.flatMap((item) =>
        (item.genres || []).filter((genre) =>
          String(genre || '').toLowerCase().replace(/[-\s]+/g, '') !== normalizedRequested
        )
      )
    ).slice(0, 4);

    const rewatches = matching.reduce((sum, item) => sum + Number(item.rewatches || 0), 0);
    const favorites = matching.filter((item) => item.favorite).length;
    const label = requested
      .replace(/sci[- ]?fi/i, 'Sci-Fi')
      .replace(/^./, (char) => char.toUpperCase());

    if (!matching.length) {
      return makeTextResult([
        `🧬 Why ${label} is not leading your Anime DNA yet`,
        '',
        `I could not find any ${label} titles in your current library metadata.`,
        '',
        'Run metadata refresh on titles missing genres, then ask again.'
      ].join('\n'));
    }

    return makeTextResult([
      `🧬 Why ${label} leads your Anime DNA`,
      '',
      `${label} appears in ${matching.length} title${matching.length === 1 ? '' : 's'} in your library${average ? ` with an average personal score of ${average}` : ''}.`,
      rewatches ? `You also have ${rewatches} total rewatch${rewatches === 1 ? '' : 'es'} reinforcing this signal.` : '',
      favorites ? `${favorites} of those titles ${favorites === 1 ? 'is' : 'are'} marked as a favorite.` : '',
      '',
      topTitles.length ? 'Strongest evidence:' : '',
      ...topTitles.map((item) => {
        const score = Number(item.joeScore ?? item.score ?? item.finalScore ?? item.rating ?? 0);
        const extras = [
          Number.isFinite(score) && score > 0 ? `★ ${score.toFixed(1)}` : '',
          Number(item.rewatches || 0) > 0 ? `↻ ${item.rewatches}x` : '',
          item.favorite ? 'favorite' : ''
        ].filter(Boolean).join(' · ');
        return `• ${item.officialTitle || item.title}${extras ? ` — ${extras}` : ''}`;
      }),
      '',
      companionGenres.length ? `What usually makes ${label} work for you:` : '',
      ...companionGenres.map(([genre, count]) => `• ${genre} overlaps in ${count} title${count === 1 ? '' : 's'}`),
      '',
      `JoeAI's read: ${label} is not winning by itself. It becomes one of your strongest signals when it is paired with ${companionGenres.slice(0, 3).map(([genre]) => genre.toLowerCase()).join(', ') || 'the character and story patterns you repeatedly return to'}.`
    ].filter(Boolean).join('\n'));
  }

  const conversationAnswer = routeJoeAIConversation({ text, anime, catalog, joeAIState });
  if (conversationAnswer) {
    return conversationAnswer;
  }

  const knowledgeFirstAnswer = maybeKnowledgeFirstRecommendation(text, anime, catalog);
  if (knowledgeFirstAnswer) {
    return makeTextResult(knowledgeFirstAnswer);
  }

  const similarAnswer = maybeSimilarRecommendation(text, anime, catalog);
  if (similarAnswer) {
    return makeTextResult(similarAnswer);
  }

  // SPRINT4_SIMILARITY_FIRST_V3
const intelligenceAnswer = answerLibraryQuestion(text, anime, catalog);
  if (intelligenceAnswer) {
    return makeTextResult(intelligenceAnswer);
  }

  if (lower.includes('top genre')) {
    return makeTextResult('Your top genres are:\n\n' + topList(localCountBy(anime.flatMap((item) => item.genres || [])).slice(0, 8), 'genre'));
  }

  if (lower.includes('top studio') || lower.includes('studio do i watch')) {
    return makeTextResult('Your top studios are:\n\n' + topList(localCountBy(anime.map((item) => item.studio)).slice(0, 8), 'studio'));
  }

  if (lower.includes('random pick')) {
    if (!anime.length) return makeTextResult('Your library is empty, so I cannot pick from it yet.');
    const pick = anime[Math.floor(Math.random() * anime.length)];
    return makeTextResult(`Random pick: ${pick.title}${pick.finalRank ? `, rank #${pick.finalRank}` : ''}.`);
  }

  if (lower.includes('unrated') || lower.includes('not rated')) {
    const unrated = anime.filter((item) => item.joeScore === undefined || item.joeScore === null || item.joeScore === '').slice(0, 12);
    if (!unrated.length) return makeTextResult('Everything in your current library looks rated.');
    return makeTextResult('Unrated anime:\n\n' + unrated.map((item) => `• ${item.title}`).join('\n'));
  }

  return makeTextResult(brain?.answer?.(text || '') || 'Ask me what I can do.');
}

export async function executeJoeAICommand({
  intent,
  anime = [],
  catalog = [],
  updateAnime,
  brain,
  joeAIState = {},
  recordRecommendationFeedback,
  setJoeAIPreference,
  onProgress
}) {
  switch (intent.kind) {
    case 'help':
      return answerHelp();

    case 'stats':
      return answerLibraryStats({ anime, catalog });

    case 'watchingList':
      return answerWatchingList({ anime });

    case 'genreDNA':
      return explainGenreDNA({ genre: intent.genre, anime });

    case 'tastePattern':
      return explainTastePattern({ pattern: intent.pattern, anime });

    case 'teaching': {
      const teaching = intent.teaching || {};

      if (teaching.kind === 'preference' && teaching.preference) {
        await setJoeAIPreference?.(teaching.preference);
        return makeTextResult(`🧠 ${teaching.response || 'Preference remembered.'}`);
      }

      if (teaching.kind === 'titleFeedback' && teaching.title) {
        const matched = [...anime, ...catalog].find((item) => {
          const titles = [item.title, item.officialTitle, ...(item.titleSynonyms || [])];
          return titles.some((title) => normalizeJoeAIKey(title) === normalizeJoeAIKey(teaching.title));
        });
        await recordRecommendationFeedback?.({
          animeKey: matched
            ? (matched.malId ? `mal:${matched.malId}` : `title:${normalizeJoeAIKey(matched.title)}`)
            : `title:${normalizeJoeAIKey(teaching.title)}`,
          title: matched?.officialTitle || matched?.title || teaching.title,
          action: teaching.action,
          reason: teaching.reason || '',
          traits: inferFeedbackTraits(matched || { title: teaching.title }, teaching.reason),
          sourcePrompt: intent.text || '',
          algorithmVersion: 'joeai-intelligence-v1'
        });
        return makeTextResult(`🧠 ${teaching.response || 'JoeAI learned from that.'}`);
      }

      return makeTextResult('I heard the correction, but I could not turn it into a saved preference yet.');
    }

    case 'singleAdd':
      return executeSingleAddCommand({
        anime,
        updateAnime,
        command: intent
      });

    case 'bulkAdd':
      return executeBulkAddCommand({
        anime,
        updateAnime,
        command: intent,
        onProgress
      });



    case 'generateGenome': {
      const title = intent.title;

      if (typeof window !== 'undefined' && window.JoeAnimeDB?.generateGenome) {
        const result = await window.JoeAnimeDB.generateGenome(title);

        if (result?.ok) {
          return makeTextResult([
            `🧬 Genome generated for "${title}".`,
            '',
            'Metadata fetched.',
            'Generated card saved.',
            'Genome registry rebuilt.',
            '',
            'Try:',
            `recommend ${title}`,
            '',
            'Note: generated cards are marked quality: generated and needsReview: true.'
          ].join('\n'));
        }

        return makeTextResult([
          `I tried to generate a Genome for "${title}", but something failed.`,
          '',
          result?.error || 'Unknown error.',
          result?.stderr || ''
        ].filter(Boolean).join('\n'));
      }

      return makeTextResult([
        `🧬 Ready to generate a Genome for "${title}".`,
        '',
        'Run these from your project root:',
        '',
        `node scripts\\generateGenomeCardForTitle.cjs "${title}"`,
        'node scripts\\rebuildGenomeRegistry.cjs'
      ].join('\n'));
    }

    case 'recommendationExplanation': {
      const title = String(intent.title || '').trim();
      const explanationPrompt = title
        ? `why did you recommend ${title}?`
        : String(intent.text || 'why did you recommend this?');

      return answerConversationalQuestion({
        text: explanationPrompt,
        anime,
        catalog,
        brain,
        joeAIState
      });
    }

    case 'recommendation': {
      const picks = brain?.recommendations?.(5, {
        prompt: intent.text || '',
        joeAIState
      }) || [];

      return picks.length
        ? {
            type: 'recommendations',
            title: '🍜 JoeAI Recommendations',
            subtitle: 'Based on your Anime DNA, these unseen catalog picks look strongest.',
            items: picks
          }
        : makeTextResult(brain?.answer?.('recommend something') || 'I need more catalog metadata before I can recommend well.');
    }

    case 'question':
    default:
      return answerConversationalQuestion({ text: intent.text || '', anime, catalog, brain, joeAIState });
  }
}
