import { ACTIVE_GENOME_REGISTRY } from '../genome/genomeRegistry';

function norm(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const VIBE_KEYWORDS = {
  comedy: ['comedy', 'funny', 'hilarious', 'laugh', 'absurd', 'parody', 'gag'],
  cozy: ['cozy', 'comfort', 'comforting', 'relaxing', 'chill', 'wholesome', 'healing', 'warm'],
  dark: ['dark', 'violent', 'brutal', 'gory', 'gritty', 'bleak', 'despair'],
  psychological: ['psychological', 'mind games', 'genius', 'manipulation', 'paranoia', 'thriller'],
  cyberpunk: ['cyberpunk', 'ai', 'robot', 'robots', 'sci fi', 'sci-fi', 'surveillance', 'technology'],
  romance: ['romance', 'love', 'relationship', 'couple', 'dating'],
  spicy: ['spicy', 'ecchi', 'flirty', 'teasing', 'fanservice', 'horny'],
  wholesome: ['wholesome', 'sweet', 'heartwarming', 'innocent', 'cute'],
  emotional: ['sad', 'cry', 'emotional', 'tearjerker', 'heartbreaking', 'bittersweet', 'grief'],
  action: ['action', 'fight', 'fights', 'battle', 'combat'],
  fantasy: ['fantasy', 'magic', 'dungeon', 'kingdom', 'isekai'],
  mastery: ['mastery', 'training', 'competition', 'sports', 'rivalry', 'underdog', 'discipline'],
  mystery: ['mystery', 'detective', 'case', 'investigation', 'conspiracy'],
  chaos: ['chaos', 'unhinged', 'wild', 'weird', 'bizarre', 'insane']
};

function cardText(card = {}) {
  return [
    card.id,
    card.domain,
    card.subdomain,
    card.signature,
    card.coreFantasy,
    ...(card.viewerMotivations || []),
    ...(card.chasing || []),
    ...(card.themes || []),
    ...(card.mood || []),
    ...(card.emotionalProfile || []),
    ...(card.atmosphere || []),
    ...(card.idealFollowUps || []),
    ...(card.antiRecommendations || [])
  ].filter(Boolean).join(' ');
}

function inferVibes(card = {}) {
  const text = norm(cardText(card));
  const vibes = {};

  for (const [vibe, keywords] of Object.entries(VIBE_KEYWORDS)) {
    let score = 0;

    for (const keyword of keywords) {
      if (text.includes(norm(keyword))) score += 2;
    }

    const domain = norm(card.domain || '');
    if (domain.includes(vibe)) score += 4;

    vibes[vibe] = Math.min(10, score);
  }

  // Domain-specific nudge rules.
  if (norm(card.domain).includes('comedy')) vibes.comedy = Math.max(vibes.comedy || 0, 8);
  if (norm(card.domain).includes('romance')) vibes.romance = Math.max(vibes.romance || 0, 8);
  if (norm(card.domain).includes('cyberpunk')) vibes.cyberpunk = Math.max(vibes.cyberpunk || 0, 9);
  if (norm(card.domain).includes('psychological')) vibes.psychological = Math.max(vibes.psychological || 0, 9);
  if (norm(card.domain).includes('sports')) vibes.mastery = Math.max(vibes.mastery || 0, 8);
  if (norm(card.domain).includes('fantasy')) vibes.fantasy = Math.max(vibes.fantasy || 0, 8);
  if (norm(card.domain).includes('horror')) vibes.horror = Math.max(vibes.horror || 0, 9);

  return vibes;
}

export function getCardVibes(card = {}) {
  return {
    ...inferVibes(card),
    ...(card.vibes || {})
  };
}

export function getVibeRegistry() {
  return ACTIVE_GENOME_REGISTRY.map((card) => ({
    card,
    vibes: getCardVibes(card)
  }));
}

export const VIBE_KEY_LIST = Object.keys(VIBE_KEYWORDS);
