import { ACTIVE_GENOME_REGISTRY } from './genome/genomeRegistry';

function norm(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const INTENTS = [
  {
    id: 'funny',
    label: 'Funny / Comedy',
    patterns: ['funny', 'comedy', 'make me laugh', 'hilarious', 'stupid funny', 'absurd'],
    traits: ['comedy', 'funny', 'absurd', 'parody', 'sketch comedy', 'reaction comedy', 'chaos', 'school comedy']
  },
  {
    id: 'comforting',
    label: 'Comfort / Cozy',
    patterns: ['comforting', 'comfort', 'cozy', 'relaxing', 'chill', 'wholesome', 'feel good'],
    traits: ['comfort', 'comforting', 'warm', 'relaxation', 'healing', 'friendship', 'daily life', 'nature', 'kindness']
  },
  {
    id: 'mind_games',
    label: 'Mind Games',
    patterns: ['mind games', 'smart', 'psychological', 'genius', 'manipulation', 'strategy', 'thriller'],
    traits: ['mind games', 'psychological', 'manipulation', 'strategy', 'mystery', 'pressure', 'paranoia', 'deduction']
  },
  {
    id: 'make_me_cry',
    label: 'Emotional Damage',
    patterns: ['make me cry', 'sad', 'depressing', 'emotional', 'tearjerker', 'heartbreaking'],
    traits: ['grief', 'loss', 'bittersweet', 'emotional', 'tragic', 'healing', 'family', 'trauma']
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk / Sci-Fi',
    patterns: ['cyberpunk', 'sci fi', 'sci-fi', 'philosophical sci fi', 'ai', 'robots'],
    traits: ['cyberpunk', 'AI ethics', 'identity philosophy', 'technology', 'consciousness', 'surveillance', 'robot']
  },
  {
    id: 'sports_mastery',
    label: 'Sports / Mastery',
    patterns: ['sports', 'competition', 'mastery', 'training', 'underdog', 'rivalry'],
    traits: ['mastery', 'competition', 'self improvement', 'discipline', 'rivalries', 'earning victory', 'growth']
  },
  {
    id: 'dark',
    label: 'Dark / Violent',
    patterns: ['dark', 'violent', 'brutal', 'gory', 'gritty'],
    traits: ['dark', 'violent', 'brutal', 'gore', 'survival', 'trauma', 'moral grayness']
  }
];

function textForCard(card = {}) {
  return [
    card.domain,
    card.subdomain,
    card.signature,
    card.coreFantasy,
    ...(card.viewerMotivations || []),
    ...(card.chasing || []),
    ...(card.themes || []),
    ...(card.mood || []),
    ...(card.emotionalProfile || []),
    ...(card.atmosphere || [])
  ].filter(Boolean).join(' ');
}

function detectIntent(question = '') {
  const q = norm(question);
  return INTENTS.find((intent) => intent.patterns.some((pattern) => q.includes(norm(pattern)))) || null;
}

function scoreCardForIntent(card, intent) {
  const haystack = norm(textForCard(card));
  let score = 0;
  const reasons = [];

  for (const trait of intent.traits) {
    const t = norm(trait);
    if (haystack.includes(t)) {
      score += 1;
      reasons.push(trait);
    }
  }

  const domain = norm(card.domain);
  if (intent.id === 'funny' && domain.includes('comedy')) score += 3;
  if (intent.id === 'comforting' && (domain.includes('slice') || haystack.includes('comfort'))) score += 3;
  if (intent.id === 'mind_games' && (domain.includes('psychological') || haystack.includes('mind games'))) score += 3;
  if (intent.id === 'sports_mastery' && domain.includes('sports')) score += 3;
  if (intent.id === 'cyberpunk' && (domain.includes('cyberpunk') || domain.includes('sci'))) score += 3;

  return { score, reasons };
}

function formatCard(card, index, scored) {
  const title = card.titles?.[0] || card.id;
  const percent = Math.min(98, Math.max(72, 70 + scored.score * 4));
  const why = card.signature || card.coreFantasy || 'Strong Genome match.';

  return [
    `${index + 1}. ${title} — ${percent}% intent match`,
    `   • ${why}`,
    scored.reasons?.length ? `   • Matched on: ${scored.reasons.slice(0, 5).join(', ')}.` : ''
  ].filter(Boolean).join('\n');
}

export function maybeGenomeIntentRecommendation(question = '', { limit = 8 } = {}) {
  const intent = detectIntent(question);
  if (!intent) return null;

  const scored = ACTIVE_GENOME_REGISTRY
    .map((card) => ({ card, ...scoreCardForIntent(card, intent) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (!scored.length) return null;

  return [
    `🧠 JoeAI Intent Mode: ${intent.label}`,
    '',
    `I heard the vibe, not just a title. Matching your request against the Anime Genome.`,
    '',
    scored.map((entry, index) => formatCard(entry.card, index, entry)).join('\n\n')
  ].join('\n');
}
