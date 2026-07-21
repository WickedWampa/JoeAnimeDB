// Sprint 4 Phase 3: Better Anime DNA
// Explainable vibe traits for similarity recommendations.

export const DNA_KEYS = [
  'darkness',
  'comedy',
  'violence',
  'mystery',
  'worldbuilding',
  'powerFantasy',
  'strategy',
  'emotion',
  'weirdness',
  'action',
  'adventure',
  'horror',
  'romance',
  'sciFi',
  'fantasy',
  'supernatural',
  'music',
  'wholesome',
  'sports',
  'sliceOfLife',
  'politics',
  'crime',
  'military',
  'mindGames',
  'foundFamily',
  'gritty',
  'chaos',
  'adultCast',
  'bodyHorror',
  'moralGray',
  'ensembleCast',
  'punkEnergy'
];

const PRESETS = {
  dorohedoro: {
    darkness: 10, comedy: 8, violence: 10, mystery: 8, worldbuilding: 9,
    weirdness: 10, action: 8, horror: 7, fantasy: 8, supernatural: 8,
    crime: 7, gritty: 10, chaos: 10, adultCast: 8, bodyHorror: 10,
    moralGray: 9, ensembleCast: 8, punkEnergy: 10, music: 8
  },
  'chainsaw man': {
    darkness: 9, comedy: 6, violence: 10, weirdness: 8, horror: 8,
    action: 9, supernatural: 9, emotion: 7, romance: 3, bodyHorror: 9,
    chaos: 8, moralGray: 8, gritty: 7, adultCast: 6, punkEnergy: 8
  },
  'golden kamuy': {
    darkness: 7, comedy: 8, violence: 8, worldbuilding: 9, adventure: 8,
    action: 7, weirdness: 8, emotion: 7, foundFamily: 7, gritty: 8,
    adultCast: 9, moralGray: 7, ensembleCast: 9, chaos: 7
  },
  'hells paradise': {
    darkness: 8, violence: 9, mystery: 7, worldbuilding: 7, action: 9,
    fantasy: 8, supernatural: 8, horror: 6, bodyHorror: 6, moralGray: 7
  },
  "hell's paradise": {
    darkness: 8, violence: 9, mystery: 7, worldbuilding: 7, action: 9,
    fantasy: 8, supernatural: 8, horror: 6, bodyHorror: 6, moralGray: 7
  },
  'made in abyss': {
    darkness: 10, adventure: 9, worldbuilding: 10, emotion: 9, horror: 8,
    mystery: 8, fantasy: 9, violence: 7, wholesome: 3, bodyHorror: 7,
    moralGray: 7
  },
  berserk: {
    darkness: 10, violence: 10, horror: 8, fantasy: 7, emotion: 8,
    worldbuilding: 8, gritty: 10, moralGray: 10, adultCast: 9
  },
  bleach: {
    action: 10, adventure: 8, supernatural: 10, fantasy: 8, powerFantasy: 9,
    emotion: 8, foundFamily: 8, darkness: 6, comedy: 5, music: 9, violence: 7
  },
  'initial d': {
    sports: 9, action: 7, strategy: 8, music: 10, emotion: 6,
    sliceOfLife: 5, adventure: 4, comedy: 3
  },
  'one piece': {
    adventure: 10, comedy: 8, worldbuilding: 10, emotion: 9, action: 8,
    foundFamily: 10, fantasy: 7, darkness: 4, politics: 7, ensembleCast: 10
  }
};

const SIGNAL_RULES = [
  // Broad genres
  [/\baction\b|martial arts?|combat|battle|super power/, { action: 7, violence: 3, powerFantasy: 2 }],
  [/\badventure\b|journey|exploration|travel/, { adventure: 8, worldbuilding: 4 }],
  [/\bcomedy\b|parody|gag|humou?r/, { comedy: 8, weirdness: 1 }],
  [/\bfantasy\b|fantasy world|magic|magical|swordplay|sorcer|witch|wizard/, { fantasy: 8, worldbuilding: 4, supernatural: 2 }],
  [/\bhorror\b|gore|grotesque|monster horror|vampire|zombie/, { horror: 8, darkness: 7, violence: 4, bodyHorror: 3 }],
  [/\bmystery\b|detective|investigation|crime mystery|secret/, { mystery: 9, mindGames: 4 }],
  [/supernatural|demon|devil|ghost|spirit|youkai|curse/, { supernatural: 8, mystery: 3, darkness: 2 }],
  [/sci[ -]?fi|science fiction|cyberpunk|space|robot|android|future/, { sciFi: 8, worldbuilding: 4 }],
  [/psychological|mind game|manipulation|death game/, { mindGames: 9, darkness: 5, mystery: 5 }],
  [/thriller|suspense|survival/, { mystery: 6, darkness: 5, mindGames: 4 }],
  [/\bdrama\b|tragedy|coming of age/, { emotion: 8 }],
  [/romance|love triangle|romantic/, { romance: 8, emotion: 4 }],
  [/slice of life|school life|daily life|iyashikei/, { sliceOfLife: 8, wholesome: 5 }],
  [/sports?|racing|boxing|football|basketball|volleyball/, { sports: 9, strategy: 4, action: 2 }],
  [/music|band|idol|singing/, { music: 9, emotion: 3 }],

  // Kitsu-style categories and descriptive signals
  [/military|army|warfare|soldier|navy|air force/, { military: 8, politics: 5, strategy: 5, action: 2 }],
  [/politic|government|royal|kingdom|empire|revolution|class conflict/, { politics: 8, strategy: 4, worldbuilding: 3 }],
  [/mecha|giant robot/, { sciFi: 6, action: 5, military: 4 }],
  [/isekai|another world|reincarnation|transported/, { fantasy: 7, adventure: 5, powerFantasy: 5, worldbuilding: 5 }],
  [/plot continuity|long form|serialized|epic/, { worldbuilding: 6, adventure: 3, emotion: 2 }],
  [/found family|friendship|nakama|guild|crew|teamwork/, { foundFamily: 8, ensembleCast: 4, emotion: 3 }],
  [/ensemble cast|large cast|multiple protagonists/, { ensembleCast: 8, worldbuilding: 2 }],
  [/adult cast|workplace|mature cast/, { adultCast: 8, sliceOfLife: 2 }],
  [/crime|mafia|gang|criminal|heist|underworld/, { crime: 8, gritty: 5, moralGray: 4 }],
  [/revenge|antihero|morally gray|moral ambiguity/, { moralGray: 7, darkness: 4, emotion: 3 }],
  [/body horror|mutation|flesh|parasite/, { bodyHorror: 9, horror: 6, violence: 4 }],
  [/punk|rebellion|counterculture/, { punkEnergy: 8, chaos: 4 }],
  [/weird|bizarre|surreal|absurd|experimental/, { weirdness: 8, chaos: 4 }],
  [/chaos|anarchy|madness/, { chaos: 8, weirdness: 3 }],
  [/wholesome|healing|family friendly|feel good/, { wholesome: 8, emotion: 3 }],
  [/strategy|tactical|mind battle|board game|gambling/, { strategy: 8, mindGames: 5 }],
  [/overpowered|strongest|leveling|power progression|game world/, { powerFantasy: 8, action: 3, adventure: 2 }],
  [/historical|samurai|feudal|edo|ancient|medieval/, { worldbuilding: 5, adventure: 3, politics: 2 }],
  [/earth|asia|japan|europe|urban|city/, { worldbuilding: 2 }]
];

function weightsForSignal(signal = '') {
  const normalized = norm(signal);
  const weights = {};

  for (const [pattern, ruleWeights] of SIGNAL_RULES) {
    if (!pattern.test(normalized)) continue;

    for (const [key, value] of Object.entries(ruleWeights)) {
      weights[key] = Number(weights[key] || 0) + Number(value || 0);
    }
  }

  return weights;
}

function emptyDna() {
  return Object.fromEntries(DNA_KEYS.map((key) => [key, 0]));
}

function norm(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function clampDna(dna) {
  const next = emptyDna();
  for (const key of Object.keys(next)) {
    next[key] = Math.max(0, Math.min(10, Number(dna[key] || 0)));
  }
  return next;
}

function addWeights(dna, weights = {}, amount = 1) {
  for (const [key, value] of Object.entries(weights)) {
    if (key in dna) dna[key] += Number(value || 0) * amount;
  }
}

function titlePreset(anime = {}) {
  const title = norm(`${anime.title || ''} ${anime.officialTitle || ''}`);
  for (const [needle, dna] of Object.entries(PRESETS)) {
    if (title.includes(needle)) return dna;
  }
  return null;
}

export function buildAnimeDNA(anime = {}) {
  const dna = emptyDna();

  const preset = titlePreset(anime);
  if (preset) addWeights(dna, preset, 1);

  for (const signal of anime.genres || []) {
    const weights = weightsForSignal(signal);
    if (Object.keys(weights).length) {
      addWeights(dna, weights, preset ? 0.35 : 0.85);
    }
  }

  const text = norm([anime.title, anime.officialTitle, anime.synopsis, anime.studio, ...(anime.genres || [])].join(' '));

  const keywordRules = [
    [/dark|demon|devil|hell|death|blood|curse|revenge|ghoul/, { darkness: 2, violence: 1 }],
    [/weird|strange|bizarre|chaos|madness|absurd|surreal|insane/, { weirdness: 3, chaos: 2 }],
    [/gritty|dirty|slum|underground|criminal|crime|mafia|gang/, { gritty: 3, crime: 2, moralGray: 1 }],
    [/body|mutation|monster|flesh|gore|grotesque/, { bodyHorror: 3, horror: 2, violence: 1 }],
    [/magic|wizard|witch|sorcer|spell/, { fantasy: 2, supernatural: 2 }],
    [/detective|case|murder|mystery|secret/, { mystery: 3, mindGames: 1 }],
    [/war|army|military|empire|kingdom|politic/, { military: 2, politics: 2, strategy: 1 }],
    [/family|friends|crew|guild|team|cast/, { foundFamily: 2, ensembleCast: 1 }],
    [/race|racing|car|sports|game|match/, { sports: 2, strategy: 1 }],
    [/music|band|song|guitar|idol|soundtrack/, { music: 3 }],
    [/space|robot|future|cyber|sci fi|sci-fi/, { sciFi: 3, worldbuilding: 1 }],
    [/overpower|level|skill|hero|strongest/, { powerFantasy: 3, action: 1 }]
  ];

  for (const [regex, weights] of keywordRules) {
    if (regex.test(text)) addWeights(dna, weights, preset ? 0.5 : 1);
  }

  return clampDna(dna);
}

export function dnaSimilarity(a = {}, b = {}) {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (const key of DNA_KEYS) {
    const av = Number(a[key] || 0);
    const bv = Number(b[key] || 0);
    dot += av * bv;
    magA += av * av;
    magB += bv * bv;
  }

  if (!magA || !magB) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function topDnaTraits(dna = {}, limit = 6) {
  return Object.entries(dna)
    .filter(([, value]) => Number(value) > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, value]) => ({ key, value: Math.round(value) }));
}

export function labelTrait(key = '') {
  const labels = {
    powerFantasy: 'Power Fantasy',
    mindGames: 'Mind Games',
    foundFamily: 'Found Family',
    sliceOfLife: 'Slice of Life',
    bodyHorror: 'Body Horror',
    moralGray: 'Moral Gray',
    adultCast: 'Adult Cast',
    ensembleCast: 'Ensemble Cast',
    punkEnergy: 'Punk Energy',
    worldbuilding: 'Worldbuilding',
    sciFi: 'Sci-Fi'
  };

  return labels[key] || String(key).replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}
