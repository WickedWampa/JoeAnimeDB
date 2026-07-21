import { executeJoeAICommand } from '../commandExecutor';
import { routeJoeAIRecommendation } from '../joeAIRecommendationRouter';
import { routeJoeAIConversation } from '../conversation/conversationEngine';

function makeText(text) {
  return { type: 'text', text };
}

function isGenericFallback(result) {
  const text = String(result?.text || '');
  return result?.type === 'text' && (
    text.startsWith('Try asking about your Anime DNA') ||
    text.includes('Ask me what I can do')
  );
}

function helpCard() {
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
          'what are you least certain about?',
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
          'recommend a hidden gem',
          'compare Slime and Overlord',
          'predict my next favorite anime'
        ]
      }
    ],
    footer: 'Click a prompt, then hit Ask — or just type naturally. Router V2 sends each prompt to one handler.'
  };
}

function isSimilarityPrompt(question = '') {
  return /\b(similar\s+to|something\s+like|show\s+like|shows\s+like|anime\s+like|recommend\s+something\s+like|recommend\s+.+?\s+like)\b/i.test(question);
}

function isMoodRecommendationPrompt(question = '') {
  return /\b(darker?|gritty|violent|brutal|gory|horror|scary|creepy|funny|comedy|hilarious|laugh|emotional|sad|tearjerker|heartbreaking|cry|cozy|comfort|comforting|wholesome|chill|relaxing|strategy|strategic|politics|political|mind games|psychological|genius|manipulation|sports|competition|training|underdog|rivalry|hidden gems?|underrated|under rated|movie|film|short binge|under 24|12 episodes)\b/i.test(question);
}

function shouldUseCardRecommendationRouter(question = '') {
  return isSimilarityPrompt(question) || isMoodRecommendationPrompt(question);
}

async function routeQuestion({ question, anime, catalog, updateAnime, brain }) {
  // 1. Conversation/memory/reasoning has priority for normal questions.
  const conversation = routeJoeAIConversation({ text: question, anime, catalog });
  if (conversation) return conversation;

  // 2. Existing command executor gets library intelligence and simple stats Q&A.
  const routedQuestion = await executeJoeAICommand({
    intent: { kind: 'question', text: question },
    anime,
    catalog,
    updateAnime,
    brain
  });

  // 3. If command executor had a real answer, keep it.
  if (routedQuestion && !isGenericFallback(routedQuestion)) return routedQuestion;

  // 4. Direct title lookups live here, AFTER reasoning/memory.
  const knowledge = routeJoeAIRecommendation(question, anime, catalog);
  if (knowledge) return knowledge;

  return routedQuestion || makeText('Ask me what I can do.');
}

export async function routeJoeAI({ question = '', intent, anime = [], catalog = [], updateAnime, brain }) {
  const q = String(question || '').trim();
  const kind = intent?.kind || 'question';

  switch (kind) {
    case 'empty':
      return null;

    case 'help':
      return helpCard();

    case 'stats':
    case 'watchingList':
    case 'generateGenome':
      return executeJoeAICommand({ intent, anime, catalog, updateAnime, brain });

    case 'bulkAdd': {
      const action = { titles: intent.titles || [], status: intent.status || 'Watching', kind: 'bulkAdd' };
      return {
        pendingAction: action,
        message: {
          who: 'bot',
          type: 'confirmAction',
          title: '🍜 Ready to bulk import',
          text: `I found ${action.titles.length} title(s). I will add them as ${action.status}, skip duplicates, and fetch metadata only when needed. Import these?`,
          confirmLabel: 'Import Titles',
          action
        }
      };
    }

    case 'singleAdd': {
      const action = { title: intent.title, status: intent.status || 'Watching', kind: 'singleAdd' };
      return {
        pendingAction: action,
        message: {
          who: 'bot',
          type: 'confirmAction',
          title: '🍜 Ready to update your library',
          text: `I will add or update “${action.title}” as ${action.status}. Metadata will only be fetched if needed. Continue?`,
          confirmLabel: 'Do It',
          action
        }
      };
    }

    case 'memory': {
      const memoryAnswer = routeJoeAIConversation({ text: q, anime, catalog });
      return memoryAnswer || routeQuestion({ question: q, anime, catalog, updateAnime, brain });
    }

    case 'recommendation': {
      // Similarity and mood/theme recommendations are always card-router owned.
      // Generic prompts like "what should I watch next" stay with the normal recommendation engine.
      if (shouldUseCardRecommendationRouter(q)) {
        const cardAnswer = routeJoeAIRecommendation(q, anime, catalog);
        if (cardAnswer) return cardAnswer;
      }

      return executeJoeAICommand({ intent, anime, catalog, updateAnime, brain });
    }

    case 'question':
    default:
      return routeQuestion({ question: q, anime, catalog, updateAnime, brain });
  }
}
