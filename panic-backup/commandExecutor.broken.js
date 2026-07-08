import { importAnimeByTitle, mergeAnimeMetadata } from '../services/animeImporter';
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


function normalizeTitleForLookup(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleKeys(item = {}) {
  return [
    item.title,
    item.officialTitle,
    item.englishTitle,
    item.romajiTitle,
    item.nativeTitle,
    ...(Array.isArray(item.synonyms) ? item.synonyms : []),
    ...(Array.isArray(item.titles) ? item.titles : [])
  ]
    .map(normalizeTitleForLookup)
    .filter(Boolean);
}

function findExistingAnimeByTitle(library = [], title = '') {
  const wanted = normalizeTitleForLookup(title);
  if (!wanted) return null;

  return library.find((item) => titleKeys(item).includes(wanted)) || null;
}

export async function executeSingleAddCommand({ anime = [], updateAnime, command }) {
  if (!updateAnime || !command?.title) {
    return makeTextResult('I could not update your library because the save path is not ready.');
  }

  const requestedStatus = command.status || 'Watching';
  const existing = findExistingAnimeByTitle(anime, command.title);

  if (existing) {
    const updated = {
      ...existing,
      status: requestedStatus,
      updatedAt: new Date().toISOString()
    };

    await updateAnime(updated);

    return makeTextResult(
      `Updated existing entry: ${updated.officialTitle || updated.title} → ${updated.status}. Metadata already exists, so I skipped Jikan.`
    );
  }

  const result = await importAnimeByTitle({
    title: command.title,
    status: requestedStatus,
    library: anime
  });

  if (result.duplicate) {
    const merged = mergeAnimeMetadata(
      result.duplicate,
      result.candidate,
      requestedStatus || result.duplicate.status
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
      const existing = findExistingAnimeByTitle(liveLibrary, title);

      if (existing) {
        skipped.push(`${title} is already in your library as ${existing.officialTitle || existing.title}`);
        continue;
      }

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
