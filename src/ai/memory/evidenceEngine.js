import { normalizeText, titleOf } from './memoryTypes';

const DIMENSION_KEYWORDS = {
  worldbuilding: ['worldbuilding', 'world building', 'world', 'adventure', 'fantasy', 'isekai', 'kingdom', 'civilization', 'lore', 'setting'],
  foundFamily: ['found family', 'family', 'friendship', 'friends', 'crew', 'community', 'companions', 'team', 'guild'],
  kingdomBuilding: ['kingdom', 'nation', 'city', 'village', 'civilization', 'leadership', 'building', 'politics', 'empire'],
  optimisticHeroes: ['optimistic', 'hopeful', 'feel good', 'kindness', 'hero', 'protecting', 'friendship', 'community', 'warm'],
  longRunning: ['long running', 'long-form', 'shonen', 'adventure', 'journey', 'saga'],
  strategicBattles: ['strategy', 'tactics', 'war', 'military', 'battle', 'politics', 'mind games', 'campaign'],
  politics: ['politics', 'political', 'kingdom', 'war', 'military', 'leadership', 'empire', 'faction'],
  supernaturalCombat: ['supernatural', 'spirit', 'demon', 'curse', 'magic', 'sword', 'combat', 'battle', 'soul'],
  powerFantasy: ['power fantasy', 'overpowered', 'op protagonist', 'power', 'strong', 'leveling', 'magic', 'bankai'],
  comedy: ['comedy', 'funny', 'gag', 'absurd', 'parody', 'hilarious'],
  psychological: ['psychological', 'mind games', 'trauma', 'mystery', 'thriller', 'despair'],
  horror: ['horror', 'scary', 'creepy', 'gory', 'violent', 'body horror'],
  sports: ['sports', 'competition', 'training', 'rivalry', 'team', 'match'],
  romance: ['romance', 'romantic', 'love', 'relationship', 'dating'],
  sliceOfLife: ['slice of life', 'school', 'daily life', 'cozy', 'relaxing', 'chill'],
  mecha: ['mecha', 'robot', 'gundam', 'pilot']
};

function itemText(item = {}) {
  return normalizeText([
    item.title,
    item.officialTitle,
    item.synopsis,
    item.description,
    item.studio,
    item.domain,
    item.subdomain,
    ...(item.genres || []),
    ...(item.themes || []),
    ...(item.viewerMotivations || []),
    ...(item.fantasyPillars || []),
    ...(item.tags || [])
  ].filter(Boolean).join(' '));
}

function episodeWeight(item = {}) {
  const episodes = Number(item.episodes || item.episodeCount || 0);
  if (episodes >= 200) return 4;
  if (episodes >= 100) return 3;
  if (episodes >= 50) return 2;
  if (episodes >= 24) return 1;
  return 0;
}

function ratingWeight(item = {}) {
  const rating = Number(item.joeScore || item.score || item.finalScore || item.rating || 0);
  if (rating >= 9.5) return 6;
  if (rating >= 9) return 5;
  if (rating >= 8) return 3;
  if (rating > 0 && rating < 6) return -2;
  return 0;
}

function statusWeight(item = {}) {
  const status = String(item.status || '').toLowerCase();
  if (status === 'completed') return 4;
  if (status === 'watching') return 2;
  if (status.includes('plan')) return 0.5;
  if (status === 'dropped') return -5;
  return 0;
}

function rewatchWeight(item = {}) {
  const rewatches = Number(item.rewatches || 0);
  if (!rewatches) return 0;
  return Math.min(12, rewatches * 3);
}

function favoriteWeight(item = {}) {
  return item.favorite ? 7 : 0;
}

export function evidenceForDimension(library = [], dimension) {
  const keywords = DIMENSION_KEYWORDS[dimension] || [];
  const evidence = [];

  for (const item of library || []) {
    const text = itemText(item);
    const matched = keywords.filter((keyword) => text.includes(normalizeText(keyword)));
    if (!matched.length) continue;

    const rating = Number(item.joeScore || item.score || item.finalScore || item.rating || 0);
    const rewatches = Number(item.rewatches || 0);
    const keywordWeight = matched.length * 1.7;
    const preferenceWeight = statusWeight(item) + ratingWeight(item) + rewatchWeight(item) + favoriteWeight(item) + episodeWeight(item);
    const weight = Math.max(0.5, keywordWeight + preferenceWeight);

    evidence.push({
      title: titleOf(item),
      matchedKeywords: matched.slice(0, 6),
      status: item.status || '',
      rating: rating || null,
      rewatches,
      favorite: Boolean(item.favorite),
      episodes: Number(item.episodes || item.episodeCount || 0) || null,
      weight: Math.round(weight * 10) / 10,
      signals: {
        keywords: Math.round(keywordWeight * 10) / 10,
        status: statusWeight(item),
        rating: ratingWeight(item),
        rewatches: rewatchWeight(item),
        favorite: favoriteWeight(item),
        episodes: episodeWeight(item)
      }
    });
  }

  return evidence.sort((a, b) => b.weight - a.weight).slice(0, 12);
}

export function buildEvidenceMap(library = [], dimensions = []) {
  return Object.fromEntries(dimensions.map((dimension) => [dimension, evidenceForDimension(library, dimension)]));
}
