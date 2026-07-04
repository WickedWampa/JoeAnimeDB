import { getVibeRegistry, VIBE_KEY_LIST } from './vibeGenome';

function norm(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const QUERY_TO_VIBE = {
  comedy: ['funny', 'comedy', 'laugh', 'hilarious', 'jokes'],
  cozy: ['cozy', 'comfort', 'comforting', 'relaxing', 'chill'],
  dark: ['dark', 'violent', 'brutal', 'gory', 'gritty'],
  psychological: ['mind games', 'psychological', 'genius', 'manipulation', 'thriller'],
  cyberpunk: ['cyberpunk', 'ai', 'robot', 'robots', 'sci fi', 'sci-fi'],
  romance: ['romance', 'love', 'relationship', 'dating'],
  spicy: ['spicy', 'ecchi', 'flirty', 'teasing', 'fanservice'],
  wholesome: ['wholesome', 'sweet', 'heartwarming'],
  emotional: ['sad', 'cry', 'emotional', 'tearjerker', 'heartbreaking'],
  action: ['action', 'fight', 'battle', 'combat'],
  fantasy: ['fantasy', 'magic', 'isekai', 'dungeon'],
  mastery: ['mastery', 'training', 'sports', 'competition', 'rivalry', 'underdog'],
  mystery: ['mystery', 'detective', 'investigation', 'conspiracy'],
  chaos: ['chaos', 'unhinged', 'wild', 'weird', 'bizarre'],
  horror: ['horror', 'scary', 'creepy', 'curse', 'vampire', 'paranoia', 'dread', 'unsettling']
};

export function buildTraitMix(question = '') {
  const q = norm(question);
  const mix = {};

  for (const [vibe, words] of Object.entries(QUERY_TO_VIBE)) {
    if (words.some((word) => q.includes(norm(word)))) {
      mix[vibe] = 10;
    }
  }

  // Natural phrase upgrades.
  if (q.includes('make me cry')) mix.emotional = 10;
  if (q.includes('mind games')) mix.psychological = 10;
  if (q.includes('spicy but wholesome') || q.includes('wholesome but spicy')) {
    mix.spicy = 10;
    mix.wholesome = 10;
    mix.romance = Math.max(mix.romance || 0, 7);
  }

  return mix;
}

export function hasTraitMix(question = '') {
  return Object.keys(buildTraitMix(question)).length > 0;
}

function scoreVibes(cardVibes = {}, target = {}) {
  let score = 0;
  const reasons = [];

  for (const [vibe, desired] of Object.entries(target)) {
    const actual = cardVibes[vibe] || 0;
    if (actual > 0) {
      score += Math.min(actual, desired);
      reasons.push(`${vibe} ${actual}/10`);
    } else {
      score -= 2;
    }
  }

  return { score, reasons };
}

function title(card = {}) {
  return card.titles?.[0] || card.id || 'Unknown title';
}

function formatResult(entry, index) {
  const percent = Math.max(70, Math.min(99, Math.round(68 + entry.score * 3)));
  return [
    `${index + 1}. ${title(entry.card)} — ${percent}% vibe match`,
    `   • ${entry.card.signature || entry.card.coreFantasy || 'Strong vibe match.'}`,
    entry.reasons.length ? `   • Vibe fit: ${entry.reasons.slice(0, 5).join(', ')}.` : ''
  ].filter(Boolean).join('\n');
}

export function maybeTraitMixerRecommendation(question = '', { limit = 8 } = {}) {
  const target = buildTraitMix(question);
  const keys = Object.keys(target);
  if (!keys.length) return null;

  const scored = getVibeRegistry()
    .map(({ card, vibes }) => ({ card, vibes, ...scoreVibes(vibes, target) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (!scored.length) return null;

  return [
    `🧬 JoeAI Trait Mixer`,
    '',
    `I heard more than a genre. I heard: ${keys.join(' + ')}.`,
    '',
    scored.map(formatResult).join('\n\n')
  ].join('\n');
}

export { VIBE_KEY_LIST };
