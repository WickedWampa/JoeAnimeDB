import './joeAIResultsRuntime';
import { buildAnimeDNA, dnaSimilarity, topDnaTraits, labelTrait } from './animeDNA';
import { buildPersonalityRecommendationText } from './joeAIPersonalityEngine';
import { findKnowledgeProfile } from './animeKnowledgeBase';
import { sameFranchise, enrichAnimeKnowledge } from './knowledge/knowledgeRegistry';
import { compareGenome } from './genome/genomeEngine';
import { findGenomeCardFromRegistry as findGenomeCard } from './genome/genomeRegistry';
import { maybeGenomeIntentRecommendation } from './joeAIIntentEngine';
function norm(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function titleNorm(value = '') {
  let normalized = String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

  const numberWords = {
    zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
    six: '6', seven: '7', eight: '8', nine: '9', ten: '10'
  };
  for (const [word, digit] of Object.entries(numberWords)) {
    normalized = normalized.replace(new RegExp(`\\b${word}\\b`, 'g'), digit);
  }
  return normalized;
}

const COMMON_TITLE_ALIASES = new Map([
  ['aot', 'attack on titan'],
  ['snk', 'shingeki no kyojin'],
  ['fmab', 'fullmetal alchemist brotherhood'],
  ['fma brotherhood', 'fullmetal alchemist brotherhood'],
  ['jjk', 'jujutsu kaisen'],
  ['sao', 'sword art online'],
  ['opm', 'one punch man'],
  ['mha', 'my hero academia'],
  ['bnha', 'my hero academia'],
  ['dbz', 'dragon ball z'],
  ['dbs', 'dragon ball super'],
  ['hxh', 'hunter x hunter'],
  ['rezero', 're zero starting life in another world'],
  ['re zero', 're zero starting life in another world'],
  ['slime', 'that time i got reincarnated as a slime']
]);

function queryTitleVariants(value = '') {
  const normalized = titleNorm(value);
  if (!normalized) return [];

  const variants = new Set([normalized]);
  const compactKey = normalized.replace(/\s+/g, '');
  const alias = COMMON_TITLE_ALIASES.get(normalized) || COMMON_TITLE_ALIASES.get(compactKey);
  if (alias) variants.add(titleNorm(alias));

  // People commonly call the original entry "season 1" even when the
  // catalog title has no season suffix. Do not strip later seasons because
  // those should remain distinct franchise entries.
  const seasonOneBase = normalized
    .replace(/\s+(?:season\s*1|s1|part\s*1|cour\s*1)$/, '')
    .trim();
  if (seasonOneBase && seasonOneBase !== normalized) {
    variants.add(seasonOneBase);
    const seasonAlias = COMMON_TITLE_ALIASES.get(seasonOneBase)
      || COMMON_TITLE_ALIASES.get(seasonOneBase.replace(/\s+/g, ''));
    if (seasonAlias) variants.add(titleNorm(seasonAlias));
  }

  return [...variants];
}

function keyFor(item = {}) {
  return String(item.malId || item.id || item.title || '');
}

function identityKey(item = {}) {
  const title = withoutLeadingArticle(item.officialTitle || item.title || item.englishTitle || '');
  return title ? `title:${title}` : `id:${keyFor(item)}`;
}

function allTitles(anime = {}) {
  return [anime.title, anime.officialTitle, anime.japaneseTitle, ...(anime.titleSynonyms || [])].filter(Boolean);
}

function withoutLeadingArticle(value = '') {
  return titleNorm(value).replace(/^(?:the|a|an)\s+/, '');
}

function compact(value = '') {
  return titleNorm(value).replace(/\s+/g, '');
}

function levenshtein(left = '', right = '') {
  const a = String(left || '');
  const b = String(right || '');
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function titleNameScore(title = '', query = '') {
  const t = titleNorm(title);
  const q = titleNorm(query);
  if (!t || !q) return 0;
  if (t === q) return 100;

  const ta = withoutLeadingArticle(t);
  const qa = withoutLeadingArticle(q);
  if (ta && qa && ta === qa && Math.min(ta.length, qa.length) >= 4) return 98;

  const tc = compact(t);
  const qc = compact(q);
  if (tc === qc && Math.min(tc.length, qc.length) >= 5) return 97;

  const shorter = Math.min(t.length, q.length);
  const longer = Math.max(t.length, q.length);
  const lengthRatio = longer ? shorter / longer : 0;
  if (shorter >= 6 && lengthRatio >= 0.65 && (t.startsWith(q) || q.startsWith(t))) return 92;
  if (shorter >= 6 && lengthRatio >= 0.70 && (t.includes(q) || q.includes(t))) return 88;

  const qTokens = qa.split(' ').filter((token) => token.length >= 2);
  const tTokens = ta.split(' ').filter((token) => token.length >= 2);
  if (qTokens.length >= 2 && tTokens.length >= 2) {
    const tSet = new Set(tTokens);
    const overlap = qTokens.filter((token) => tSet.has(token)).length;
    const coverage = overlap / qTokens.length;
    const precision = overlap / tTokens.length;
    if (coverage === 1 && precision >= 0.6) return 90;
    if (coverage >= 0.8 && precision >= 0.6) return 84;
  }

  if (Math.min(qa.length, ta.length) >= 5 && Math.abs(qa.length - ta.length) <= 2) {
    const distance = levenshtein(qa, ta);
    if (distance === 1) return 95;
    if (distance === 2 && Math.max(qa.length, ta.length) >= 7) return 89;
  }

  return 0;
}

function titleMatchScore(anime = {}, query = '') {
  const variants = queryTitleVariants(query);
  if (!variants.length) return 0;

  return allTitles(anime).reduce((best, title) => {
    const score = variants.reduce(
      (variantBest, variant) => Math.max(variantBest, titleNameScore(title, variant)),
      0
    );
    return Math.max(best, score);
  }, 0);
}

export function resolveKnowledgeSource(query = '', anime = [], catalog = []) {
  const ranked = [
    ...(anime || []).map((item, index) => ({ item, score: titleMatchScore(item, query), owned: 1, index })),
    ...(catalog || []).map((item, index) => ({ item, score: titleMatchScore(item, query), owned: 0, index }))
  ]
    .filter((entry) => entry.score >= 80)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.owned !== left.owned) return right.owned - left.owned;
      return left.index - right.index;
    });

  return ranked[0]?.item || null;
}

function cleanSimilarityTitle(value = '') {
  return String(value || '')
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/\s+(?:but|preferably|ideally)\s+(?=(?:darker|lighter|funnier|more serious|more action|more fantasy|more romance|more emotional|shorter|longer|newer|older|less violent|more violent|no romance|without romance|under|fewer than|less than|at most|max(?:imum)?|\d+\s*(?:episodes?|eps?)|a\s+(?:movie|film)|not\s+a\s+(?:movie|film))\b)[\s\S]*$/i, '')
    .replace(/\s+(?:but\s+not|without|minus)\s+(?:romance|comedy|horror|gore|violence|fanservice|fan service)[\s\S]*$/i, '')
    .replace(/\s+with\s+(?=(?:under|fewer than|less than|at most|max(?:imum)?|\d+\s*(?:episodes?|eps?))\b)[\s\S]*$/i, '')
    .replace(/\s+(?=(?:under|fewer than|less than|at most|max(?:imum)?\s+\d+|\d+\s*(?:episodes?|eps?)|shorter|darker|funnier|more action|more fantasy|more romance|more emotional|more mature|without romance|no romance)\b)[\s\S]*$/i, '')
    .replace(/[?.!]+$/g, '')
    .trim();
}

function extractSimilarityTitle(question = '') {
  const raw = String(question || '').trim();

  const patterns = [
    /similar\s+to\s+(.+?)[?.!]*$/i,
    /(?:same|similar)\s+(?:vibe|energy|feel)\s+(?:as|to)\s+(.+?)[?.!]*$/i,
    /(?:something|anything|stuff)\s+(?:else\s+)?like\s+(.+?)[?.!]*$/i,
    /(?:show|shows|anime)\s+like\s+(.+?)[?.!]*$/i,
    /(?:more|another)\s+(?:show|anime|one|thing)?\s*like\s+(.+?)[?.!]*$/i,
    /(?:anything|something)\s+(?:close|similar)\s+to\s+(.+?)[?.!]*$/i,
    /what(?:'s|\s+is)\s+like\s+(.+?)[?.!]*$/i,
    /(?:got|have)\s+(?:you\s+)?(?:anything|something)\s+like\s+(.+?)[?.!]*$/i,
    /show\s+me\s+something\s+like\s+(.+?)[?.!]*$/i,
    /what\s+should\s+i\s+watch\s+after\s+(.+?)[?.!]*$/i,
    /what\s+(?:do|should)\s+i\s+watch\s+next\s+after\s+(.+?)[?.!]*$/i,
    /(?:i\s+)?(?:liked|loved|really liked|really loved)\s+(.+?)(?:,|\s+—|\s+-)?\s*(?:what\s+(?:next|else)|what\s+should\s+i\s+watch|give\s+me\s+more|recommend\s+me\s+something)[?.!]*$/i,
    /if\s+i\s+(?:liked|loved)\s+(.+?)(?:,|\s+what\s+(?:else|should)|\s+give\s+me|\s+recommend\s+me)[\s\S]*$/i
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return cleanSimilarityTitle(match[1]);
  }

  const lowered = raw.toLowerCase();
  const lastLike = lowered.lastIndexOf(' like ');
  if (lastLike !== -1) return cleanSimilarityTitle(raw.slice(lastLike + 6));

  return '';
}

function itemPreferenceBlob(item = {}) {
  return titleNorm([
    item.title,
    item.officialTitle,
    item.type,
    item.format,
    item.synopsis,
    item.description,
    ...(item.genres || []),
    ...(item.themes || []),
    ...(item.tags || [])
  ].filter(Boolean).join(' '));
}

function parseEpisodeLimit(question = '') {
  const raw = String(question || '');
  const under = raw.match(/\b(?:under|fewer than|less than)\s+(\d+)\s*(?:episodes?|eps?)\b/i);
  if (under) return Math.max(1, Number(under[1]) - 1);
  const atMost = raw.match(/\b(?:at most|max(?:imum)?(?: of)?)\s*(\d+)\s*(?:episodes?|eps?)\b/i)
    || raw.match(/\b(\d+)\s*(?:episodes?|eps?)\s*(?:or less|max(?:imum)?|at most)\b/i);
  if (atMost) return Number(atMost[1]);
  return 0;
}

function parseSimilarityPreferences(question = '', sourceQuery = '') {
  const raw = String(question || '');
  let preferenceText = raw;
  const source = String(sourceQuery || '').trim();
  if (source) {
    const index = raw.toLocaleLowerCase().indexOf(source.toLocaleLowerCase());
    if (index !== -1) {
      preferenceText = `${raw.slice(0, index)} ${raw.slice(index + source.length)}`;
    }
  }
  const q = titleNorm(preferenceText);
  const positive = [];
  const negative = [];

  const profiles = [
    { test: /\b(?:dark|darker|gritty|violent|brutal|gory|scarier|creepier)\b/i, label: 'darker tone', keywords: ['dark', 'horror', 'thriller', 'psychological', 'seinen', 'gore', 'violence', 'survival', 'supernatural'] },
    { test: /\b(?:funny|funnier|more comedy|more comedic|lighter)\b/i, label: 'more comedy', keywords: ['comedy', 'parody', 'funny', 'absurd', 'lighthearted', 'gag'] },
    { test: /\b(?:more action|more fights?|more combat|more hype)\b/i, label: 'more action', keywords: ['action', 'battle', 'combat', 'fighting', 'shounen', 'shonen'] },
    { test: /\b(?:more fantasy|more magic|more magical)\b/i, label: 'more fantasy', keywords: ['fantasy', 'magic', 'magical', 'adventure', 'isekai'] },
    { test: /\b(?:more emotional|sadder|more drama|more dramatic|make me cry)\b/i, label: 'more emotional', keywords: ['drama', 'emotional', 'tragedy', 'romance', 'family', 'friendship'] },
    { test: /\b(?:more romance|more romantic)\b/i, label: 'more romance', keywords: ['romance', 'romantic', 'relationship'] },
    { test: /\b(?:more mature|more adult|less childish)\b/i, label: 'more mature', keywords: ['seinen', 'josei', 'psychological', 'crime', 'thriller', 'adult'] }
  ];
  for (const profile of profiles) {
    if (profile.test.test(preferenceText)) positive.push(profile);
  }

  const avoidProfiles = [
    { test: /\b(?:no|not|without|less)\s+(?:romance|romantic stuff)\b/i, label: 'less romance', keywords: ['romance', 'romantic'] },
    { test: /\b(?:no|without|less)\s+(?:gore|violence|violent stuff)\b/i, label: 'less violence', keywords: ['gore', 'violence', 'violent', 'brutal'] },
    { test: /\b(?:no|without)\s+(?:fanservice|fan service)\b/i, label: 'less fanservice', keywords: ['fanservice', 'ecchi'] },
    { test: /\b(?:no|without|less)\s+(?:comedy|jokes?)\b/i, label: 'less comedy', keywords: ['comedy', 'parody', 'gag'] }
  ];
  for (const profile of avoidProfiles) {
    if (profile.test.test(preferenceText)) negative.push(profile);
  }

  return {
    positive,
    negative,
    maxEpisodes: parseEpisodeLimit(preferenceText),
    wantsMovie: /\b(?:movie|film)\b/i.test(preferenceText) && !/\b(?:not|no)\s+(?:a\s+)?(?:movie|film)\b/i.test(preferenceText),
    avoidMovie: /\b(?:not|no)\s+(?:a\s+)?(?:movie|film)\b/i.test(preferenceText),
    preferShorter: /\b(?:shorter|short|quick|one cour)\b/i.test(preferenceText),
    preferNewer: /\b(?:newer|recent|modern)\b/i.test(preferenceText),
    preferOlder: /\b(?:older|classic|old school|old-school)\b/i.test(preferenceText),
    raw: q
  };
}

function itemIsMovie(item = {}) {
  return /\b(?:movie|film)\b/i.test(String(item.type || item.format || ''))
    || Number(item.episodeCount || item.episodes || 0) === 1;
}

function recommendationReleaseState(item = {}) {
  const status = [
    item.airingStatus,
    item.releaseStatus,
    item.status,
    item.discoverBucket,
    item.discoverSource,
    item.catalogSource
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const explicitlyFuture = /\b(?:upcoming|unreleased|tba|not yet released|coming soon)\b/.test(status);
  if (explicitlyFuture) return 'future';

  const rawStart = item.startDate || item.airedFrom || item.releaseDate || '';
  if (rawStart) {
    const start = new Date(rawStart);
    if (!Number.isNaN(start.getTime())) {
      // Give same-day releases the benefit of the doubt. We only want to
      // block titles that are clearly still in the future.
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (start.getTime() > today.getTime()) return 'future';
    }
  }

  return 'released';
}

export function isReleasedRecommendationCandidate(item = {}) {
  return recommendationReleaseState(item) !== 'future';
}

function preferenceFit(item = {}, preferences = {}) {
  const blob = itemPreferenceBlob(item);
  const episodes = Number(item.episodeCount || item.episodes || 0);
  const year = Number(item.year || 0);
  let adjustment = 0;
  const reasons = [];

  if (preferences.maxEpisodes) {
    if (!episodes || episodes > preferences.maxEpisodes) return { allowed: false, adjustment: 0, reasons: [] };
    adjustment += 0.06;
    reasons.push(`${preferences.maxEpisodes} episodes or fewer`);
  }
  if (preferences.wantsMovie && !itemIsMovie(item)) return { allowed: false, adjustment: 0, reasons: [] };
  if (preferences.avoidMovie && itemIsMovie(item)) return { allowed: false, adjustment: 0, reasons: [] };

  for (const profile of preferences.positive || []) {
    const hits = profile.keywords.filter((keyword) => blob.includes(titleNorm(keyword))).length;
    if (hits) {
      adjustment += Math.min(0.12, 0.035 * hits);
      reasons.push(profile.label);
    }
  }
  for (const profile of preferences.negative || []) {
    const hits = profile.keywords.filter((keyword) => blob.includes(titleNorm(keyword))).length;
    if (hits) adjustment -= Math.min(0.16, 0.055 * hits);
    else adjustment += 0.015;
  }

  if (preferences.preferShorter && episodes) {
    if (episodes <= 13) {
      adjustment += 0.08;
      reasons.push('short binge');
    } else if (episodes <= 24) {
      adjustment += 0.04;
    } else if (episodes > 50) {
      adjustment -= 0.06;
    }
  }
  if (preferences.preferNewer && year) {
    if (year >= 2018) {
      adjustment += 0.05;
      reasons.push('newer release');
    } else if (year < 2010) adjustment -= 0.03;
  }
  if (preferences.preferOlder && year) {
    if (year <= 2012) {
      adjustment += 0.05;
      reasons.push('older-school pick');
    } else if (year >= 2020) adjustment -= 0.03;
  }

  return { allowed: true, adjustment, reasons: [...new Set(reasons)] };
}

function boostForKnowledge(source = {}, candidate = {}) {
  const found = findKnowledgeProfile(source);
  if (!found) return { boost: 0, reason: '' };
  const profile = found.profile;
  const candidateTitle = norm(`${candidate.title || ''} ${candidate.officialTitle || ''}`);
  const matches = profile.bestMatches || {};

  for (const [title, reason] of Object.entries(matches)) {
    const needle = norm(title);
    if (!needle || !candidateTitle) continue;
    if (candidateTitle.includes(needle) || needle.includes(candidateTitle)) {
      return { boost: 0.42, reason };
    }
  }

  return { boost: 0, reason: '' };
}
function explainOverlap(sourceDna, candidateDna) {
  const sourceTraits = topDnaTraits(sourceDna, 14);
  const candidateTraits = new Set(topDnaTraits(candidateDna, 16).map((trait) => trait.key));

  return sourceTraits
    .filter((trait) => candidateTraits.has(trait.key))
    .slice(0, 6)
    .map((trait) => labelTrait(trait.key));
}
function buildCandidate({ source, item, anime, sourceDna, preferences = {} }) {
  // SPRINT5_GENOME_SCORING
  const candidateDna = buildAnimeDNA(item);
  const dnaScore = dnaSimilarity(sourceDna, candidateDna);
  const sourceGenome = findGenomeCard(source);
  const candidateGenome = findGenomeCard(item);
  const genome = sourceGenome && candidateGenome ? compareGenome(sourceGenome, candidateGenome) : null;
  const knowledge = boostForKnowledge(source, item);
  const preference = preferenceFit(item, preferences);
  if (!preference.allowed) return null;

  const baseMatch = Math.max(dnaScore + knowledge.boost, genome ? genome.score : 0);
  const match = Math.min(0.99, Math.max(0, baseMatch + preference.adjustment));
  const itemIdentity = identityKey(item);
  const owned = anime.some((ownedItem) => keyFor(ownedItem) === keyFor(item) || identityKey(ownedItem) === itemIdentity);
  const reasons = explainOverlap(sourceDna, candidateDna);
  if (genome?.reasons?.length) {
    reasons.unshift(...genome.reasons.slice(0, 3));
  }
  if (preference.reasons.length) {
    reasons.unshift(...preference.reasons);
  }

  return {
    item,
    match,
    dnaScore,
    knowledgeBoost: knowledge.boost,
    knowledgeReason: knowledge.reason,
    preferenceAdjustment: preference.adjustment,
    preferenceReasons: preference.reasons,
    reasons: [...new Set(reasons.filter(Boolean))],
    owned
  };
}

export function recommendKnowledgeFirst({ query = '', anime = [], catalog = [], limit = 8, request = '' }) {
  const source = resolveKnowledgeSource(query, anime, catalog);

  if (!source) {
    return {
      found: false,
      text: `I couldn’t confidently match “${query}” in your library or catalog. Try the full title or a common alternate title.`
    };
  }

  const sourceDna = buildAnimeDNA(source);
  const enrichedSource = enrichAnimeKnowledge(source);
  const preferences = parseSimilarityPreferences(request, query);

  const sourceIdentity = identityKey(source);
  const pool = [...catalog, ...anime]
    // Recommendations should be watchable now. Upcoming / TBA catalog rows
    // stay available for direct questions and the Coming Soon UI, but they do
    // not belong in "what should I watch next?" results.
    .filter((item) => isReleasedRecommendationCandidate(item))
    // SPRINT4_EXCLUDE_SAME_FRANCHISE
    .filter((item) => keyFor(item) !== keyFor(source) && identityKey(item) !== sourceIdentity)
    .filter((item) => !sameFranchise(enrichedSource, item))
    .filter((item, index, arr) => arr.findIndex((other) => identityKey(other) === identityKey(item)) === index);
  const hasExplicitPreference = Boolean(
    preferences.positive?.length
      || preferences.negative?.length
      || preferences.maxEpisodes
      || preferences.wantsMovie
      || preferences.avoidMovie
      || preferences.preferShorter
      || preferences.preferNewer
      || preferences.preferOlder
  );

  const scored = pool
    .map((item) => buildCandidate({ source, item, anime, sourceDna, preferences }))
    .filter(Boolean)
    .filter((entry) => entry.match > 0.35 || entry.knowledgeBoost > 0)
    .sort((a, b) => {
      // When the user explicitly says darker, funnier, shorter, etc., obey
      // that request before falling back to the general similarity score.
      // Otherwise a very similar but wrong-tone title can outrank the thing
      // the user actually asked for.
      if (hasExplicitPreference && b.preferenceAdjustment !== a.preferenceAdjustment) {
        return b.preferenceAdjustment - a.preferenceAdjustment;
      }
      if (b.match !== a.match) return b.match - a.match;
      return b.knowledgeBoost - a.knowledgeBoost;
    });

  const inLibrary = scored.filter((entry) => entry.owned).slice(0, Math.ceil(limit / 2));
  const discoveries = scored.filter((entry) => !entry.owned).slice(0, limit);
  return {
    found: true,
    source,
    preferences,
    inLibrary,
    discoveries,
    text: buildPersonalityRecommendationText({ source, inLibrary, discoveries })
  };
}


function metaLabel(item = {}) {
  return [item.year, item.studio, item.episodeCount ? `${item.episodeCount} eps` : null, item.communityScore ? `MAL ${item.communityScore}` : null]
    .filter(Boolean)
    .join(' · ');
}
function cleanReasonLabel(value = '') {
  let label = String(value || '').trim();
  if (!label) return '';
  label = label
    .replace(/^matches\s+/i, '')
    .replace(/,?\s+which your feedback has reinforced\.?$/i, '')
    .replace(/^gold genome match$/i, 'Anime DNA match')
    .replace(/^shared anime dna$/i, 'Anime DNA overlap')
    .replace(/[.!]+$/g, '')
    .trim();
  if (!label || label.length > 48 || /^(curated knowledge match)$/i.test(label)) return '';
  return label;
}

function conciseSentence(value = '', max = 230) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text || text.length <= max) return text;
  const clipped = text.slice(0, max - 1).replace(/\s+\S*$/, '').trim();
  return `${clipped}…`;
}

function shortRecommendationBlurb(source = {}, item = {}, entry = {}) {
  const sourceTitle = source.officialTitle || source.title || 'that anime';
  const itemTitle = item.officialTitle || item.title || 'This pick';
  if (entry.knowledgeReason) return conciseSentence(entry.knowledgeReason);

  const preferenceReasons = (entry.preferenceReasons || []).filter(Boolean);
  const cleanReasons = (entry.reasons || [])
    .map(cleanReasonLabel)
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, 3);

  if (preferenceReasons.length) {
    return `${itemTitle} keeps the connection to ${sourceTitle} while leaning into ${preferenceReasons.slice(0, 2).join(' and ')} like you asked.`;
  }
  if (cleanReasons.length >= 2) {
    return `${itemTitle} overlaps with ${sourceTitle} on ${cleanReasons[0]} and ${cleanReasons[1]}, without just feeling like the same show again.`;
  }
  if (cleanReasons.length === 1) {
    return `${itemTitle} connects to ${sourceTitle} through ${cleanReasons[0]}, so it should scratch part of the same itch.`;
  }

  return `${itemTitle} lands close to ${sourceTitle} in JoeAI’s taste model, but takes the idea somewhere different.`;
}

function cardFromEntry(entry, source, bucket = 'discovery', index = 0) {
  const item = entry.item || entry;
  const pct = Math.round(Number(entry.match || 0) * 100);
  const reasons = (entry.reasons || []).filter(Boolean).slice(0, 6);
  const title = item.officialTitle || item.title || 'Unknown title';
  const score = Math.max(0, Math.min(99, pct || 0));
  const reasonTags = reasons
    .map(cleanReasonLabel)
    .filter(Boolean)
    .filter((value, tagIndex, all) => all.indexOf(value) === tagIndex)
    .slice(0, 4);
  const fallbackTags = (item.genres || []).filter(Boolean).slice(0, 4);
  const tags = reasonTags.length ? reasonTags : fallbackTags;
  const deepReasons = reasons.length
    ? reasons.slice(0, 5).map((reason) => `• ${reason}`).join('\n')
    : '• Strong overall Anime DNA overlap';

  return {
    id: item.id || item.malId || title,
    title,
    officialTitle: item.officialTitle || item.title || title,
    match: score,
    rank: index + 1,
    bucket,
    owned: Boolean(entry.owned || bucket === 'library'),
    year: item.year,
    studio: item.studio,
    episodes: item.episodes || item.episodeCount,
    episodeCount: item.episodeCount || item.episodes,
    communityScore: item.communityScore,
    malScore: item.malScore,
    cover: item.cover,
    genres: item.genres || [],
    synopsis: item.synopsis || '',
    trailerUrl: item.trailerUrl || '',
    reasons,
    tags,
    meta: metaLabel(item),
    blurb: shortRecommendationBlurb(source, item, entry),
    deepDive: [
      `${title} made the cut because:`,
      '',
      deepReasons,
      entry.knowledgeReason ? `JoeAI note: ${entry.knowledgeReason}` : '',
      entry.dnaScore ? `Anime DNA overlap: ${Math.round(entry.dnaScore * 100)}%` : '',
      entry.preferenceReasons?.length ? `Your extra preference: ${entry.preferenceReasons.join(', ')}` : ''
    ].filter(Boolean).join('\n')
  };
}

export function buildRecommendationCardsResult({ source, inLibrary = [], discoveries = [], text = '' }) {
  const sourceTitle = source?.officialTitle || source?.title || 'that anime';
  // Recommendation cards are for discovery. Library titles still inform scoring,
  // but should not consume visible recommendation slots.
  const discoveryCards = (discoveries || []).map((entry, index) => cardFromEntry(entry, source, 'discovery', index));
  const cards = discoveryCards.slice(0, 8);
  return {
    type: 'recommendationCards',
    title: `🍜 Because you like ${sourceTitle}`,
    subtitle: cards.length
      ? `Closest matches first. Hit “Why?” if you want the reasoning behind a pick.`
      : `I found ${sourceTitle}, but none of the current local candidates cleared JoeAI’s confidence bar.`,
    sourceTitle,
    source,
    items: cards,
    fullAnalysis: text
  };
}


export function maybeKnowledgeFirstRecommendation(question = '', anime = [], catalog = []) {
  const title = extractSimilarityTitle(question);
  if (!title) {
    return maybeGenomeIntentRecommendation(question);
  }

  const result = recommendKnowledgeFirst({ query: title, anime, catalog, request: question });
  if (!result.found) return result.text;
  return buildRecommendationCardsResult(result);
}
