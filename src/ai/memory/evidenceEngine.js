import { normalizeText } from './memoryTypes';

const DIMENSION_KEYWORDS = {
  worldbuilding: ['worldbuilding', 'world building', 'world', 'adventure', 'fantasy', 'isekai', 'kingdom', 'civilization'],
  foundFamily: ['found family', 'family', 'friendship', 'friends', 'crew', 'community', 'companions', 'team'],
  kingdomBuilding: ['kingdom', 'nation', 'city', 'village', 'civilization', 'leadership', 'building', 'politics'],
  optimisticHeroes: ['optimistic', 'hopeful', 'feel good', 'kindness', 'hero', 'protecting', 'friendship', 'community'],
  longRunning: ['long running', 'long-form', 'shonen', 'adventure', 'journey'],
  strategicBattles: ['strategy', 'tactics', 'war', 'military', 'battle', 'politics', 'mind games'],
  politics: ['politics', 'political', 'kingdom', 'war', 'military', 'leadership', 'empire'],
  supernaturalCombat: ['supernatural', 'spirit', 'demon', 'curse', 'magic', 'sword', 'combat', 'battle'],
  powerFantasy: ['power fantasy', 'overpowered', 'op protagonist', 'power', 'strong', 'leveling', 'magic'],
  comedy: ['comedy', 'funny', 'gag', 'absurd', 'parody', 'hilarious'],
  psychological: ['psychological', 'mind games', 'trauma', 'mystery', 'thriller', 'despair'],
  horror: ['horror', 'scary', 'creepy', 'gory', 'violent', 'body horror'],
  sports: ['sports', 'competition', 'training', 'rivalry', 'team', 'match'],
  romance: ['romance', 'romantic', 'love', 'relationship', 'dating'],
  sliceOfLife: ['slice of life', 'school', 'daily life', 'cozy', 'relaxing', 'chill'],
  mecha: ['mecha', 'robot', 'gundam', 'pilot']
};

function itemTitle(item = {}) {
  return item.officialTitle || item.title || item.name || 'Unknown title';
}

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

export function evidenceForDimension(library = [], dimension) {
  const keywords = DIMENSION_KEYWORDS[dimension] || [];
  const evidence = [];

  for (const item of library || []) {
    const text = itemText(item);
    const matched = keywords.filter((keyword) => text.includes(normalizeText(keyword)));
    if (!matched.length) continue;

    const status = String(item.status || '').toLowerCase();
    const rating = Number(item.joeScore || item.score || item.finalScore || 0);
    const rewatches = Number(item.rewatches || 0);
    let weight = matched.length;

    if (status === 'completed') weight += 2;
    if (status === 'watching') weight += 1;
    if (rating >= 8) weight += 2;
    if (rating >= 9) weight += 2;
    if (rewatches > 0) weight += Math.min(4, rewatches * 2);
    if (item.favorite) weight += 3;
    if (status === 'dropped') weight -= 3;

    evidence.push({
      title: itemTitle(item),
      matchedKeywords: matched.slice(0, 5),
      status: item.status || '',
      rating: rating || null,
      rewatches,
      favorite: Boolean(item.favorite),
      weight: Math.max(1, weight)
    });
  }

  return evidence.sort((a, b) => b.weight - a.weight).slice(0, 8);
}

export function buildEvidenceMap(library = [], dimensions = []) {
  return Object.fromEntries(dimensions.map((dimension) => [dimension, evidenceForDimension(library, dimension)]));
}
