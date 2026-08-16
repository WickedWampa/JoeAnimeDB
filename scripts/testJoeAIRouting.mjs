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
    ['show me something like One Punch Man', 'recommendation'],
    ['anime like Fairy Tail', 'recommendation'],
    ['shows like Madoka Magica', 'recommendation'],
    ['same vibe as Space Dandy', 'recommendation'],
    ['anything close to Space Dandy', 'recommendation'],
    ['I loved Space Dandy, what next?', 'recommendation'],
    ['what should I watch after Space Dandy?', 'recommendation'],
    ['recommend something like Space Dandy but under 12 episodes', 'recommendation'],
    ['recommend something darker', 'recommendation'],
    ['recommend a 12 episode anime', 'recommendation'],
    ['give me a hidden gem', 'recommendation'],
    ['pick my next anime', 'recommendation'],
    ['surprise me', 'recommendation'],
    ['show me action anime', 'recommendation'],
    ['what should I watch next?', 'recommendation'],
    ['recommend a psychological thriller', 'recommendation'],
    ['why did you recommend Frieren?', 'recommendationExplanation'],
    ['compare Bleach, Naruto, and One Piece', 'question'],
    ['add Bleach, Naruto, and One Piece', 'bulkAdd'],
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
  const naturalSimilarityPrompts = [
    'same vibe as Space Dandy',
    'anything close to Space Dandy',
    'I loved Space Dandy, what next?',
    'what should I watch after Space Dandy?'
  ];
  for (const prompt of naturalSimilarityPrompts) {
    const result = recommendationModule.routeJoeAIRecommendation(prompt, [], []);
    assert.equal(result?.type, 'recommendationCards', `Natural similarity wording did not return cards: ${prompt}`);
    assert.equal(result?.sourceAnime, 'Space Dandy', `Natural similarity wording chose the wrong source: ${prompt}`);
    assert.ok(result?.items?.length >= 4, `Natural similarity wording returned too few cards: ${prompt}`);
  }

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

  // Abuse pass: JoeAI should survive ordinary human messiness without grabbing
  // a random short title or falling back to a plain list.
  const typoCards = knowledgeModule.maybeKnowledgeFirstRecommendation(
    'recommend something like the seven deadly sin',
    [nana],
    fallbackCatalog
  );
  assert.equal(typoCards?.type, 'recommendationCards', 'Small title typos should still produce cards');
  assert.equal(typoCards?.source?.id, 'seven-deadly-sins-test');

  const quotedCards = knowledgeModule.maybeKnowledgeFirstRecommendation(
    'recommend something like "The Seven Deadly Sins"',
    [nana],
    fallbackCatalog
  );
  assert.equal(quotedCards?.source?.id, 'seven-deadly-sins-test', 'Quoted titles should resolve cleanly');

  const constrainedCards = knowledgeModule.maybeKnowledgeFirstRecommendation(
    'recommend something like the seven deadly sins but darker',
    [nana],
    fallbackCatalog
  );
  assert.equal(constrainedCards?.source?.id, 'seven-deadly-sins-test', 'Trailing preference wording should not become part of the title');

  const duplicateOwned = {
    ...fallbackCatalog[1],
    id: 'owned-fantasy-candidate-1',
    malId: undefined,
    status: 'Completed',
    joeScore: 8.8
  };
  const dedupeResult = knowledgeModule.recommendKnowledgeFirst({
    query: 'the seven deadly sins',
    anime: [nana, duplicateOwned],
    catalog: fallbackCatalog
  });
  const dedupeCards = knowledgeModule.buildRecommendationCardsResult(dedupeResult);
  assert.equal(
    new Set(dedupeCards.items.map((item) => item.title.toLowerCase())).size,
    dedupeCards.items.length,
    'Same anime from library and catalog must not appear twice'
  );
  const ownedDuplicateCard = dedupeCards.items.find((item) => item.title === 'Fantasy Candidate 1');
  if (ownedDuplicateCard) assert.equal(ownedDuplicateCard.owned, true, 'Catalog duplicate should still be marked owned');

  const bananaFish = {
    id: 'banana-fish-test',
    title: 'Banana Fish',
    officialTitle: 'Banana Fish',
    japaneseTitle: 'バナナフィッシュ',
    genres: ['Action', 'Drama', 'Thriller'],
    synopsis: 'Crime, conspiracy, trauma, and a fierce friendship.'
  };
  const bananaSource = knowledgeModule.resolveKnowledgeSource(
    'banana fish',
    [nana],
    [bananaFish, ...fallbackCatalog]
  );
  assert.equal(bananaSource?.id, 'banana-fish-test', 'NANA must never win just because its letters appear inside another title');

  const typoSource = knowledgeModule.resolveKnowledgeSource(
    'the seven deadly sin',
    [nana],
    fallbackCatalog
  );
  assert.equal(typoSource?.id, 'seven-deadly-sins-test');
  assert.equal(
    knowledgeModule.resolveKnowledgeSource('7 deadly sins', [nana], fallbackCatalog)?.id,
    'seven-deadly-sins-test',
    'Common digit/word title variants should resolve'
  );
  assert.equal(
    knowledgeModule.resolveKnowledgeSource('七つの大罪', [nana], fallbackCatalog)?.id,
    'seven-deadly-sins-test',
    'Japanese title lookup should work without ASCII-normalization hacks'
  );
  assert.equal(knowledgeModule.resolveKnowledgeSource('the', [nana], fallbackCatalog), null, 'Tiny generic fragments must not fuzzy-match a title');
  assert.equal(knowledgeModule.resolveKnowledgeSource('zzzz this is not anime zzzz', [nana], fallbackCatalog), null);

  const JapaneseOnlyDecoy = {
    id: 'jp-only-decoy',
    title: '日本語だけ',
    japaneseTitle: '約束のネバーランド',
    genres: ['Drama']
  };
  assert.equal(
    knowledgeModule.resolveKnowledgeSource('the seven deadly sins', [JapaneseOnlyDecoy, nana], fallbackCatalog)?.id,
    'seven-deadly-sins-test',
    'Non-Latin titles must never normalize into wildcard matches'
  );
  // Human-input polish: common fandom shorthand and ordinary phrasing should
  // resolve without requiring users to type database-perfect titles.
  const attackOnTitan = {
    id: 'attack-on-titan-test',
    title: 'Attack on Titan',
    officialTitle: 'Attack on Titan',
    genres: ['Action', 'Drama', 'Fantasy'],
    synopsis: 'Humanity fights for survival behind enormous walls.'
  };
  const fullmetalBrotherhood = {
    id: 'fmab-test',
    title: 'Fullmetal Alchemist: Brotherhood',
    officialTitle: 'Fullmetal Alchemist: Brotherhood',
    genres: ['Action', 'Adventure', 'Fantasy'],
    synopsis: 'Two brothers pursue alchemy, redemption, and a way to restore their bodies.'
  };
  assert.equal(
    knowledgeModule.resolveKnowledgeSource('aot', [], [attackOnTitan])?.id,
    'attack-on-titan-test',
    'Common fandom acronym AOT should resolve'
  );
  assert.equal(
    knowledgeModule.resolveKnowledgeSource('Attack on Titan season 1', [], [attackOnTitan])?.id,
    'attack-on-titan-test',
    'Season 1 wording should resolve to an unsuffixed original entry'
  );
  assert.equal(
    knowledgeModule.resolveKnowledgeSource('fmab', [], [fullmetalBrotherhood])?.id,
    'fmab-test',
    'Common fandom acronym FMAB should resolve'
  );

  const naturalAfter = knowledgeModule.maybeKnowledgeFirstRecommendation(
    'what should i watch after the seven deadly sins?',
    [nana],
    fallbackCatalog
  );
  assert.equal(naturalAfter?.type, 'recommendationCards');
  assert.equal(naturalAfter?.source?.id, 'seven-deadly-sins-test');

  const naturalLoved = knowledgeModule.maybeKnowledgeFirstRecommendation(
    'i loved the seven deadly sins, what should i watch?',
    [nana],
    fallbackCatalog
  );
  assert.equal(naturalLoved?.type, 'recommendationCards');
  assert.equal(naturalLoved?.source?.id, 'seven-deadly-sins-test');

  const preferenceCatalog = [
    sevenDeadlySins,
    {
      id: 'dark-fantasy-pick',
      title: 'Dark Fantasy Pick',
      officialTitle: 'Dark Fantasy Pick',
      genres: ['Action', 'Fantasy', 'Horror', 'Thriller'],
      synopsis: 'A dark violent survival story with magic, monsters, and brutal battles.',
      episodeCount: 12,
      type: 'TV'
    },
    {
      id: 'light-fantasy-pick',
      title: 'Light Fantasy Pick',
      officialTitle: 'Light Fantasy Pick',
      genres: ['Action', 'Fantasy', 'Comedy'],
      synopsis: 'A bright comedic fantasy adventure with friendship and magic.',
      episodeCount: 12,
      type: 'TV'
    },
    {
      id: 'long-dark-fantasy-pick',
      title: 'Long Dark Fantasy Pick',
      officialTitle: 'Long Dark Fantasy Pick',
      genres: ['Action', 'Fantasy', 'Horror', 'Thriller'],
      synopsis: 'A dark survival fantasy with brutal battles and monsters.',
      episodeCount: 52,
      type: 'TV'
    }
  ];
  const darkerCards = knowledgeModule.maybeKnowledgeFirstRecommendation(
    'recommend something like the seven deadly sins but darker',
    [],
    preferenceCatalog
  );
  assert.equal(darkerCards?.type, 'recommendationCards');
  assert.equal(darkerCards?.items?.[0]?.id, 'dark-fantasy-pick', 'A requested darker tone should influence ranking');
  assert.match(darkerCards?.items?.[0]?.blurb || '', /darker tone/i);

  const upcomingDarkPick = {
    id: 'upcoming-dark-pick',
    title: 'Upcoming Dark Pick',
    officialTitle: 'Upcoming Dark Pick',
    genres: ['Action', 'Fantasy', 'Horror', 'Thriller'],
    synopsis: 'A perfect dark fantasy match that is not released yet.',
    episodeCount: 12,
    type: 'TV',
    airingStatus: 'upcoming',
    discoverBucket: 'upcoming',
    startDate: '2099-01-01'
  };
  const noFutureCards = knowledgeModule.maybeKnowledgeFirstRecommendation(
    'recommend something like the seven deadly sins but darker',
    [],
    [sevenDeadlySins, upcomingDarkPick, ...preferenceCatalog.slice(1)]
  );
  assert.equal(noFutureCards?.type, 'recommendationCards');
  assert.ok(
    noFutureCards.items?.every((item) => item.id !== 'upcoming-dark-pick'),
    'Upcoming / unreleased titles must not appear in watch-next recommendations'
  );

  const shortCards = knowledgeModule.maybeKnowledgeFirstRecommendation(
    'recommend something like the seven deadly sins under 13 episodes',
    [],
    preferenceCatalog
  );
  assert.equal(shortCards?.type, 'recommendationCards');
  assert.ok(shortCards.items?.length > 0);
  assert.ok(
    shortCards.items.every((item) => Number(item.episodeCount || item.episodes || 0) <= 12),
    'Hard episode limits must remove over-length candidates'
  );
  assert.ok(
    shortCards.items.every((item) => !/Knowledge boost:/i.test(item.deepDive || '')),
    'Why text should explain the pick without exposing internal scoring jargon'
  );

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
