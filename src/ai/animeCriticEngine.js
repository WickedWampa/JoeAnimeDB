import { buildAnimeDNA, dnaSimilarity, topDnaTraits, labelTrait } from './animeDNA';

const PERSONALITY_PRESETS = {
  dorohedoro: {
    feel: ['chaotic', 'grimy', 'violent', 'weirdly funny', 'punk', 'unpredictable'],
    summary: 'Dorohedoro works because it mixes brutal violence, absurd comedy, grimy worldbuilding, and complete lunatic energy without losing its heart.',
    bestFor: 'weird adult fantasy with gore, comedy, and a dirty lived-in world',
    avoidIf: 'you want clean heroic fantasy or traditional shonen structure'
  },
  bleach: {
    feel: ['stylish', 'heroic', 'emotional', 'supernatural', 'cool', 'battle-driven'],
    summary: 'Bleach is stylish supernatural action with huge power fantasy energy, memorable characters, and a strong sense of cool.',
    bestFor: 'big battles, iconic powers, stylish characters, and long-form shonen growth',
    avoidIf: 'you want grounded realism or short tight storytelling'
  },
  'chainsaw man': {
    feel: ['chaotic', 'violent', 'darkly funny', 'tragic', 'unhinged'],
    summary: 'Chainsaw Man has the same “what the hell am I watching?” energy: violent, funny, sad, gross, and weirdly human.',
    bestFor: 'dark comedy, devils, violence, and messy characters',
    avoidIf: 'you dislike crude humor or sudden emotional gut punches'
  },
  'golden kamuy': {
    feel: ['bizarre', 'violent', 'funny', 'adventurous', 'adult', 'ensemble-driven'],
    summary: 'Golden Kamuy is one of the closest Dorohedoro-style picks because it blends brutal violence, bizarre comedy, and a cast full of absolute maniacs.',
    bestFor: 'weird humor, adult casts, survival adventure, and violent treasure hunting',
    avoidIf: 'you want sleek modern fantasy instead of historical chaos'
  },
  frieren: {
    feel: ['quiet', 'beautiful', 'melancholy', 'reflective', 'peaceful', 'emotional'],
    summary: 'Frieren is not about constant action. It is about memory, time, grief, friendship, and making quiet moments matter.',
    bestFor: 'beautiful emotional fantasy and reflective storytelling',
    avoidIf: 'you need nonstop battles'
  },
  'initial d': {
    feel: ['focused', 'competitive', 'adrenaline-driven', 'nostalgic', 'cool', 'music-heavy'],
    summary: 'Initial D is pure focused adrenaline: racing, rivalry, eurobeat, and the satisfaction of watching skill beat raw power.',
    bestFor: 'competition, cars, music, and underdog skill progression',
    avoidIf: 'you need fantasy stakes or supernatural powers'
  },
  'made in abyss': {
    feel: ['beautiful', 'horrifying', 'mysterious', 'adventurous', 'tragic', 'dangerous'],
    summary: 'Made in Abyss looks cute, then quietly destroys you with mystery, body horror, and terrifying worldbuilding.',
    bestFor: 'dark adventure, mystery, and beautiful-but-horrifying fantasy worlds',
    avoidIf: 'you are not in the mood for heavy disturbing material'
  },
  berserk: {
    feel: ['brutal', 'tragic', 'dark', 'epic', 'violent', 'morally gray'],
    summary: 'Berserk is pure dark fantasy brutality: tragic, violent, morally gray, and emotionally heavy.',
    bestFor: 'grim dark fantasy and tragedy',
    avoidIf: 'you specifically want Dorohedoro’s comedy and weirdness'
  },
  'blood blockade battlefront': {
    feel: ['chaotic', 'urban', 'stylish', 'weird', 'fun', 'music-heavy'],
    summary: 'Blood Blockade Battlefront has chaotic city energy, monsters everywhere, stylish action, and a killer soundtrack.',
    bestFor: 'urban supernatural chaos and stylish ensemble action',
    avoidIf: 'you want a darker, dirtier, more violent tone'
  }
};

function norm(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findPreset(anime = {}) {
  const title = norm(`${anime.title || ''} ${anime.officialTitle || ''}`);
  for (const [needle, profile] of Object.entries(PERSONALITY_PRESETS)) {
    if (title.includes(needle)) return profile;
  }
  return null;
}

function genericProfile(anime = {}) {
  const dna = buildAnimeDNA(anime);
  const traits = topDnaTraits(dna, 6).map((trait) => labelTrait(trait.key).toLowerCase());
  const title = anime.title || 'This anime';

  return {
    feel: traits,
    summary: `${title} seems strongest in ${traits.slice(0, 4).join(', ') || 'general anime appeal'}.`,
    bestFor: traits.length ? traits.join(', ') : 'general anime watching',
    avoidIf: 'you want something with a very specific mood that does not match these traits'
  };
}

export function criticProfile(anime = {}) {
  return findPreset(anime) || genericProfile(anime);
}

function overlap(sourceProfile, candidateProfile) {
  const source = new Set(sourceProfile.feel || []);
  return (candidateProfile.feel || []).filter((trait) => source.has(trait));
}

function meta(item = {}) {
  return [
    item.year,
    item.studio,
    item.episodeCount ? `${item.episodeCount} eps` : null,
    item.communityScore ? `MAL ${item.communityScore}` : null
  ].filter(Boolean).join(' · ');
}

function humanMatch(source, candidate, reasons, score) {
  const sourceProfile = criticProfile(source);
  const candidateProfile = criticProfile(candidate);
  const sharedFeel = overlap(sourceProfile, candidateProfile);
  const pct = Math.round(score * 100);

  let verdict = 'Solid match.';
  if (score >= 0.82) verdict = 'Closest match.';
  else if (score >= 0.72) verdict = 'Strong match.';
  else if (score >= 0.62) verdict = 'Good match.';
  else if (score < 0.55) verdict = 'Maybe, but not perfect.';

  const why = [];

  if (sharedFeel.length) why.push(`Same ${sharedFeel.slice(0, 3).join(', ')} energy.`);
  if (reasons?.length) why.push(`Shared DNA: ${reasons.slice(0, 4).join(', ')}.`);
  if (candidateProfile.summary) why.push(candidateProfile.summary);

  return {
    pct,
    verdict,
    why: why.slice(0, 3),
    warning: candidateProfile.avoidIf
  };
}

function formatCriticEntry(source, entry, index) {
  const { item, match, reasons } = entry;
  const critique = humanMatch(source, item, reasons, match);
  const info = meta(item);

  return [
    `${index + 1}. ${item.title} — ${critique.pct}% · ${critique.verdict}${info ? ` (${info})` : ''}`,
    ...critique.why.map((line) => `   • ${line}`),
    critique.warning ? `   • Skip if: ${critique.warning}.` : ''
  ].filter(Boolean).join('\n');
}

export function buildCriticRecommendationText({ source, inLibrary = [], discoveries = [] }) {
  const sourceProfile = criticProfile(source);

  const parts = [
    `🎭 JoeAI Critic Mode: ${source.title}`,
    '',
    sourceProfile.summary,
    '',
    `Vibe: ${(sourceProfile.feel || []).join(', ')}`,
    ''
  ];

  if (inLibrary.length) {
    parts.push('Already in your library:');
    parts.push('');
    parts.push(inLibrary.map((entry, index) => formatCriticEntry(source, entry, index)).join('\n\n'));
    parts.push('');
  }

  if (discoveries.length) {
    parts.push('New discoveries:');
    parts.push('');
    parts.push(discoveries.map((entry, index) => formatCriticEntry(source, entry, index)).join('\n\n'));
    parts.push('');
  }

  if (!inLibrary.length && !discoveries.length) {
    parts.push('I found the source, but I need more catalog matches before I can give strong recommendations.');
  }

  return parts.filter((part) => part !== '').join('\n');
}

export function criticExplainAnime(anime = {}) {
  const profile = criticProfile(anime);
  return [
    `🎭 ${anime.title}`,
    '',
    profile.summary,
    '',
    `Vibe: ${(profile.feel || []).join(', ')}`,
    `Best for: ${profile.bestFor}`,
    `Skip if: ${profile.avoidIf}`
  ].join('\n');
}
