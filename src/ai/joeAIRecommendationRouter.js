import { maybeKnowledgeFirstRecommendation } from './knowledgeFirstRecommender';
import { maybeGenomeIntentRecommendation } from './joeAIIntentEngine';
import { ACTIVE_GENOME_REGISTRY, findGenomeCardFromRegistry, findGenomeCardByTitle } from './genome/genomeRegistry';
import { getAnimeStudios, getAnimeTasteSignals, productionSearchText } from '../utils/metadataAdapters';

function norm(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function title(card = {}) {
  return card.titles?.[0] || card.title || card.id || 'Unknown title';
}

function extractSimilarityTitle(question = '') {
  const raw = String(question || '').trim();

  const patterns = [
    /similar\s+to\s+(.+?)[?.!]*$/i,
    /something\s+like\s+(.+?)[?.!]*$/i,
    /show\s+like\s+(.+?)[?.!]*$/i,
    /shows\s+like\s+(.+?)[?.!]*$/i,
    /anime\s+like\s+(.+?)[?.!]*$/i,
    /recommend\s+something\s+like\s+(.+?)[?.!]*$/i,
    /recommend\s+.+?\s+like\s+(.+?)[?.!]*$/i
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1].replace(/[?.!]+$/g, '').trim();
  }

  return '';
}

function mentionedGenomeCard(question = '') {
  const q = norm(question);

  // Avoid accidentally matching tiny titles or general words.
  const candidates = ACTIVE_GENOME_REGISTRY
    .map((card) => {
      const names = [card.id, ...(card.titles || []), ...(card.aliases || [])].filter(Boolean);
      const best = names
        .map((name) => ({ name, clean: norm(name) }))
        .filter((entry) => entry.clean.length >= 4)
        .filter((entry) => q.includes(entry.clean))
        .sort((a, b) => b.clean.length - a.clean.length)[0];

      return best ? { card, matchLength: best.clean.length } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.matchLength - a.matchLength);

  return candidates[0]?.card || null;
}

function cardsFromIds(ids = []) {
  return ids
    .map((id) => findGenomeCardByTitle(id))
    .filter(Boolean);
}

function itemKey(item = {}) {
  return String(item.malId || item.id || item.title || '').toLowerCase();
}

function textBlob(item = {}) {
  return norm([
    item.title,
    item.officialTitle,
    productionSearchText(item),
    item.synopsis,
    item.description,
    ...getAnimeTasteSignals(item)
  ].filter(Boolean).join(' '));
}

function extractBroadRecommendationIntent(question = '') {
  const q = norm(question);
  const isRecommendation = /\b(recommend|watch|show me|find|give me|suggest|pick)\b/i.test(question);
  if (!isRecommendation) return null;

  const studioMatch = String(question).match(/\bfrom\s+([A-Za-z0-9 .&'-]+)\s*$/i);
  const studio = studioMatch?.[1]?.trim();

  if (/hidden gems?|underrated|under rated/.test(q)) {
    return {
      mode: 'hiddenGems',
      label: studio ? `Hidden gems from ${studio}` : 'Hidden gems',
      studio,
      keywords: ['underrated', 'hidden gem', 'cult', 'unique', 'original', 'mystery', 'seinen', 'adventure']
    };
  }

  const moodProfiles = [
    {
      id: 'dark',
      label: 'Something darker',
      test: /\b(dark|darker|gritty|violent|brutal|gory|horror|scary|creepy)\b/,
      keywords: ['dark', 'horror', 'psychological', 'thriller', 'seinen', 'supernatural', 'mystery', 'gore', 'violence', 'demons', 'survival']
    },
    {
      id: 'funny',
      label: 'Something funny',
      test: /\b(funny|comedy|hilarious|laugh)\b/,
      keywords: ['comedy', 'parody', 'absurd', 'funny', 'slice of life', 'gag', 'lighthearted']
    },
    {
      id: 'emotional',
      label: 'Something emotional',
      test: /\b(emotional|sad|tearjerker|heartbreaking|cry|drama)\b/,
      keywords: ['drama', 'emotional', 'tragedy', 'coming of age', 'romance', 'family', 'friendship']
    },
    {
      id: 'cozy',
      label: 'Something cozy',
      test: /\b(cozy|comfort|comforting|wholesome|chill|relaxing|feel good|feelgood)\b/,
      keywords: ['slice of life', 'wholesome', 'comedy', 'iyashikei', 'family', 'food', 'friendship', 'relaxing']
    },
    {
      id: 'strategy',
      label: 'Something strategic',
      test: /\b(strategy|politics|political|mind games|psychological|genius|manipulation)\b/,
      keywords: ['strategy', 'political', 'psychological', 'mind game', 'military', 'tactics', 'thriller']
    },
    {
      id: 'sports',
      label: 'Sports / competition anime',
      test: /\b(sports|competition|training|underdog|rivalry|mastery)\b/,
      keywords: ['sports', 'competition', 'training', 'rivalry', 'team', 'school']
    },
    {
      id: 'short',
      label: 'A short binge',
      test: /\b(short|quick|under 24|under twenty four|one cour|12 episodes|twelve episodes)\b/,
      keywords: ['short', '12 eps', '11 eps', '13 eps']
    },
    {
      id: 'movie',
      label: 'Anime movies',
      test: /\b(movie|film)\b/,
      keywords: ['movie', 'film']
    }
  ];

  const profile = moodProfiles.find((entry) => entry.test.test(q));
  if (!profile && !studio) return null;

  return profile ? { ...profile, studio } : {
    id: 'studio',
    label: `Shows from ${studio}`,
    studio,
    keywords: []
  };
}

function scoreMoodItem(item = {}, intent = {}, owned = false) {
  const blob = textBlob(item);
  let score = owned ? 8 : 0;

  if (intent.studio && getAnimeStudios(item).some((studio) => norm(studio).includes(norm(intent.studio)))) score += 45;
  if (intent.id === 'short') {
    const eps = Number(item.episodeCount || item.episodes || 0);
    if (eps > 0 && eps <= 13) score += 42;
    else if (eps > 0 && eps <= 24) score += 20;
  }
  if (intent.id === 'movie') {
    if (/\b(movie|film)\b/i.test(String(item.type || ''))) score += 50;
    if (Number(item.episodeCount || item.episodes || 0) === 1) score += 25;
  }

  for (const keyword of intent.keywords || []) {
    const key = norm(keyword);
    if (key && blob.includes(key)) score += 18;
  }

  const mal = Number(item.communityScore || item.malScore || 0);
  if (mal) score += Math.min(16, Math.max(0, mal - 6) * 5);

  // Hidden gems should not just be the most obvious mega-franchises.
  if (intent.mode === 'hiddenGems' || intent.id === 'hiddenGems') {
    const title = norm(item.title || item.officialTitle || '');
    if (/demon slayer|one piece|naruto|bleach|dragon ball|jujutsu kaisen/.test(title)) score -= 25;
  }

  return score;
}

function moodBlurb(item = {}, intent = {}) {
  const name = item.officialTitle || item.title || 'This pick';
  if (intent.id === 'dark') return `${name} leans into heavier atmosphere, tension, and sharper stakes — a better fit when you want something darker than the usual comfort pick.`;
  if (intent.id === 'funny') return `${name} looks like a strong pick when you want comedy first and plot pressure second.`;
  if (intent.id === 'emotional') return `${name} should hit more on character emotion and dramatic payoff than pure action.`;
  if (intent.id === 'cozy') return `${name} looks like a lower-stress comfort pick with warmer vibes.`;
  if (intent.id === 'strategy') return `${name} should scratch the planning, tactics, and mind-game itch.`;
  if (intent.id === 'sports') return `${name} fits the training, rivalry, and growth-loop side of anime.`;
  if (intent.mode === 'hiddenGems' || intent.id === 'hiddenGems') return `${name} stands out as a less-obvious pick that may be worth surfacing from the catalog.`;
  return `${name} matches the request better than a generic recommendation because its metadata overlaps with what you asked for.`;
}

function formatMoodRecommendationCards(intent, anime = [], catalog = []) {
  const ownedKeys = new Set(anime.map(itemKey));
  const pool = [...anime, ...catalog]
    .filter((item, index, arr) => {
      const key = itemKey(item);
      return key && arr.findIndex((other) => itemKey(other) === key) === index;
    });

  const scored = pool
    .map((item) => {
      const owned = ownedKeys.has(itemKey(item));
      const rawScore = scoreMoodItem(item, intent, owned);
      const match = Math.max(60, Math.min(98, Math.round(rawScore + 45)));
      const tags = (intent.keywords || [])
        .filter((keyword) => textBlob(item).includes(norm(keyword)))
        .slice(0, 5);

      return {
        ...item,
        owned,
        bucket: owned ? 'library' : 'discovery',
        match,
        tags: tags.length ? tags : (item.genres || []).slice(0, 4),
        blurb: moodBlurb(item, intent),
        deepDive: [
          `Mood request: ${intent.label}`,
          intent.studio ? `Studio filter: ${intent.studio}` : '',
          `JoeAI matched this using metadata, genres, themes, studio, episode count, and library ownership.`,
          `This is a broad recommendation mode, not a title-similarity Genome match yet.`
        ].filter(Boolean).join('\n')
      };
    })
    .filter((item) => item.match >= 68)
    .sort((a, b) => b.match - a.match)
    .slice(0, 10);

  if (!scored.length) return null;

  return {
    type: 'recommendationCards',
    title: `🍜 ${intent.label}`,
    subtitle: 'JoeAI treated this as a mood/theme request instead of a title lookup.',
    items: scored
  };
}

function scoreRelatedCards(sourceCard) {
  const preferred = cardsFromIds(sourceCard.idealFollowUps || sourceCard.successors || []);

  const sourceText = norm([
    sourceCard.domain,
    sourceCard.subdomain,
    ...(sourceCard.viewerMotivations || []),
    ...(sourceCard.themes || []),
    ...(sourceCard.atmosphere || []),
    ...(sourceCard.emotionalProfile || [])
  ].join(' '));

  const fallback = ACTIVE_GENOME_REGISTRY
    .filter((card) => card.id !== sourceCard.id)
    .map((card) => {
      const cardText = norm([
        card.domain,
        card.subdomain,
        ...(card.viewerMotivations || []),
        ...(card.themes || []),
        ...(card.atmosphere || []),
        ...(card.emotionalProfile || [])
      ].join(' '));

      let score = 0;
      for (const token of sourceText.split(' ').filter((x) => x.length > 4)) {
        if (cardText.includes(token)) score += 1;
      }

      return { card, score };
    })
    .filter((entry) => entry.score > 1)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.card);

  const seen = new Set();
  return [...preferred, ...fallback]
    .filter((card) => {
      if (!card?.id || seen.has(card.id)) return false;
      seen.add(card.id);
      return true;
    })
    .slice(0, 8);
}

function findLibraryItemForCard(card = {}, anime = []) {
  const cardNames = [card.id, card.title, ...(card.titles || []), ...(card.aliases || [])]
    .filter(Boolean)
    .map(norm);

  return (anime || []).find((item) => {
    const itemNames = [item.title, item.officialTitle, item.japaneseTitle, ...(item.titleSynonyms || [])]
      .filter(Boolean)
      .map(norm);
    return itemNames.some((name) => cardNames.includes(name));
  }) || null;
}

function sharedGenomeTags(sourceCard = {}, targetCard = {}) {
  const source = new Set([
    sourceCard.domain,
    sourceCard.subdomain,
    ...(sourceCard.viewerMotivations || []),
    ...(sourceCard.themes || []),
    ...(sourceCard.atmosphere || []),
    ...(sourceCard.emotionalProfile || []),
    ...(sourceCard.fantasyPillars || [])
  ].filter(Boolean).map(norm));

  const target = [
    targetCard.domain,
    targetCard.subdomain,
    ...(targetCard.viewerMotivations || []),
    ...(targetCard.themes || []),
    ...(targetCard.atmosphere || []),
    ...(targetCard.emotionalProfile || []),
    ...(targetCard.fantasyPillars || [])
  ].filter(Boolean);

  const shared = target.filter((item) => source.has(norm(item)));
  return [...new Set(shared)].slice(0, 5);
}

function genomeCardToRecommendationItem(card = {}, index = 0, sourceCard = {}, anime = []) {
  const local = findLibraryItemForCard(card, anime);
  const name = title(card);
  const shared = sharedGenomeTags(sourceCard, card);
  const preferredIds = sourceCard.idealFollowUps || sourceCard.successors || [];
  const isPreferred = preferredIds.some((id) => norm(id) === norm(card.id) || norm(id) === norm(name));
  const baseMatch = isPreferred ? 98 : Math.max(82, 96 - index * 3);

  return {
    ...(local || {}),
    id: local?.id || card.id || name,
    title: local?.title || name,
    officialTitle: local?.officialTitle || name,
    year: local?.year || card.year,
    episodes: local?.episodes || local?.episodeCount || card.episodes,
    studio: local?.studio || card.studio,
    cover: local?.cover || card.cover || card.image,
    communityScore: local?.communityScore || local?.malScore || card.communityScore || card.malScore,
    owned: Boolean(local),
    bucket: local ? 'library' : 'discovery',
    match: Math.min(99, Math.max(72, baseMatch)),
    matchLabel: isPreferred ? 'Genome Follow-up' : 'Genome Neighbor',
    tags: shared.length ? shared : [card.domain, card.subdomain, ...(card.viewerMotivations || [])].filter(Boolean).slice(0, 5),
    reasons: shared.length ? shared : [card.signature || card.coreFantasy || 'Shared Anime DNA'].filter(Boolean),
    blurb: card.signature || card.coreFantasy || `${name} shares enough Anime DNA to be worth comparing.`,
    joeAISummary: `${name} looks like a strong follow-up because it overlaps with the ${title(sourceCard)} Genome instead of only matching a surface genre.`,
    deepDive: [
      `Source Genome: ${title(sourceCard)}`,
      `Candidate Genome: ${name}`,
      shared.length ? `Shared traits: ${shared.join(', ')}` : 'Shared traits: broader Genome neighborhood match',
      isPreferred ? 'Priority: listed as an ideal follow-up/successor.' : 'Priority: inferred from overlapping domain, mood, themes, and viewer motivations.'
    ].join('\n')
  };
}

function formatSimilarGenomeCards(sourceCard, anime = []) {
  const sourceTitle = title(sourceCard);
  const related = scoreRelatedCards(sourceCard);

  if (!related.length) {
    return {
      type: 'text',
      text: [
        `🧬 JoeAI Genome Match: ${sourceTitle}`,
        '',
        sourceCard.signature || sourceCard.note || `${sourceTitle} has a Genome profile.`,
        '',
        'I have the source Genome Card, but I do not have enough related cards yet. Add more module cards or catalog entries and I will get smarter.'
      ].join('\n')
    };
  }

  const chasing = (sourceCard.viewerMotivations || []).slice(0, 4);
  const subtitle = chasing.length
    ? `I think you are chasing ${chasing.join(', ')} — so I turned that into card-based follow-ups.`
    : 'JoeAI turned the source Genome into card-based follow-ups instead of a wall of text.';

  return {
    type: 'recommendationCards',
    title: `🍜 Because you like ${sourceTitle}`,
    subtitle,
    sourceAnime: sourceTitle,
    fullAnalysis: [
      `Source: ${sourceTitle}`,
      sourceCard.signature || sourceCard.note || '',
      chasing.length ? `Likely chase: ${chasing.join(', ')}` : '',
      'Cards are ranked from ideal follow-ups plus inferred Genome neighbors.'
    ].filter(Boolean).join('\\n'),
    items: related.map((card, index) => genomeCardToRecommendationItem(card, index, sourceCard, anime))
  };
}

function formatTitleGenomeAnswer(card) {
  const name = title(card);
  const lines = [
    `🧬 JoeAI Knows: ${name}`,
    '',
    card.signature || card.note || `${name} has a Genome profile.`
  ];

  if (card.coreFantasy) {
    lines.push('', 'Core Fantasy:');
    lines.push(card.coreFantasy);
  }

  if (card.fantasyPillars?.length || card.rewardLoop?.length || card.viewerType?.length) {
    lines.push('', 'Viewer Fantasy:');
    if (card.fantasyPillars?.length) lines.push('• Pillars: ' + card.fantasyPillars.slice(0, 5).join(', '));
    if (card.rewardLoop?.length) lines.push('• Reward loop: ' + card.rewardLoop.slice(0, 5).join(' → '));
    if (card.viewerType?.length) lines.push('• Best for: ' + card.viewerType.slice(0, 5).join(', '));
  }

  if (card.viewerMotivations?.length) {
    lines.push('', 'Why someone would pick it:');
    lines.push(card.viewerMotivations.slice(0, 6).map((item) => `• ${item}`).join('\n'));
  }

  if (card.joeNote) {
    lines.push('', `Joe Note: ${card.joeNote}`);
  }

  if (card.idealFollowUps?.length) {
    const related = cardsFromIds(card.idealFollowUps).slice(0, 5);
    if (related.length) {
      lines.push('', 'If that sounds good, nearby picks are:');
      lines.push(related.map((item) => `• ${title(item)}`).join('\n'));
    }
  }

  return lines.join('\n');
}

export function routeJoeAIRecommendation(question = '', anime = [], catalog = []) {
  // 0. Broad mood/theme recommendation requests should not fall through to title lookup.
  // Example: "recommend something darker" should never become "JoeAI Knows: Space Dandy".
  const broadIntent = extractBroadRecommendationIntent(question);

  // 1. Similarity requests need title-aware recommendation first.
  // Example: "recommend something like Higurashi"
  const similarTitle = extractSimilarityTitle(question);
  if (similarTitle) {
    const sourceCard = findGenomeCardByTitle(similarTitle);
    if (sourceCard) return formatSimilarGenomeCards(sourceCard, anime);

    // Only fall back to the older knowledge-first text path when there is no
    // Genome source card to build structured recommendation cards from.
    const smart = maybeKnowledgeFirstRecommendation(question, anime, catalog);
    if (smart && !/^I heard:.+could not find/i.test(smart)) return smart;
  }

  if (broadIntent) {
    const moodCards = formatMoodRecommendationCards(broadIntent, anime, catalog);
    if (moodCards) return moodCards;
    return null;
  }

  // 2. Known title lookup should beat mood/vibe routing.
  // Example: "recommend Blue Eye Samurai" should show that card,
  // not fall through to generic samurai/cyberpunk recommendations.
  const card = findGenomeCardByTitle(question) || mentionedGenomeCard(question);
  if (card) return formatTitleGenomeAnswer(card);

  // 3. Mood/vibe requests only happen after known-title lookup fails.
  // Example: "I want horror" should still mean horror recommendations.
  const intent = maybeGenomeIntentRecommendation(question);
  if (intent) return intent;

  // 4. Existing Knowledge/Genome pipeline for any remaining recommendation wording.
  const smart = maybeKnowledgeFirstRecommendation(question, anime, catalog);
  if (smart && !/^I heard:.+could not find/i.test(smart)) return smart;

  return null;
}
