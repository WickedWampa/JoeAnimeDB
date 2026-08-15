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
  const knowledgeModule = await server.ssrLoadModule('/src/ai/knowledgeFirstRecommender.js');
  const coordinatorModule = await server.ssrLoadModule('/src/ai/recommendationCoordinator.js');
  const traitModule = await server.ssrLoadModule('/src/ai/vibes/traitMixer.js');
  const discoverModule = await server.ssrLoadModule('/src/services/recommendationEngineV3.js');
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
  assert.equal(
    findGenomeCardByTitle('zzzz definitely not a registered anime zzzz'),
    null,
    'Unknown titles must not resolve to a random genome card'
  );
  assert.notEqual(findGenomeCardByTitle('the seven deadly sins')?.id, 'the-promised-neverland');
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
    ['what should I watch next?', 'recommendation'],
    ['recommend a psychological thriller', 'recommendation'],
    ['why do I like tragic romance?', 'tastePattern']
  ];
  for (const [prompt, expected] of routingCases) {
    assert.equal(parseJoeAIIntent(prompt).kind, expected, `Unexpected route for: ${prompt}`);
  }
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

  // Regression: non-Latin aliases normalize to an empty ASCII string. They must
  // never become wildcard matches (the bug that made NANA / Promised Neverland
  // hijack unrelated similarity prompts). The knowledge fallback must also keep
  // returning structured recommendation cards.
  const nana = {
    id: 'nana-test',
    title: 'NANA',
    japaneseTitle: 'ナナ',
    genres: ['Drama', 'Romance'],
    synopsis: 'Two young women build a complicated friendship in Tokyo.'
  };
  const sevenDeadlySins = {
    id: 'seven-deadly-sins-test',
    title: 'The Seven Deadly Sins',
    officialTitle: 'The Seven Deadly Sins',
    japaneseTitle: '七つの大罪',
    genres: ['Action', 'Adventure', 'Fantasy'],
    synopsis: 'Knights reunite for a fantasy adventure full of battles and magic.'
  };
  const fallbackCatalog = [
    sevenDeadlySins,
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `sds-fallback-${index}`,
      title: `Fantasy Candidate ${index + 1}`,
      officialTitle: `Fantasy Candidate ${index + 1}`,
      genres: ['Action', 'Adventure', 'Fantasy'],
      synopsis: 'A fantasy adventure with battles, friendship, magic, and a growing team.'
    }))
  ];
  const knowledgeResult = knowledgeModule.recommendKnowledgeFirst({
    query: 'the seven deadly sins',
    anime: [nana],
    catalog: fallbackCatalog
  });
  assert.equal(knowledgeResult?.found, true);
  assert.equal(knowledgeResult?.source?.id, 'seven-deadly-sins-test', 'NANA hijacked the fallback title match');
  const knowledgeCards = knowledgeModule.maybeKnowledgeFirstRecommendation(
    'recommend something like the seven deadly sins',
    [nana],
    fallbackCatalog
  );
  assert.equal(knowledgeCards?.type, 'recommendationCards');
  assert.equal(knowledgeCards?.source?.id, 'seven-deadly-sins-test');
  assert.ok(Array.isArray(knowledgeCards?.items));
  const fallbackPick = {
    id: 'fallback-card',
    title: 'Fallback Card',
    officialTitle: 'Fallback Card',
    match: 88,
    genres: ['Adventure'],
    reasons: ['Adventure is already part of your Anime DNA']
  };
  const recommendationCalls = [];
  const fallbackCards = coordinatorModule.coordinateJoeAIRecommendation({
    text: 'what should I watch next?',
    brain: {
      recommendations(limit, request) {
        recommendationCalls.push({ limit, request });
        return request?.prompt ? [] : [fallbackPick];
      }
    }
  });
  assert.equal(recommendationCalls.length, 2);
  assert.equal(fallbackCards?.type, 'recommendations');
  assert.equal(fallbackCards?.items?.[0]?.title, 'Fallback Card');
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
  console.log(`[ok] JoeAI routing: ${routingCases.length} cases`);
  console.log(`[ok] Gold registry: ${ACTIVE_GENOME_REGISTRY.filter((card) => card.registryTier === 'gold').length} active cards`);
  console.log(`[ok] Similar-DNA recommendations: ${similar.items.length} unique cards`);
  console.log(`[ok] Discover shelves: ${visibleIds.length} unique visible titles`);
} finally {
  await server.close();
}
