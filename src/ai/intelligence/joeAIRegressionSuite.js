import { parseJoeAIIntent } from '../intentParser';
import { recommendAnime } from '../../engine/recommendationEngine';
import {
  applyLearnedSignals,
  buildConfidenceReceipt,
  parseJoeAITeaching,
  resolveJoeAIFollowUp
} from './joeAIIntelligence';
import { enrichRecommendationItems } from '../recommendationCoordinator';
import { routeJoeAIRecommendation } from '../joeAIRecommendationRouter';
import { buildDiscoverPlan } from '../../services/recommendationEngineV3';

function assert(condition, message) {
  if (!condition) throw new Error(`JoeAI regression: ${message}`);
}

export function runJoeAIRegressionSuite() {
  const contextRecommendations = [
    { title: 'Claymore' },
    { title: 'One Piece Fan Letter' },
    { title: 'Frieren' }
  ];
  const context = {
    lastRecommendations: contextRecommendations,
    lastReferencedTitle: 'Claymore'
  };

  const explanation = parseJoeAIIntent('tell me why you recommend One Piece Fan Letter');
  assert(explanation.kind === 'recommendationExplanation', 'recommendation explanation routing failed');
  assert(explanation.title === 'One Piece Fan Letter', 'recommendation explanation lost its title');

  const second = resolveJoeAIFollowUp('why the second one?', context);
  assert(second.text.includes('One Piece Fan Letter'), 'ordinal follow-up context failed');

  const shorter = resolveJoeAIFollowUp('something shorter', context);
  assert(shorter.text.includes('Claymore'), 'modifier follow-up context failed');

  const studio = parseJoeAITeaching("I don't care about studio");
  assert(studio?.preference?.key === 'studio_weight', 'studio teaching failed');

  const likedFor = parseJoeAITeaching('I liked One Piece for the crew');
  assert(likedFor?.kind === 'titleFeedback', 'title feedback teaching failed');

  const dislikedBecause = parseJoeAITeaching("I didn't like Claymore because it was too dark");
  assert(dislikedBecause?.title === 'Claymore' && dislikedBecause?.reason.includes('too dark'), 'negative title feedback lost its reason');

  const distinction = parseJoeAITeaching('Dragon Ball and Dragon Ball Z are different');
  assert(distinction?.preference?.key?.startsWith('title_distinction:'), 'title distinction teaching failed');

  const dragonBall = parseJoeAIIntent('what is Dragon Ball?');
  assert(dragonBall.kind === 'question', 'known-title question was misrouted as a generic recommendation');

  const similar = parseJoeAIIntent('anime like Overlord');
  assert(similar.kind === 'recommendation', 'direct similarity request bypassed the coordinator');

  const learned = applyLearnedSignals(
    { title: 'Claymore', genres: ['Action', 'Dark Fantasy'] },
    { feedback: [{ animeKey: 'title:claymore', title: 'Claymore', action: 'not_for_me' }] }
  );
  assert(learned.excluded === true, 'rejected recommendation was not excluded');

  const confidence = buildConfidenceReceipt(
    { title: 'Frieren', genres: ['Fantasy'], synopsis: 'A journey', year: 2023 },
    { tasteMatch: 91, evidenceCount: 4, genomeTier: 'Gold', state: {} }
  );
  assert(confidence.dataConfidence > 0 && confidence.predictionConfidence > 0, 'confidence receipt failed');

  const learnedRecommendations = recommendAnime(
    [{ title: 'One Piece', joeScore: 10, favorite: true, rewatches: 2, genres: ['Action', 'Adventure', 'Fantasy'] }],
    [
      { title: 'Claymore', genres: ['Action', 'Dark Fantasy'], communityScore: 8, synopsis: 'Dark survival fantasy', year: 2007 },
      { title: 'Frieren', genres: ['Adventure', 'Drama', 'Fantasy'], communityScore: 9, synopsis: 'An emotional fantasy journey', year: 2023 }
    ],
    {
      limit: 5,
      joeAIState: {
        feedback: [{ animeKey: 'title:claymore', title: 'Claymore', action: 'not_for_me' }],
        preferences: []
      },
      prompt: 'what should I watch next?'
    }
  );
  assert(!learnedRecommendations.some((item) => item.title === 'Claymore'), 'feedback did not change recommendation results');
  assert(learnedRecommendations[0]?.confidenceReceipt?.predictionConfidence > 0, 'recommendation lost confidence receipts');

  const catalogBackedSimilarity = routeJoeAIRecommendation(
    'recommend something like Bleach',
    [{ title: 'Bleach', status: 'Completed', joeScore: 9.5 }],
    [{
      id: 'kitsu:1776',
      kitsuId: '1776',
      malId: 392,
      title: 'Yu Yu Hakusho',
      cover: 'https://media.kitsu.example/yu-yu-hakusho.jpg',
      year: 1992,
      episodes: 112,
      synopsis: 'A teenage spirit detective investigates supernatural cases.',
      studio: 'Studio Pierrot'
    }]
  );
  const catalogBackedCard = catalogBackedSimilarity?.items?.find((item) => item.title === 'Yu Yu Hakusho');
  assert(catalogBackedCard?.cover, 'Genome discovery lost its Kitsu poster');
  assert(catalogBackedCard?.kitsuId === '1776', 'Genome discovery lost its Kitsu ID');
  assert(catalogBackedCard?.year === 1992 && catalogBackedCard?.episodes === 112, 'Genome discovery lost catalog details');
  assert(catalogBackedCard?.owned === false && catalogBackedCard?.bucket === 'discovery', 'catalog title was marked as owned');

  const timestampSafe = applyLearnedSignals(
    { title: 'Frieren', genres: ['Fantasy'] },
    {
      feedback: [
        {
          animeKey: 'title:frieren',
          title: 'Frieren',
          action: 'not_for_me',
          createdAt: '2026-01-01T00:00:00.000Z'
        },
        {
          animeKey: 'title:frieren',
          title: 'Frieren',
          action: 'good_pick',
          createdAt: '2026-02-01T00:00:00.000Z'
        }
      ]
    }
  );
  assert(timestampSafe.excluded === false && timestampSafe.adjustment > 0, 'newest feedback did not win by timestamp');

  const confidenceCandidate = {
    title: 'Frieren',
    genres: ['Fantasy'],
    synopsis: 'An emotional fantasy journey',
    year: 2023
  };
  const noFeedbackConfidence = buildConfidenceReceipt(
    confidenceCandidate,
    { tasteMatch: 85, evidenceCount: 3, genomeTier: 'Core', state: {} }
  );
  const unrelatedConfidence = buildConfidenceReceipt(
    confidenceCandidate,
    {
      tasteMatch: 85,
      evidenceCount: 3,
      genomeTier: 'Core',
      state: {
        feedback: Array.from({ length: 20 }, (_, index) => ({
          animeKey: `title:romance-${index}`,
          title: `Romance ${index}`,
          action: 'good_pick',
          traits: ['romance']
        }))
      }
    }
  );
  assert(
    unrelatedConfidence.predictionConfidence === noFeedbackConfidence.predictionConfidence,
    'unrelated feedback inflated prediction confidence'
  );

  const reranked = enrichRecommendationItems(
    {
      type: 'recommendations',
      items: [
        { title: 'Candidate A', match: 82, genres: ['Fantasy'] },
        { title: 'Candidate B', match: 76, genres: ['Adventure'] }
      ]
    },
    {
      feedback: [{
        animeKey: 'title:candidateb',
        title: 'Candidate B',
        action: 'good_pick',
        createdAt: '2026-02-01T00:00:00.000Z'
      }]
    }
  );
  assert(reranked.items[0]?.title === 'Candidate B', 'learned Genome scores were not re-ranked');

  const discoverCandidates = Array.from({ length: 48 }, (_, index) => ({
    id: `discover-${index}`,
    title: `Series${index} Journey`,
    genres: index % 3 === 0
      ? ['Fantasy', 'Adventure']
      : index % 3 === 1
        ? ['Psychological', 'Mystery']
        : ['Drama', 'Romance'],
    studio: index % 2 === 0 ? 'Studio A' : 'Studio B',
    synopsis: `A complete recommendation candidate number ${index}.`,
    cover: `https://example.com/${index}.jpg`,
    year: 2020 + (index % 6),
    episodes: index % 5 === 0 ? 1 : 12 + (index % 13),
    type: index % 5 === 0 ? 'Movie' : 'TV',
    communityScore: 7.2 + (index % 16) / 10,
    members: index % 4 === 0 ? 50000 : 200000,
    discoverBucket: index % 7 === 0 ? 'current' : index % 11 === 0 ? 'upcoming' : ''
  }));
  const discoverPlan = buildDiscoverPlan({
    library: [{
      id: 'library-anchor',
      title: 'Fantasy Anchor',
      genres: ['Fantasy', 'Adventure'],
      studio: 'Studio A',
      joeScore: 9.5,
      favorite: true,
      rewatches: 2,
      status: 'Completed'
    }],
    candidates: discoverCandidates,
    daySeed: 20260728,
    joeAIState: {}
  });
  const discoverShelves = [
    discoverPlan.airingNow,
    discoverPlan.comingSoon,
    discoverPlan.bestMatches,
    discoverPlan.highestRated,
    discoverPlan.becauseYouLoved,
    discoverPlan.studioSpotlight,
    discoverPlan.hiddenGems,
    discoverPlan.mindBenders,
    discoverPlan.emotionalDamage,
    discoverPlan.movieNight
  ];
  assert(discoverShelves.every((shelf) => shelf.length <= 12), 'Discover shelf cap failed');
  assert(
    discoverPlan.bestMatches[0]?.joeAIRecommendation?.confidenceReceipt,
    'Discover cards lost JoeAI recommendation evidence'
  );
  const discoverAppearances = new Map();
  discoverShelves.flat().forEach((item) => {
    discoverAppearances.set(item.title, (discoverAppearances.get(item.title) || 0) + 1);
  });
  assert(
    Math.max(...discoverAppearances.values()) <= 2,
    'Discover controlled shelf overlap failed'
  );
  assert(
    discoverPlan.surprisePools.safe.length > 0
      && discoverPlan.surprisePools.wild.length > 0
      && discoverPlan.surprisePools.chaos.length > 0,
    'Discover intelligent Surprise Me pools failed'
  );

  return {
    passed: 21,
    prompts: [
      'tell me why you recommend One Piece Fan Letter',
      'why the second one?',
      'something shorter',
      "I don't care about studio",
      'I liked One Piece for the crew',
      "I didn't like Claymore because it was too dark",
      'Dragon Ball and Dragon Ball Z are different',
      'what is Dragon Ball?',
      'anime like Overlord',
      'rejected-pick exclusion',
      'confidence receipts',
      'feedback-aware recommendation ranking',
      'recommendation confidence propagation',
      'catalog-backed Genome discovery metadata',
      'timestamp-safe latest feedback',
      'candidate-specific confidence',
      'learned Genome re-ranking',
      'Discover shelf cap',
      'Discover smart-card evidence',
      'Discover controlled overlap',
      'Discover intelligent Surprise Me pools'
    ]
  };
}
