import { maybeKnowledgeFirstRecommendation } from './knowledgeFirstRecommender';
import { maybeGenomeIntentRecommendation } from './joeAIIntentEngine';
import { ACTIVE_GENOME_REGISTRY, findGenomeCardFromRegistry, findGenomeCardByTitle } from './genome/genomeRegistry';
import { getAnimeStudios, getAnimeTasteSignals, productionSearchText } from '../utils/metadataAdapters';
import { animeIdentityKeys, parseTitleIdentity, titleAliases as metadataTitleAliases } from '../services/titleIdentity';

function norm(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function title(card = {}) {
  return card.titles?.[0] || card.title || card.id || 'Unknown title';
}

function cleanDirectTitleQuestion(question = '') {
  const raw = String(question || '').trim().replace(/[?!.,]+$/g, '');
  const patterns = [
    /^(?:please\s+)?(?:tell me|talk)\s+about\s+(.+)$/i,
    /^(?:please\s+)?what\s+(?:is|'s)\s+(.+)$/i,
    /^(?:please\s+)?whats\s+(.+)$/i,
    /^(?:please\s+)?what\s+do\s+you\s+know\s+about\s+(.+)$/i,
    /^(?:please\s+)?explain\s+(.+)$/i,
    /^(?:please\s+)?(?:recommend|suggest)\s+(?!something\b|anime\b|shows?\b)(.+)$/i,
    /^(?:please\s+)?how\s+many\s+episodes\s+(?:does|did)\s+(.+?)\s+have$/i,
    /^(?:please\s+)?how\s+many\s+episodes\s+(?:are|were)\s+(?:in|there in)\s+(.+)$/i,
    /^(?:please\s+)?(?:who|what studio)\s+(?:made|animated|produced)\s+(.+)$/i,
    /^(?:please\s+)?when\s+did\s+(.+?)\s+(?:air|release|come out)$/i,
    /^(?:please\s+)?is\s+(.+?)\s+(?:good|worth watching)$/i,
    /^(?:please\s+)?why\s+is\s+(.+?)\s+(?:good|popular|worth watching)$/i,
    /^(?:please\s+)?should\s+i\s+watch\s+(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      return {
        title: match[1].trim(),
        explicit: true
      };
    }
  }

  return { title: raw, explicit: false };
}

function itemTitleNames(item = {}) {
  return metadataTitleAliases(item)
    .map((value) => ({ value, normalized: norm(value), identity: parseTitleIdentity(value) }))
    .filter((entry) => entry.normalized);
}

function usableAnimeItem(item) {
  return Boolean(
    item
    && typeof item === 'object'
    && (item.title || item.officialTitle || item.canonicalTitle || item.name)
  );
}

function itemIdentityKeys(item = {}) {
  const keys = animeIdentityKeys(item);
  const rawId = item?.id;
  if (rawId !== undefined && rawId !== null && String(rawId).trim()) {
    keys.add(`id:${String(rawId).trim().toLowerCase()}`);
  }
  return keys;
}

function sharesIdentity(keys = new Set(), known = new Set()) {
  for (const key of keys) {
    if (known.has(key)) return true;
  }
  return false;
}

function exactLibraryTitleMatch(query = '', anime = [], catalog = []) {
  const normalized = norm(query);
  const canonical = parseTitleIdentity(query);
  const pool = [...(anime || []), ...(catalog || [])].filter(usableAnimeItem);

  const matches = pool.filter((item) =>
    itemTitleNames(item).some((entry) =>
      entry.normalized === normalized ||
      (canonical.key && entry.identity.key === canonical.key)
    )
  );

  return matches
    .sort((left, right) => {
      const leftOwned = (anime || []).includes(left) ? 1 : 0;
      const rightOwned = (anime || []).includes(right) ? 1 : 0;
      return rightOwned - leftOwned;
    })[0] || null;
}

function franchiseTitleMatches(query = '', anime = [], catalog = []) {
  const wanted = parseTitleIdentity(query);
  const wantedNormalized = norm(query);
  if (!wanted.base) return [];

  const pool = [...(anime || []), ...(catalog || [])].filter(usableAnimeItem);
  const seen = new Set();

  return pool.filter((item) => {
    const related = itemTitleNames(item).some((entry) => {
      if (entry.normalized === wantedNormalized) return false;
      if (entry.identity.base && entry.identity.base === wanted.base) return true;
      return wantedNormalized.length >= 4 && entry.normalized.startsWith(`${wantedNormalized} `);
    });
    const key = String(item.kitsuId || item.malId || item.id || item.officialTitle || item.title || '');
    if (!related || !key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

function findItemForGenomeCard(card = {}, anime = [], catalog = []) {
  const aliases = [card.id, card.title, ...(card.titles || []), ...(card.aliases || [])].filter(Boolean);
  for (const alias of aliases) {
    const match = exactLibraryTitleMatch(alias, anime, catalog);
    if (match) return match;
  }
  return null;
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
  const wantsMovie = /\b(movie|film)\b/.test(q);

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

  if (profile) {
    const compoundMovieRequest = wantsMovie && profile.id !== 'movie';
    return {
      ...profile,
      studio,
      format: wantsMovie ? 'movie' : null,
      label: compoundMovieRequest
        ? `${profile.id === 'emotional' ? 'Sad / emotional' : profile.label.replace(/^Something\s+/i, '')} anime movies`
        : profile.label
    };
  }

  return {
    id: 'studio',
    label: `Shows from ${studio}`,
    studio,
    format: wantsMovie ? 'movie' : null,
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
  if (intent.id === 'movie' || intent.format === 'movie') {
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
  const safeAnime = (Array.isArray(anime) ? anime : []).filter(usableAnimeItem);
  const safeCatalog = (Array.isArray(catalog) ? catalog : []).filter(usableAnimeItem);
  const ownedKeys = new Set(safeAnime.flatMap((item) => [...itemIdentityKeys(item)]));
  const pool = [];
  const poolKeys = new Set();

  // Recommendation cards are discovery candidates. Library titles can inform
  // scoring elsewhere, but they must never consume a visible recommendation slot.
  for (const item of safeCatalog) {
    const keys = itemIdentityKeys(item);
    if (sharesIdentity(keys, poolKeys)) continue;
    keys.forEach((key) => poolKeys.add(key));
    pool.push(item);
  }

  const scored = pool
    .filter((item) => intent.format !== 'movie' || /\b(movie|film)\b/i.test(String(item.type || '')))
    .filter((item) => {
      if (intent.id === 'movie' || intent.id === 'studio' || intent.mode === 'hiddenGems') return true;
      return (intent.keywords || []).some((keyword) => textBlob(item).includes(norm(keyword)));
    })
    .map((item) => {
      const owned = sharesIdentity(itemIdentityKeys(item), ownedKeys);
      const rawScore = scoreMoodItem(item, intent, false);
      const match = Math.max(60, Math.min(98, Math.round(rawScore + 45)));
      const tags = (intent.keywords || [])
        .filter((keyword) => textBlob(item).includes(norm(keyword)))
        .slice(0, 5);

      return {
        ...item,
        owned: false,
        bucket: 'discovery',
        match,
        tags: tags.length ? tags : (item.genres || []).slice(0, 4),
        blurb: moodBlurb(item, intent),
        deepDive: [
          `Mood request: ${intent.label}`,
          intent.format === 'movie' ? 'Format filter: anime movie' : '',
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

  const tierWeight = {
    gold: 8,
    core25: 6,
    enhanced: 4,
    core100: 3,
    modules: 2,
    generated: 0
  };

  const asList = (value) => Array.isArray(value) ? value : value ? [value] : [];

  const overlapScore = (sourceValues = [], targetValues = [], weight = 1) => {
    const source = new Set(asList(sourceValues).filter(Boolean).map(norm));
    return asList(targetValues).filter(Boolean).reduce((score, value) => (
      score + (source.has(norm(value)) ? weight : 0)
    ), 0);
  };

  const sourceVibes = sourceCard.vibes || {};

  const fallback = ACTIVE_GENOME_REGISTRY
    .filter((card) => card.id !== sourceCard.id)
    .map((card) => {
      let score = tierWeight[card.registryTier] || 0;
      score += overlapScore(sourceCard.viewerMotivations, card.viewerMotivations, 7);
      score += overlapScore(sourceCard.fantasyPillars, card.fantasyPillars, 6);
      score += overlapScore(sourceCard.themes, card.themes, 5);
      score += overlapScore(sourceCard.emotionalProfile, card.emotionalProfile, 4);
      score += overlapScore(sourceCard.atmosphere, card.atmosphere, 3);
      if (norm(sourceCard.domain) === norm(card.domain)) score += 8;
      if (norm(sourceCard.subdomain) === norm(card.subdomain)) score += 4;

      const vibeKeys = new Set([...Object.keys(sourceVibes), ...Object.keys(card.vibes || {})]);
      for (const vibe of vibeKeys) {
        const sourceValue = Number(sourceVibes[vibe] || 0);
        const targetValue = Number(card.vibes?.[vibe] || 0);
        if (sourceValue >= 6 && targetValue >= 6) {
          score += Math.max(0, 4 - Math.abs(sourceValue - targetValue) * 0.5);
        }
      }

      score += Math.max(0, Math.min(3, Number(card.confidence || 0) * 3));

      return { card, score };
    })
    .filter((entry) => entry.score >= 8)
    .sort((a, b) => b.score - a.score || title(a.card).localeCompare(title(b.card)))
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

function genomeCardToRecommendationItem(card = {}, index = 0, sourceCard = {}, anime = [], catalog = []) {
  const libraryItem = findItemForGenomeCard(card, anime, []);
  const catalogItem = libraryItem ? null : findItemForGenomeCard(card, [], catalog);
  const local = libraryItem || catalogItem;
  const name = title(card);
  const shared = sharedGenomeTags(sourceCard, card);
  const preferredIds = sourceCard.idealFollowUps || sourceCard.successors || [];
  const isPreferred = preferredIds.some((id) => norm(id) === norm(card.id) || norm(id) === norm(name));
  const baseMatch = isPreferred ? 98 : Math.max(82, 96 - index * 3);

  return {
    ...(local || {}),
    id: local?.id || card.id || name,
    kitsuId: local?.kitsuId || local?.kitsu_id || card.kitsuId,
    malId: local?.malId || local?.mal_id || card.malId,
    title: local?.title || name,
    officialTitle: local?.officialTitle || name,
    year: local?.year || card.year,
    episodes: local?.episodes || local?.episodeCount || card.episodes,
    episodeCount: local?.episodeCount || local?.episodes || card.episodeCount || card.episodes,
    studio: local?.studio || card.studio,
    studios: local?.studios || card.studios || (local?.studio || card.studio ? [local?.studio || card.studio] : []),
    cover: local?.cover || local?.poster || local?.posterUrl || local?.imageUrl || local?.image || card.cover || card.image,
    imageUrl: local?.imageUrl || local?.cover || local?.poster || local?.posterUrl || local?.image || card.imageUrl || card.cover || card.image,
    synopsis: local?.synopsis || local?.description || card.synopsis || card.description || '',
    communityScore: local?.communityScore || local?.malScore || card.communityScore || card.malScore,
    owned: Boolean(libraryItem),
    bucket: libraryItem ? 'library' : 'discovery',
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

function formatSimilarGenomeCards(sourceCard, anime = [], catalog = []) {
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
    items: related.map((card, index) => genomeCardToRecommendationItem(card, index, sourceCard, anime, catalog))
  };
}

function personalTitleFacts(item = {}) {
  const facts = [];
  const score = Number(item.joeScore ?? item.rating ?? 0);
  if (item.status) facts.push(`Your status: ${item.status}`);
  if (Number.isFinite(score) && score > 0) facts.push(`Your score: ${score.toFixed(1)}/10`);
  if (item.favorite) facts.push('You marked it as a favorite');
  if (Number(item.rewatches || 0) > 0) facts.push(`Rewatches: ${Number(item.rewatches)}×`);
  return facts;
}

function directMetadataLead(question = '', item = {}, name = 'This title') {
  if (/\bhow many episodes\b/i.test(question)) {
    const episodes = Number(item.episodeCount || item.episodes || 0);
    return episodes
      ? `${name} has ${episodes} episode${episodes === 1 ? '' : 's'} in this entry.`
      : `I know ${name}, but its episode count is missing from your local metadata.`;
  }

  if (/\b(?:who|what studio)\s+(?:made|animated|produced)\b/i.test(question)) {
    const studios = getAnimeStudios(item);
    return studios.length
      ? `${name} was produced by ${studios.join(', ')}.`
      : `I know ${name}, but its studio is missing from your local metadata.`;
  }

  if (/\bwhen did\b/i.test(question)) {
    return item.year
      ? `${name} is listed as a ${item.year} release.`
      : `I know ${name}, but its release year is missing from your local metadata.`;
  }

  return '';
}

function formatTitleGenomeAnswer(card, item = {}, question = '') {
  const name = title(card);
  const watchVerdict = /\b(?:should i watch|worth watching|why is .+ (?:good|popular))\b/i.test(question)
    ? `${name} is worth considering if ${[
        ...(card.viewerMotivations || []),
        ...(card.fantasyPillars || [])
      ].filter(Boolean).slice(0, 3).join(', ') || 'its core premise matches what you want right now'}.`
    : '';
  const directLead = watchVerdict || directMetadataLead(question, item, name);
  const lines = [
    `🧬 JoeAI Knows: ${name}`,
    '',
    directLead || card.signature || card.note || `${name} has a Genome profile.`
  ];

  if (directLead && (card.signature || card.note)) {
    lines.push('', card.signature || card.note);
  }

  const metadata = [
    item.year,
    item.type,
    Number(item.episodeCount || item.episodes || 0) > 0
      ? `${Number(item.episodeCount || item.episodes)} episodes`
      : '',
    ...getAnimeStudios(item)
  ].filter(Boolean);

  if (metadata.length) {
    lines.push('', `Details: ${metadata.join(' · ')}`);
  }

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

  const personal = personalTitleFacts(item);
  if (personal.length) {
    lines.push('', 'Your library:');
    lines.push(personal.map((fact) => `• ${fact}`).join('\n'));
  }

  return lines.join('\n');
}

function formatMetadataTitleAnswer(item = {}, question = '') {
  const name = item.officialTitle || item.title || 'This title';
  const lead = directMetadataLead(question, item, name);
  const synopsis = item.synopsis || item.description || '';
  const genres = getAnimeTasteSignals(item).slice(0, 6);
  const studios = getAnimeStudios(item);
  const details = [
    item.year,
    item.type,
    Number(item.episodeCount || item.episodes || 0) > 0
      ? `${Number(item.episodeCount || item.episodes)} episodes`
      : '',
    studios.length ? studios.join(', ') : ''
  ].filter(Boolean);
  const personal = personalTitleFacts(item);

  return [
    `🍜 JoeAI Knows: ${name}`,
    '',
    lead || synopsis || `${name} is in your local JoeAnimeDB knowledge.`,
    details.length ? `Details: ${details.join(' · ')}` : '',
    genres.length ? `Genres / signals: ${genres.join(', ')}` : '',
    personal.length ? '' : '',
    personal.length ? 'Your library:' : '',
    ...personal.map((fact) => `• ${fact}`)
  ].filter((line, index, lines) => line || (index > 0 && lines[index - 1])).join('\n');
}

function formatFranchiseClarification(query = '', matches = []) {
  return [
    `🍜 I recognize the ${query} franchise, but I do not want to guess the wrong entry.`,
    '',
    'I found:',
    ...matches.map((item) => `• ${item.officialTitle || item.title}`),
    '',
    `Ask using the exact season or title you mean. I will keep the original, sequels, movies, and alternate versions separate.`
  ].join('\n');
}

function formatUnknownTitle(query = '', offline = false) {
  if (offline) {
    return [
      `🍜 I do not have “${query}” in the local library, catalog, or Genome cards yet.`,
      '',
      'You appear to be offline, so I cannot verify its metadata right now. JoeAI and your library are still safe—try again when connected, use an alternate title, or add it and run Update Database later.'
    ].join('\n');
  }

  return [
    `🍜 I do not recognize “${query}” in the library, catalog, or Genome cards yet.`,
    '',
    'Try its official or alternate title. You can also add it to the Library; JoeAI will use the local entry immediately and metadata can be completed by Update Database.'
  ].join('\n');
}

function isBroadRecommendationDescription(question = '', query = '') {
  if (!/^\s*(?:please\s+)?(?:recommend|suggest)\b/i.test(question)) return false;
  return /\b(something|anime|shows?|dark(?:er)?|funny|comedy|romance|romantic|isekai|action|adventure|fantasy|horror|sports|mecha|sci[- ]?fi|emotional|cozy|comfort|hidden gems?|underrated|movies?|short|masterpiece|classic)\b/i.test(query);
}

export function routeJoeAITitleQuestion(question = '', anime = [], catalog = [], options = {}) {
  const parsed = cleanDirectTitleQuestion(question);
  const query = parsed.title;
  if (!query) return null;

  const item = exactLibraryTitleMatch(query, anime, catalog);
  const possibleCard = findGenomeCardByTitle(query);
  const cardNames = possibleCard
    ? [possibleCard.id, possibleCard.title, ...(possibleCard.titles || []), ...(possibleCard.aliases || [])]
    : [];
  const card = parsed.explicit || cardNames.some((name) => norm(name) === norm(query))
    ? possibleCard
    : null;

  if (card) {
    return {
      type: 'text',
      text: formatTitleGenomeAnswer(card, item || findItemForGenomeCard(card, anime, catalog) || {}, question)
    };
  }

  if (item) {
    return {
      type: 'text',
      text: formatMetadataTitleAnswer(item, question)
    };
  }

  const franchiseMatches = franchiseTitleMatches(query, anime, catalog);
  if (franchiseMatches.length) {
    return {
      type: 'text',
      text: formatFranchiseClarification(query, franchiseMatches)
    };
  }

  if (isBroadRecommendationDescription(question, query)) return null;
  if (!parsed.explicit) return null;

  const offline = options.offline ?? (
    typeof navigator !== 'undefined' &&
    navigator.onLine === false
  );

  return {
    type: 'text',
    text: formatUnknownTitle(query, offline)
  };
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
    if (sourceCard) return formatSimilarGenomeCards(sourceCard, anime, catalog);

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
  const titleAnswer = routeJoeAITitleQuestion(question, anime, catalog);
  if (titleAnswer) return titleAnswer;

  const card = findGenomeCardByTitle(question) || mentionedGenomeCard(question);
  if (card) {
    return {
      type: 'text',
      text: formatTitleGenomeAnswer(card, findItemForGenomeCard(card, anime, catalog) || {}, question)
    };
  }

  // 3. Mood/vibe requests only happen after known-title lookup fails.
  // Example: "I want horror" should still mean horror recommendations.
  const intent = maybeGenomeIntentRecommendation(question);
  if (intent) return intent;

  // 4. Existing Knowledge/Genome pipeline for any remaining recommendation wording.
  const smart = maybeKnowledgeFirstRecommendation(question, anime, catalog);
  if (smart && !/^I heard:.+could not find/i.test(smart)) return smart;

  return null;
}
