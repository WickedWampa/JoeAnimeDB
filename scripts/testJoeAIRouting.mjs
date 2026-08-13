import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true }
});

try {
  const intentModule = await server.ssrLoadModule('/src/ai/intentParser.js');
  const registryModule = await server.ssrLoadModule('/src/ai/genome/genomeRegistry.js');
  const goldPack6Module = await server.ssrLoadModule('/src/ai/genome/gold/goldStandardGenomeCardsPack6.js');
  const goldPack7Module = await server.ssrLoadModule('/src/ai/genome/gold/goldStandardGenomeCardsPack7.js');
  const goldPack8Module = await server.ssrLoadModule('/src/ai/genome/gold/goldStandardGenomeCardsPack8.js');
  const recommendationModule = await server.ssrLoadModule('/src/ai/joeAIRecommendationRouter.js');
  const traitModule = await server.ssrLoadModule('/src/ai/vibes/traitMixer.js');
  const discoverModule = await server.ssrLoadModule('/src/services/recommendationEngineV3.js');
  const coordinatorModule = await server.ssrLoadModule('/src/ai/recommendationCoordinator.js');
  const intelligenceModule = await server.ssrLoadModule('/src/ai/intelligence/joeAIIntelligence.js');

  const { parseJoeAIIntent } = intentModule;
  const {
    ACTIVE_GENOME_REGISTRY,
    GENOME_REGISTRY_PRECEDENCE,
    findGenomeCardByTitle
  } = registryModule;

  assert.deepEqual(
    [...GENOME_REGISTRY_PRECEDENCE],
    ['gold', 'core25', 'enhanced', 'core100', 'generated', 'modules']
  );

  const spaceDandy = findGenomeCardByTitle('Space Dandy');
  assert.equal(spaceDandy?.id, 'space-dandy');
  assert.equal(spaceDandy?.registryTier, 'gold');
  assert.equal(findGenomeCardByTitle('Attack on Titan')?.registryTier, 'gold');
  assert.ok(ACTIVE_GENOME_REGISTRY.filter((card) => card.registryTier === 'gold').length >= 100);
  assert.equal(goldPack6Module.GOLD_STANDARD_GENOME_CARDS_PACK_6.length, 25);
  assert.equal(goldPack7Module.GOLD_STANDARD_GENOME_CARDS_PACK_7.length, 25);
  assert.equal(goldPack8Module.GOLD_STANDARD_GENOME_CARDS_PACK_8.length, 2);

  const promotedGoldTitles = [
    'Dragon Ball Z',
    'Madoka Magica',
    'One Punch Man',
    'Serial Experiments Lain',
    '86 Eighty-Six',
    'Sword Art Online',
    'Fairy Tail'
  ];
  promotedGoldTitles.forEach((title) => {
    assert.equal(findGenomeCardByTitle(title)?.registryTier, 'gold', `${title} did not resolve to Gold`);
  });

  const routingCases = [
    ['Space Dandy', 'question'],
    ['tell me about Space Dandy', 'question'],
    ['why do I like Space Dandy?', 'question'],
    ['recommend something like Space Dandy', 'recommendation'],
    ['recommend a sad movie', 'recommendation'],
    ['why do I like long adventures?', 'tastePattern'],
    ['why do I like Madoka Magica?', 'question'],
    ['tell me about 86 Eighty-Six', 'question'],
    ['recommend something like One Punch Man', 'recommendation'],
    ['recommend a psychological thriller', 'recommendation'],
    ['why do I like tragic romance?', 'tastePattern']
  ];

  for (const [prompt, expected] of routingCases) {
    assert.equal(parseJoeAIIntent(prompt).kind, expected, `Unexpected route for: ${prompt}`);
  }

  const justFinished = parseJoeAIIntent('i just finished slime');
  assert.equal(justFinished.kind, 'singleAdd');
  assert.equal(justFinished.title, 'slime');
  assert.equal(justFinished.status, 'Completed');

  const finallyFinished = parseJoeAIIntent('I finally finished Frieren');
  assert.equal(finallyFinished.kind, 'singleAdd');
  assert.equal(finallyFinished.title, 'Frieren');
  assert.equal(finallyFinished.status, 'Completed');

  const similar = recommendationModule.routeJoeAIRecommendation(
    'recommend something like Space Dandy',
    [],
    []
  );
  assert.equal(similar?.type, 'recommendationCards');
  assert.ok(similar.items?.length >= 4);
  assert.ok(similar.items.every((item) => item.id !== 'space-dandy'));
  assert.equal(new Set(similar.items.map((item) => item.id)).size, similar.items.length);

  const lainSimilar = recommendationModule.routeJoeAIRecommendation(
    'recommend something like Serial Experiments Lain',
    [],
    []
  );
  assert.equal(lainSimilar?.type, 'recommendationCards');
  assert.ok(lainSimilar.items?.length >= 4);
  assert.ok(lainSimilar.items.every((item) => item.id !== 'serial-experiments-lain'));
  assert.equal(new Set(lainSimilar.items.map((item) => item.id)).size, lainSimilar.items.length);

  const traitMix = traitModule.maybeTraitMixerRecommendation('funny but emotional sci-fi');
  assert.match(traitMix || '', /Trait Mixer/);
  assert.match(traitMix || '', /comedy/);
  assert.match(traitMix || '', /emotional/);

  const library = [{
    id: 'owned-anchor',
    title: 'Owned Anchor',
    status: 'Completed',
    joeScore: 9.4,
    favorite: true,
    genres: ['Action', 'Fantasy'],
    studios: ['Test Studio']
  }];
  const candidates = Array.from({ length: 40 }, (_, index) => ({
    id: `candidate-${index}`,
    title: `Candidate ${index}`,
    officialTitle: `Candidate ${index}`,
    genres: index % 3 === 0
      ? ['Action', 'Fantasy']
      : index % 3 === 1
        ? ['Drama', 'Romance']
        : ['Psychological', 'Mystery'],
    studios: index % 2 ? ['Test Studio'] : ['Other Studio'],
    communityScore: 9.5 - (index % 12) * 0.1,
    members: 20_000 + index * 1_000,
    popularity: 2_000 + index,
    year: 2000 + index,
    episodeCount: index % 5 === 0 ? 1 : 12,
    type: index % 5 === 0 ? 'Movie' : 'TV',
    cover: `https://example.invalid/${index}.jpg`,
    synopsis: 'A complete test synopsis with action, fantasy, drama, mystery, and character growth.'
  }));

  const plan = discoverModule.buildDiscoverPlan({ library, candidates, daySeed: 7 });
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
  const visibleIds = [plan.dailyPick?.item?.id].filter(Boolean);
  shelfNames.forEach((name) => {
    visibleIds.push(...(plan[name] || []).map((item) => item.id));
  });
  assert.equal(new Set(visibleIds).size, visibleIds.length, 'Discover repeated a title across visible shelves');

  const guarded = coordinatorModule.finalizeJoeAIRecommendations({
    type: 'recommendationCards',
    items: [
      { title: 'Owned Anchor', officialTitle: 'OWNED ANCHOR', match: 99 },
      { title: 'Fresh One', kitsuId: 101, genres: ['Action'], match: 90 },
      { title: 'Fresh Two', malId: 202, genres: ['Romance'], match: 89 },
      { title: 'Fresh Three', kitsuId: 303, genres: ['Mystery'], match: 88 }
    ]
  }, {
    library,
    conversationContext: { recentRecommendationKeys: ['kitsu:101'] },
    constraints: { exclude: ['romance'] }
  });
  assert.deepEqual(
    guarded.items.map((item) => item.title),
    ['Fresh Three', 'Fresh One'],
    'JoeAI must exclude owned/blocked titles and move recent picks behind fresh ones'
  );

  const sparseRecommendation = {
    id: 'catalog-kitsu-999',
    title: 'Sparse Pick',
    kitsuId: 999,
    match: 91,
    reasons: ['Strong Anime DNA overlap'],
    confidenceReceipt: { tasteMatch: 91 }
  };
  assert.equal(coordinatorModule.recommendationNeedsHydration(sparseRecommendation), true);
  const hydratedRecommendation = coordinatorModule.mergeHydratedRecommendation(
    sparseRecommendation,
    {
      title: 'Sparse Pick',
      officialTitle: 'Sparse Pick Official',
      cover: 'https://example.invalid/poster.jpg',
      synopsis: 'Hydrated synopsis.',
      genres: ['Science Fiction'],
      studio: 'Test Studio',
      year: 2024,
      episodeCount: 12,
      ageRating: 'PG',
      contentRatingCheckedAt: '2026-08-13T00:00:00.000Z',
      metadataReady: true
    }
  );
  assert.equal(hydratedRecommendation.cover, 'https://example.invalid/poster.jpg');
  assert.equal(hydratedRecommendation.episodes, 12);
  assert.equal(hydratedRecommendation.ageRating, 'PG');
  assert.equal(hydratedRecommendation.match, 91);
  assert.deepEqual(hydratedRecommendation.reasons, ['Strong Anime DNA overlap']);
  assert.equal(coordinatorModule.recommendationNeedsHydration(hydratedRecommendation), false);
  const catalogRecord = coordinatorModule.toCatalogMetadataRecord(hydratedRecommendation);
  assert.equal(catalogRecord.match, undefined);
  assert.equal(catalogRecord.confidenceReceipt, undefined);
  assert.equal(catalogRecord.cover, 'https://example.invalid/poster.jpg');
  assert.deepEqual(
    coordinatorModule.mergeRecommendationCandidatePools(
      [{ title: 'Genome Pick' }],
      [{ title: 'Catalog Reserve' }]
    ).map((item) => item.title),
    ['Genome Pick', 'Catalog Reserve']
  );

  const completeCandidate = (index, rating = 'PG') => ({
    id: `complete-${index}`,
    title: `Complete Candidate ${index}`,
    officialTitle: `Complete Candidate ${index}`,
    cover: `https://example.invalid/complete-${index}.jpg`,
    synopsis: 'Complete metadata for recommendation count testing.',
    genres: ['Adventure'],
    studio: 'Test Studio',
    year: 2020 + index,
    episodes: 12,
    episodeCount: 12,
    ageRating: rating,
    contentRatingCheckedAt: '2026-08-13T00:00:00.000Z',
    metadataReady: true,
    match: 90 - index
  });
  const safeReserve = [
    ...Array.from({ length: 4 }, (_, index) => completeCandidate(index, 'R')),
    ...Array.from({ length: 10 }, (_, index) => completeCandidate(index + 4, 'PG'))
  ];
  const filledAfterSafety = await coordinatorModule.coordinateJoeAIRecommendation({
    text: 'what should I watch next?',
    anime: [],
    catalog: safeReserve,
    brain: { recommendations: () => safeReserve },
    contentSafetyMode: 'teen'
  });
  assert.equal(filledAfterSafety.items.length, 8);
  assert.ok(filledAfterSafety.items.every((item) => item.ageRating === 'PG'));

  const followUp = intelligenceModule.resolveJoeAIFollowUp('no horror', {
    lastPrompt: 'recommend a short movie',
    lastRecommendationPrompt: 'recommend a short movie',
    lastConstraints: { exclude: [] }
  });
  assert.match(followUp.text, /short movie without horror/i);
  assert.deepEqual(followUp.constraints.exclude, ['horror']);

  const directConstraint = intelligenceModule.resolveJoeAIFollowUp('recommend something without romance', {
    lastConstraints: { exclude: [] }
  });
  assert.deepEqual(directConstraint.constraints.exclude, ['romance']);

  const explanationThenAnother = intelligenceModule.resolveJoeAIFollowUp('another one', {
    lastPrompt: 'why did you recommend Fresh One?',
    lastRecommendationPrompt: 'recommend something adventurous'
  });
  assert.equal(explanationThenAnother.text, 'recommend something adventurous');

  const recommendationContext = intelligenceModule.updateJoeAIConversationContext(
    { type: 'recommendations', items: [{ title: 'Fresh One', kitsuId: 101 }] },
    'recommend something adventurous',
    {}
  );
  const explanationContext = intelligenceModule.updateJoeAIConversationContext(
    { type: 'text', text: 'Fresh One matches your adventure signals.' },
    'why did you recommend Fresh One?',
    recommendationContext
  );
  assert.equal(explanationContext.lastRecommendationPrompt, 'recommend something adventurous');

  const persistedMessages = intelligenceModule.sanitizeJoeAIConversationMessages(
    Array.from({ length: 60 }, (_, index) => ({ who: index % 2 ? 'bot' : 'user', text: `message ${index}` }))
  );
  assert.equal(persistedMessages.length, 48);
  assert.equal(persistedMessages[0].text, 'message 12');

  console.log(`[ok] JoeAI routing: ${routingCases.length} cases`);
  console.log(`[ok] Gold registry: ${ACTIVE_GENOME_REGISTRY.filter((card) => card.registryTier === 'gold').length} active cards`);
  console.log(`[ok] Similar-DNA recommendations: ${similar.items.length} unique cards`);
  console.log(`[ok] Discover shelves: ${visibleIds.length} unique visible titles`);
  console.log('[ok] JoeAI excludes owned titles, hydrates and backfills eight safe catalog cards, carries follow-up constraints, and bounds saved conversations');
} finally {
  await server.close();
}
