// Sprint 5 Phase 1: Anime Genome Cards
// Identity-first anime matching. Genres are supporting metadata, not the main signal.

import { CORE100_GENOME_CARDS } from './core100/core100GenomePack';

export const GENOME_VERSION = '0.1.0';

export const GENOME_CARDS = [
  ...CORE100_GENOME_CARDS,
  {
    id: 'initial-d',
    titles: ['Initial D', 'Initial D First Stage'],
    franchiseId: 'initial-d',
    domain: 'motorsports',
    subdomain: 'street racing',
    setting: ['mountain roads', 'night driving', 'Japanese street racing'],
    mood: ['focused', 'cool', 'adrenaline', 'technical'],
    atmosphere: ['late night', 'asphalt', 'eurobeat', 'underground racing'],
    themes: ['mastery', 'quiet confidence', 'rival progression', 'technical skill', 'obsession'],
    characterArchetypes: ['quiet prodigy', 'rivals who teach lessons'],
    musicIdentity: ['eurobeat'],
    pacing: 'rival escalation',
    mustMatchDomains: ['motorsports', 'racing'],
    avoidDomains: ['soccer', 'volleyball', 'basketball', 'figure skating', 'baseball'],
    successors: ['mf-ghost', 'wangan-midnight', 'capeta', 'overtake', 'redline'],
    note: 'Initial D is about mastery, quiet confidence, and technical street racing — not generic sports.'
  },
  {
    id: 'dorohedoro',
    titles: ['Dorohedoro'],
    franchiseId: 'dorohedoro',
    domain: 'dark fantasy',
    subdomain: 'urban body horror',
    setting: ['Hole', 'sorcerer world', 'grimy city'],
    mood: ['chaotic', 'violent', 'funny', 'gross', 'weird'],
    atmosphere: ['dirty', 'punk', 'surreal', 'lawless'],
    themes: ['identity mystery', 'found family', 'moral grayness', 'survival'],
    characterArchetypes: ['adult weirdos', 'lovable lunatics', 'dangerous friends'],
    musicIdentity: ['industrial', 'punk energy'],
    pacing: 'episodic chaos with mystery escalation',
    mustMatchDomains: ['dark fantasy', 'urban fantasy', 'body horror', 'chaos'],
    avoidDomains: ['clean heroic fantasy', 'generic isekai'],
    successors: ['chainsaw-man', 'golden-kamuy', 'blood-blockade-battlefront', 'hells-paradise', 'made-in-abyss'],
    note: 'Dorohedoro is about grimy world texture, absurd comedy, violence, and bizarre adult chaos.'
  },
  {
    id: 'bleach',
    titles: ['Bleach', 'Bleach TYBW', 'Bleach Thousand-Year Blood War'],
    franchiseId: 'bleach',
    domain: 'supernatural battle shonen',
    subdomain: 'sword-based spirit combat',
    setting: ['modern Japan', 'Soul Society', 'spirit worlds'],
    mood: ['stylish', 'heroic', 'cool', 'hype', 'emotional'],
    atmosphere: ['drip', 'spiritual warfare', 'power reveals'],
    themes: ['loyalty', 'identity', 'protecting friends', 'power escalation'],
    characterArchetypes: ['reluctant protector', 'iconic rivals', 'stylish villains'],
    musicIdentity: ['hype battle soundtrack'],
    pacing: 'arc-based power escalation',
    mustMatchDomains: ['supernatural action', 'battle shonen'],
    avoidDomains: ['slow slice of life'],
    successors: ['jujutsu-kaisen', 'black-clover', 'demon-slayer', 'hells-paradise', 'chainsaw-man'],
    note: 'Bleach is style, supernatural sword combat, power reveals, and cool factor.'
  },
  {
    id: 'frieren',
    titles: ['Frieren', "Frieren: Beyond Journey's End", 'Sousou no Frieren'],
    franchiseId: 'frieren',
    domain: 'melancholy fantasy',
    subdomain: 'reflective travel fantasy',
    setting: ['post-adventure world', 'fantasy towns', 'quiet roads'],
    mood: ['quiet', 'beautiful', 'melancholy', 'reflective', 'peaceful'],
    atmosphere: ['soft magic', 'memory', 'passing time'],
    themes: ['grief', 'time', 'friendship', 'healing', 'legacy'],
    characterArchetypes: ['immortal wanderer', 'student companion', 'found family'],
    musicIdentity: ['gentle orchestral fantasy'],
    pacing: 'slow reflective journey',
    mustMatchDomains: ['fantasy', 'emotional drama'],
    avoidDomains: ['nonstop battle shonen'],
    successors: ['violet-evergarden', 'ancient-magus-bride', 'mushoku-tensei', 'made-in-abyss'],
    note: 'Frieren is about memory, grief, and the emotional weight of time.'
  }
];

function norm(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function findGenomeCard(animeOrTitle = '') {
  const text = typeof animeOrTitle === 'string'
    ? norm(animeOrTitle)
    : norm([animeOrTitle.title, animeOrTitle.officialTitle, animeOrTitle.japaneseTitle, ...(animeOrTitle.titleSynonyms || [])].filter(Boolean).join(' '));

  return GENOME_CARDS.find((card) =>
    card.id === text ||
    text.includes(norm(card.id)) ||
    card.titles.some((title) => text.includes(norm(title)) || norm(title).includes(text))
  ) || null;
}

export function enrichWithGenome(anime = {}) {
  const card = findGenomeCard(anime);
  if (!card) return { ...anime, genomeId: anime.genomeId || null, genomeVersion: anime.genomeVersion || null };

  return {
    ...anime,
    genomeId: card.id,
    genomeVersion: GENOME_VERSION,
    franchiseId: anime.franchiseId || card.franchiseId,
    genomeDomain: card.domain,
    genomeSubdomain: card.subdomain,
    genomeMood: card.mood,
    genomeThemes: card.themes
  };
}
