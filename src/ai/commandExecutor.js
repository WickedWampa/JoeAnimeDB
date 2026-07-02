import { importAnimeByTitle, mergeAnimeMetadata } from '../services/animeImporter';

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

export async function executeSingleAddCommand({ anime = [], updateAnime, command }) {
  if (!updateAnime || !command?.title) {
    return makeTextResult('I could not update your library because the save path is not ready.');
  }

  const result = await importAnimeByTitle({
    title: command.title,
    status: command.status || 'Watching',
    library: anime
  });

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
  return {
    type: 'helpCard',
    title: '🍜 JoeAI Command Center',
    subtitle: 'Tell me what you want in plain English. I can manage your library, analyze your Anime DNA, and recommend your next watch.',
    sections: [
      {
        icon: '🎯',
        title: 'Recommendations',
        items: [
          'what should I watch next?',
          'recommend something dark',
          'give me a random pick'
        ]
      },
      {
        icon: '📚',
        title: 'Manage Library',
        items: [
          'add Frieren as completed',
          'I finished World Trigger',
          'add as completed Bleach, Naruto, One Piece'
        ]
      },
      {
        icon: '📊',
        title: 'Analyze Collection',
        items: [
          'explain my Anime DNA',
          'what are my top genres?',
          'what studio do I watch most?'
        ]
      },
      {
        icon: '🤖',
        title: 'Natural Language',
        items: [
          'I am watching Magi',
          'what am I watching?',
          'library status'
        ]
      }
    ],
    footer: 'I use the same importer as the Library, so I fetch metadata, skip duplicates, and update existing entries.'
  };
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
      return makeTextResult(brain?.answer?.(intent.text || '') || 'Ask me what I can do.');
  }
}
