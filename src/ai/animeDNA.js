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

const GENRE_WEIGHTS = {
  Action: { action: 7, violence: 3 },
  Adventure: { adventure: 8, worldbuilding: 4 },
  Comedy: { comedy: 8 },
  Fantasy: { fantasy: 8, worldbuilding: 3 },
  Horror: { horror: 9, darkness: 7, mystery: 3 },
  Mystery: { mystery: 9, mindGames: 4 },
  Supernatural: { supernatural: 8, mystery: 2 },
  SciFi: { sciFi: 8, worldbuilding: 3 },
  'Sci-Fi': { sciFi: 8, worldbuilding: 3 },
  Psychological: { mindGames: 9, darkness: 5, mystery: 5 },
  Thriller: { mystery: 6, darkness: 5, mindGames: 4 },
  Drama: { emotion: 8 },
  Romance: { romance: 8, emotion: 4 },
  'Slice of Life': { sliceOfLife: 8, wholesome: 5 },
  Sports: { sports: 9, strategy: 4 },
  Music: { music: 9, emotion: 3 },
  Military: { military: 8, politics: 5, strategy: 5 },
  Mecha: { sciFi: 6, action: 5, military: 4 },
  Gore: { violence: 9, horror: 5, darkness: 5, bodyHorror: 5 },
  Seinen: { darkness: 3, politics: 2, violence: 2, adultCast: 2 },
  Shounen: { action: 4, adventure: 4, powerFantasy: 4, foundFamily: 3 },
  Isekai: { fantasy: 7, adventure: 5, powerFantasy: 5, worldbuilding: 4 }
};

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

  for (const genre of anime.genres || []) {
    if (GENRE_WEIGHTS[genre]) addWeights(dna, GENRE_WEIGHTS[genre], preset ? 0.35 : 0.85);
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
