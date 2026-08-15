import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true }
});

function normalizedTitle(item = {}) {
  return String(item.officialTitle || item.title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

try {
  const discoverModule = await server.ssrLoadModule('/src/services/recommendationEngineV3.js');
  const recommendationModule = await server.ssrLoadModule('/src/ai/joeAIRecommendationRouter.js');
  const intentModule = await server.ssrLoadModule('/src/ai/intentParser.js');
  const readinessModule = await server.ssrLoadModule('/src/ai/tasteReadiness.js');

  assert.equal(
    intentModule.parseJoeAIIntent('recommend a comedy under 12 episodes').kind,
    'recommendation',
    'Constrained recommendation was intercepted by fuzzy title lookup'
  );

  const emptyReadiness = readinessModule.getTasteReadiness([]);
  assert.equal(emptyReadiness.hasTasteData, false);
  assert.equal(emptyReadiness.hasPersonalizedTaste, false);

  const earlyReadiness = readinessModule.getTasteReadiness([{
    title: 'First title',
    status: 'Completed',
    joeScore: 8
  }]);
  assert.equal(earlyReadiness.hasTasteData, true);
  assert.equal(earlyReadiness.hasPersonalizedTaste, false);

  const emptyPlan = discoverModule.buildDiscoverPlan({
    library: null,
    candidates: [null, undefined, {}, { id: 'missing-title' }],
    daySeed: 1
  });
  assert.equal(emptyPlan.ranked.length, 0);
  assert.equal(emptyPlan.dailyPick, null);
  assert.deepEqual(emptyPlan.bestMatches, []);

  const importedLibrary = [{
    id: 'local-owned',
    malId: 20,
    title: 'Naruto',
    officialTitle: 'Naruto',
    status: 'Completed',
    joeScore: 8.5,
    genres: ['Action', 'Adventure']
  }];

  const candidates = [
    null,
    {},
    {
      id: 'provider-owned-copy',
      title: 'NARUTO',
      communityScore: 9.9,
      genres: ['Action'],
      synopsis: 'This must be excluded because the user owns it.'
    },
    {
      id: 'bebop-low',
      title: 'Cowboy Bebop',
      communityScore: 7.2,
      genres: ['Action', 'Sci-Fi']
    },
    {
      id: 'bebop-best',
      malId: 1,
      title: 'Cowboy Bebop',
      officialTitle: 'Cowboy Bebop',
      communityScore: 8.9,
      genres: ['Action', 'Sci-Fi'],
      studios: ['Sunrise'],
      year: 1998,
      episodeCount: 26,
      type: 'TV',
      cover: 'https://example.invalid/bebop.jpg',
      synopsis: 'Bounty hunters cross the solar system.'
    },
    ...Array.from({ length: 20 }, (_, index) => ({
      id: `fresh-${index}`,
      title: `Fresh Candidate ${index}`,
      officialTitle: `Fresh Candidate ${index}`,
      communityScore: 8.8 - (index % 8) * 0.1,
      genres: index % 3 === 0
        ? ['Action', 'Adventure']
        : index % 3 === 1
          ? ['Drama', 'Romance']
          : ['Psychological', 'Mystery'],
      studios: index % 2 ? ['Studio A'] : ['Studio B'],
      members: 25_000 + index * 1_000,
      popularity: 1_600 + index,
      year: 2000 + index,
      episodeCount: index % 4 === 0 ? 1 : 12,
      type: index % 4 === 0 ? 'Movie' : 'TV',
      cover: index % 5 === 0 ? '' : `https://example.invalid/fresh-${index}.jpg`,
      synopsis: index % 6 === 0 ? '' : 'A usable catalog synopsis with character growth and adventure.'
    }))
  ];

  const plan = discoverModule.buildDiscoverPlan({
    library: importedLibrary,
    candidates,
    daySeed: 3
  });

  assert.ok(plan.ranked.length >= 20, 'A tiny library should still produce a useful Discover plan');
  assert.ok(plan.dailyPick, 'A tiny library should still receive a daily pick');
  assert.equal(plan.ranked.some((entry) => normalizedTitle(entry.item) === 'naruto'), false);
  assert.equal(plan.ranked.filter((entry) => normalizedTitle(entry.item) === 'cowboy bebop').length, 1);
  assert.equal(
    plan.ranked.find((entry) => normalizedTitle(entry.item) === 'cowboy bebop')?.item.id,
    'bebop-best',
    'The strongest duplicate catalog row should win'
  );

  const shelfNames = [
    'airingNow',
    'comingSoon',
    'bestMatches',
    'highestRated',
    'becauseYouLoved',
    'studioSpotlight',
    'hiddenGems',
    'mindBenders',
    'emotionalDamage',
    'movieNight'
  ];
  const visibleTitles = [plan.dailyPick?.item].filter(Boolean).map(normalizedTitle);
  shelfNames.forEach((name) => {
    visibleTitles.push(...(plan[name] || []).map(normalizedTitle));
  });
  assert.equal(new Set(visibleTitles).size, visibleTitles.length, 'Discover repeated a canonical title');

  const messyMoodCatalog = [
    null,
    {},
    {
      id: 'dark-one',
      title: 'Night Signal',
      genres: ['Psychological', 'Thriller'],
      communityScore: 8.2,
      cover: 'https://example.invalid/night-signal.jpg'
    },
    {
      id: 'dark-duplicate-provider',
      title: 'Night Signal',
      genres: ['Horror'],
      communityScore: 7.9
    },
    {
      id: 'dark-two',
      title: 'Black Horizon',
      genres: ['Horror', 'Mystery'],
      communityScore: 8.0
    }
  ];
  const mood = recommendationModule.routeJoeAIRecommendation(
    'recommend something dark',
    [],
    messyMoodCatalog
  );
  assert.equal(mood?.type, 'recommendationCards');
  assert.equal(mood.items.length, 2);
  assert.equal(new Set(mood.items.map(normalizedTitle)).size, mood.items.length);
  assert.ok(mood.items.every((item) => item.title && Number.isFinite(item.match)));

  const compoundCatalog = [
    {
      id: 'valid-sad-short-movie',
      title: 'Rain Letters',
      type: 'Movie',
      episodeCount: 1,
      genres: ['Drama', 'Romance'],
      synopsis: 'A melancholy tragedy about grief, memory, and emotional healing.',
      communityScore: 8.3
    },
    {
      id: 'wrong-format',
      title: 'Long Sad Series',
      type: 'TV',
      episodeCount: 64,
      genres: ['Drama'],
      synopsis: 'An emotional tragedy.',
      communityScore: 9
    },
    {
      id: 'wrong-mood',
      title: 'Happy Movie',
      type: 'Movie',
      episodeCount: 1,
      genres: ['Comedy'],
      synopsis: 'A lighthearted parody.',
      communityScore: 9
    }
  ];
  const compound = recommendationModule.routeJoeAIRecommendation(
    'recommend a short sad anime movie',
    [],
    compoundCatalog
  );
  assert.equal(compound?.type, 'recommendationCards');
  assert.deepEqual(compound.items.map((item) => item.id), ['valid-sad-short-movie']);
  assert.ok(compound.items.every((item) => /movie|film/i.test(String(item.type))));
  assert.ok(compound.items.every((item) => Number(item.episodeCount) <= 13));

  const shortMovie = recommendationModule.routeJoeAIRecommendation(
    'recommend a short anime movie',
    [],
    compoundCatalog
  );
  assert.equal(shortMovie?.type, 'recommendationCards');
  assert.ok(shortMovie.items.length >= 1);
  assert.ok(shortMovie.items.every((item) => /movie|film/i.test(String(item.type))));
  assert.ok(shortMovie.items.every((item) => Number(item.episodeCount) <= 13));

  const comedyUnderTwelve = recommendationModule.routeJoeAIRecommendation(
    'recommend a comedy under 12 episodes',
    [],
    [
      { id: 'short-comedy', title: 'Short Laughs', type: 'TV', episodeCount: 10, genres: ['Comedy'] },
      { id: 'long-comedy', title: 'Long Laughs', type: 'TV', episodeCount: 24, genres: ['Comedy'] },
      { id: 'wrong-genre', title: 'Short Tears', type: 'TV', episodeCount: 10, genres: ['Drama'] }
    ]
  );
  assert.equal(comedyUnderTwelve?.type, 'recommendationCards');
  assert.deepEqual(comedyUnderTwelve.items.map((item) => item.id), ['short-comedy']);

  const constrainedSimilar = recommendationModule.routeJoeAIRecommendation(
    'recommend something like Slime but under 13 episodes',
    [],
    []
  );
  assert.equal(constrainedSimilar?.type, 'recommendationCards');
  assert.ok(constrainedSimilar.items.every((item) => Number(item.episodeCount || item.episodes || 0) > 0));
  assert.ok(constrainedSimilar.items.every((item) => Number(item.episodeCount || item.episodes) < 13));

  const baselineSimilar = recommendationModule.routeJoeAIRecommendation(
    'recommend something like Space Dandy',
    [],
    []
  );
  const targetTitle = baselineSimilar.items[0].title;
  const enrichedSimilar = recommendationModule.routeJoeAIRecommendation(
    'recommend something like Space Dandy',
    [],
    [{
      id: 'catalog-artwork-match',
      title: targetTitle,
      officialTitle: targetTitle,
      cover: 'https://example.invalid/recovered-cover.jpg',
      communityScore: 8.4
    }]
  );
  assert.equal(enrichedSimilar?.type, 'recommendationCards');
  assert.equal(enrichedSimilar.items[0].cover, 'https://example.invalid/recovered-cover.jpg');

  console.log('[ok] Empty-state Discover does not throw or invent rows');
  console.log(`[ok] Tiny-library Discover: ${plan.ranked.length} usable unique candidates`);
  console.log(`[ok] Messy-catalog JoeAI: ${mood.items.length} unique recommendation cards`);
  console.log('[ok] Compound JoeAI constraints reject wrong format, length, and mood');
  console.log('[ok] Fresh users do not receive invented Anime DNA claims');
  console.log('[ok] JoeAI recovered catalog artwork for Genome recommendations');
} finally {
  await server.close();
}
