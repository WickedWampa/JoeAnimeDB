import { importAnimeByTitle, mergeAnimeMetadata, findLocalTitleMatches } from '../services/animeImporter';
import { answerLibraryQuestion } from './libraryIntelligence';
import { maybeSimilarRecommendation } from './similarityEngine';
import { maybeKnowledgeFirstRecommendation } from './knowledgeFirstRecommender';

export function makeTextResult(text) {
  return { type: 'text', text };
}

export function makeBulkResult({ added = [], skipped = [], failed = [] }) {
  return {
    type: 'bulkResult',
    title: '🍜 Bulk import complete',
    added,
    skipped,
    failed
  };
}

export function makeCandidateSelectionResult({ title, status = 'Watching', candidates = [], source = 'local' }) {
  return {
    type: 'candidateSelection',
    title: source === 'remote'
      ? '🍜 I found a few possible anime'
      : '🍜 I found multiple local matches',
    text: source === 'remote'
      ? `Which “${title}” did you mean? I will add the one you pick as ${status}.`
      : `Which “${title}” did you mean? I will update the one you pick as ${status}.`,
    status,
    originalTitle: title,
    source,
    candidates: candidates.slice(0, 8).map((item) => ({
      id: item.id,
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
      titleSynonyms: item.titleSynonyms,
      communityScore: item.communityScore,
      malScore: item.malScore,
      importLabel: item.importLabel,
      importConfidence: item.importConfidence,
      importScore: item.importScore,
      matchScore: item.matchScore || item.importConfidence,
      matchReason: item.matchReason || item.importLabel || 'Possible match'
    }))
  };
}

function normalizeKey(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function candidateKeys(candidate = {}) {
  return [
    candidate.title,
    candidate.officialTitle,
    candidate.japaneseTitle,
    ...(candidate.titleSynonyms || [])
  ].filter(Boolean).map(normalizeKey).filter(Boolean);
}

function shouldAskRemoteCandidateSelection(query, results = []) {
  if (!results || results.length < 2) return false;

  const queryKey = normalizeKey(query);
  const top = results[0];
  const topKeys = candidateKeys(top);
  const topIsExact = topKeys.includes(queryKey) || top.importLabel === 'Exact Match';

  // If Jikan found one obvious exact match, let the import proceed normally.
  if (topIsExact && Number(top.importConfidence || 0) >= 96) return false;

  // Otherwise, if there are several plausible matches, ask the user instead of guessing.
  const plausible = results.filter((item) => {
    const confidence = Number(item.importConfidence || item.matchScore || 0);
    return confidence >= 60 || ['Exact Match', 'Best Match', 'Sequel', 'Spinoff', 'Related'].includes(item.importLabel);
  });

  return plausible.length > 1;
}


export async function executeSingleAddCommand({ anime = [], updateAnime, command }) {
  if (!updateAnime || !command?.title) {
    return makeTextResult('I could not update your library because the save path is not ready.');
  }

  if (command.selectedAnime) {
    const selected = command.selectedAnime;
    const existing = anime.find((item) =>
      (selected.id && item.id === selected.id) ||
      (selected.malId && item.malId && String(item.malId) === String(selected.malId)) ||
      String(item.title || '').toLowerCase() === String(selected.title || '').toLowerCase()
    );

    if (existing) {
      const merged = mergeAnimeMetadata(existing, { ...existing, status: command.status || existing.status }, command.status || existing.status);
      await updateAnime(merged);
      return makeTextResult(`Updated selected entry: ${existing.title} → ${merged.status}. No duplicate added.`);
    }

    const selectedAnime = {
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
    return makeTextResult(`Added ${selectedAnime.officialTitle || selectedAnime.title} as ${selectedAnime.status}.`);
  }

  const localMatches = findLocalTitleMatches(anime, command.title);
  const exactMatches = localMatches.exact || [];
  const shorthandMatches = localMatches.shorthand || [];
  const relatedMatches = localMatches.related || [];

  if (exactMatches.length === 1) {
    const existing = exactMatches[0];
    const merged = mergeAnimeMetadata(existing, { ...existing, status: command.status || existing.status }, command.status || existing.status);
    await updateAnime(merged);
    return makeTextResult(`Updated existing entry: ${existing.title} → ${merged.status}. No duplicate added.`);
  }

  if (exactMatches.length > 1) {
    return makeCandidateSelectionResult({ title: command.title, status: command.status || 'Watching', candidates: exactMatches });
  }

  // Safe shorthand: one-word request like "Frieren" can update one obvious local match.
  // Multi-word requests like "Trigun Stampede" should not silently update "Trigun".
  const requestedWords = String(command.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter(Boolean);
  if (requestedWords.length === 1 && shorthandMatches.length === 1 && !relatedMatches.length) {
    const existing = shorthandMatches[0];
    const merged = mergeAnimeMetadata(existing, { ...existing, status: command.status || existing.status }, command.status || existing.status);
    await updateAnime(merged);
    return makeTextResult(`Updated existing entry: ${existing.title} → ${merged.status}. No duplicate added.`);
  }

  const ambiguousCandidates = [...shorthandMatches, ...relatedMatches];
  if (ambiguousCandidates.length > 1) {
    return makeCandidateSelectionResult({ title: command.title, status: command.status || 'Watching', candidates: ambiguousCandidates });
  }

  const result = await importAnimeByTitle({
    title: command.title,
    status: command.status || 'Watching',
    library: anime
  });

  if (!result.duplicate && shouldAskRemoteCandidateSelection(command.title, result.results || [])) {
    return makeCandidateSelectionResult({
      title: command.title,
      status: command.status || 'Watching',
      candidates: result.results,
      source: 'remote'
    });
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

  return makeBulkResult({ added, skipped, failed });
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
  return makeTextResult([
    '🍜 Hey — I’m JoeAI.',
    '',
    'Think of me as your anime nerd that never forgets your library.',
    '',
    'I can recommend shows by vibe, explain why people love an anime, organize your collection, analyze your taste, and help you figure out what to watch next.',
    '',
    '🔥 Try asking me:',
    '',
    '• I want something like Dorohedoro',
    '• Recommend an anime like Initial D',
    '• Recommend something like Bleach',
    '• Why is Frieren so highly rated?',
    '• What should I binge this weekend?',
    '• Analyze my library',
    '',
    '✅ Available Today',
    '',
    '🎭 Knowledge-First Recommendations',
    '• I want to watch something like Dorohedoro',
    '• recommend something like Bleach',
    '• I want something like Initial D',
    '',
    '🧠 Critic / Knowledge Mode',
    '• explain why people love Dorohedoro',
    '• what makes Bleach special?',
    '• why should I watch Made in Abyss?',
    '',
    '📚 Library Management',
    '• add Frieren as completed',
    '• I finished World Trigger',
    '• I am watching Magi',
    '• add as completed Bleach, Naruto, One Piece',
    '',
    '📊 Collection Analysis',
    '• how much anime have I watched?',
    '• what are my top genres?',
    '• what studio do I watch most?',
    '• show me unrated anime',
    '',
    '🧪 Current JoeAI Brain',
    '✓ Library Intelligence',
    '✓ Anime DNA',
    '✓ Critic Mode',
    '✓ Personality Engine',
    '✓ Knowledge Engine',
    '✓ Knowledge-First Recommendations',
    '✓ Franchise Detection',
    '✓ Automatic Knowledge Enrichment',
    '',
    '🧬 Coming Soon: Project Anime Genome',
    '• recommendations by domain, subdomain, mood, atmosphere, themes, and emotional tone',
    '• better separation between street racing, soccer, boxing, volleyball, and other domains',
    '• Core 100 expert knowledge profiles',
    '• personal taste learning',
    '',
    'Translation: I’m getting smarter every sprint. Ask naturally. I’ll figure it out.'
  ].join('\n'));
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

function answerConversationalQuestion({ text = '', anime = [], catalog = [], brain }) {
  const lower = String(text).toLowerCase();

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

export async function executeJoeAICommand({ intent, anime = [], catalog = [], updateAnime, brain, onProgress }) {
  switch (intent.kind) {
    case 'help':
      return answerHelp();

    case 'stats':
      return answerLibraryStats({ anime, catalog });

    case 'watchingList':
      return answerWatchingList({ anime });

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

    case 'recommendation': {
      const picks = brain?.recommendations?.(5) || [];

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
      return answerConversationalQuestion({ text: intent.text || '', anime, catalog, brain });
  }
}
